/**
 * Перемещения материалов между этапами (склад → раскрой → пошив → ОТК → отгрузка).
 * Использует movement_documents / movement_document_items + проведение как у /api/warehouse/movement-docs/:id/post
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

const VALID_STAGES = ['warehouse', 'cutting', 'sewing', 'otk', 'shipment'];

const STAGE_HINTS = {
  warehouse: ['сырья', 'основной', 'склад сырья', 'склад'],
  cutting: ['раскрой'],
  sewing: ['пошив'],
  otk: ['отк', 'контрол', 'qc'],
  shipment: ['отгруз', 'готов'],
};

function toMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Списание по ФИФО: старые партии first (received_at / created_at).
 */
async function fifoDeductFromWarehouse(itemName, warehouseId, qtyToDeduct, transaction) {
  const rawName = String(itemName || '').trim();
  const baseFabric = rawName.split(/\s·\s/)[0].trim();
  if (!baseFabric || !(qtyToDeduct > 0)) {
    return { remaining: qtyToDeduct, qtyTaken: 0, valueWithdrawn: 0, meta: null };
  }

  const all = await db.WarehouseMaterial.findAll({
    where: {
      warehouse_id: warehouseId,
      qty: { [Op.gt]: 0 },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const bf = baseFabric.toLowerCase();
  const matched = all.filter((m) => {
    const mn = String(m.name).toLowerCase();
    return mn === bf || mn.includes(bf) || bf.includes(mn);
  });
  matched.sort((a, b) => {
    const ta = new Date(a.received_at || a.created_at || 0).getTime();
    const tb = new Date(b.received_at || b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (a.id || 0) - (b.id || 0);
  });

  let remaining = toMoney(qtyToDeduct);
  let valueWithdrawn = 0;
  let qtyTaken = 0;
  let meta = null;

  for (const batch of matched) {
    if (remaining <= 0) break;
    const batchQty = toMoney(batch.qty);
    const deduct = Math.min(batchQty, remaining);
    if (deduct <= 0) continue;
    const price = toMoney(batch.price);
    const newQty = toMoney(batchQty - deduct);
    const newSum = toMoney(newQty * price);
    await batch.update(
      {
        qty: newQty,
        total_sum: newSum,
      },
      { transaction }
    );
    remaining = toMoney(remaining - deduct);
    valueWithdrawn = toMoney(valueWithdrawn + deduct * price);
    qtyTaken = toMoney(qtyTaken + deduct);
    if (!meta) {
      meta = { name: batch.name, type: batch.type, unit: batch.unit };
    }
  }

  return { remaining, qtyTaken, valueWithdrawn, meta };
}

function toIntOrNaN(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

async function nextMovementDocNumber(transaction) {
  const last = await db.MovementDocument.findOne({
    order: [['id', 'DESC']],
    attributes: ['id'],
    transaction,
  });
  const nextId = (last?.id || 0) + 1;
  return `ПЭ-${String(nextId).padStart(3, '0')}`;
}

function packStageComment(meta, userNote) {
  const tag = `[stage_movement]${JSON.stringify(meta)}[/stage_movement]`;
  const note = userNote != null ? String(userNote).trim() : '';
  return note ? `${tag}\n${note}` : tag;
}

function parseStageMeta(comment) {
  const s = String(comment || '');
  const m = s.match(/^\[stage_movement\]([\s\S]*?)\[\/stage_movement\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function stripStageTag(comment) {
  return String(comment || '')
    .replace(/^\[stage_movement\][\s\S]*?\[\/stage_movement\]\s*/, '')
    .trim();
}

async function resolveWarehouseIds(fromStage, toStage) {
  const warehouses = await db.WarehouseRef.findAll({
    attributes: ['id', 'name'],
    order: [['id', 'ASC']],
  });
  if (!warehouses.length) {
    throw new Error('Нет складов в справочнике');
  }

  const lower = (s) => String(s).toLowerCase();
  function pick(stage) {
    const hints = STAGE_HINTS[stage] || [];
    for (const w of warehouses) {
      const n = lower(w.name);
      if (hints.some((h) => n.includes(h))) return w.id;
    }
    const idxMap = { warehouse: 0, cutting: 1, sewing: 2, otk: 3, shipment: 4 };
    const idx = idxMap[stage] ?? 0;
    return warehouses[idx % warehouses.length].id;
  }

  const fromId = pick(fromStage);
  const toId = pick(toStage);
  if (!fromId || !toId || fromId === toId) {
    throw new Error('Не удалось сопоставить склады для этапов — проверьте названия складов');
  }
  return { from_warehouse_id: fromId, to_warehouse_id: toId };
}

function sanitizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      item_id:
        it?.item_id != null && !Number.isNaN(toIntOrNaN(it.item_id))
          ? toIntOrNaN(it.item_id)
          : it?.id != null && !Number.isNaN(toIntOrNaN(it.id))
            ? toIntOrNaN(it.id)
            : null,
      item_name: String(it?.material_name || it?.item_name || '').trim(),
      unit: String(it?.unit || 'шт').trim().slice(0, 30),
      qty: toMoney(it?.qty),
      price: toMoney(it?.price ?? 0),
    }))
    .filter((it) => it.item_name && it.qty > 0);
}

/**
 * POST /
 */
router.post('/', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const body = req.body || {};
    const {
      order_id,
      from_stage,
      to_stage,
      date,
      note,
      items: rawItems,
      status: rawStatus,
      from_warehouse_id: bodyFromW,
      to_warehouse_id: bodyToW,
    } = body;

    const oid = order_id != null ? toIntOrNaN(order_id) : NaN;
    if (Number.isNaN(oid) || oid <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Укажите заказ (order_id)' });
    }
    if (!VALID_STAGES.includes(String(from_stage)) || !VALID_STAGES.includes(String(to_stage))) {
      await t.rollback();
      return res.status(400).json({ error: 'Некорректные этапы from_stage / to_stage' });
    }

    const optFromW = bodyFromW != null ? toIntOrNaN(bodyFromW) : NaN;
    const optToW = bodyToW != null ? toIntOrNaN(bodyToW) : NaN;
    const sameStage = String(from_stage) === String(to_stage);
    const bothWarehouseStages =
      String(from_stage) === 'warehouse' && String(to_stage) === 'warehouse';
    if (sameStage && !bothWarehouseStages) {
      await t.rollback();
      return res.status(400).json({ error: 'Этапы «откуда» и «куда» должны различаться' });
    }
    if (bothWarehouseStages) {
      if (Number.isNaN(optFromW) || optFromW <= 0 || Number.isNaN(optToW) || optToW <= 0) {
        await t.rollback();
        return res.status(400).json({
          error: 'Для перемещения между складами укажите склад отправителя и склад получателя',
        });
      }
      if (optFromW === optToW) {
        await t.rollback();
        return res.status(400).json({ error: 'Склад отправителя и получателя должны различаться' });
      }
    }

    const items = sanitizeItems(rawItems);
    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
    }

    let from_warehouse_id;
    let to_warehouse_id;
    if (bothWarehouseStages) {
      const [wf, wt] = await Promise.all([
        db.WarehouseRef.findByPk(optFromW, { transaction: t }),
        db.WarehouseRef.findByPk(optToW, { transaction: t }),
      ]);
      if (!wf || !wt) {
        await t.rollback();
        return res.status(400).json({ error: 'Указан несуществующий склад' });
      }
      from_warehouse_id = optFromW;
      to_warehouse_id = optToW;
    } else {
      const resolved = await resolveWarehouseIds(String(from_stage), String(to_stage));
      from_warehouse_id = resolved.from_warehouse_id;
      to_warehouse_id = resolved.to_warehouse_id;

      if (!Number.isNaN(optFromW) && optFromW > 0) {
        const wf = await db.WarehouseRef.findByPk(optFromW, { transaction: t });
        if (!wf) {
          await t.rollback();
          return res.status(400).json({ error: 'Указан несуществующий склад отправителя' });
        }
        from_warehouse_id = optFromW;
      }
      if (!Number.isNaN(optToW) && optToW > 0) {
        const wt = await db.WarehouseRef.findByPk(optToW, { transaction: t });
        if (!wt) {
          await t.rollback();
          return res.status(400).json({ error: 'Указан несуществующий склад получателя' });
        }
        to_warehouse_id = optToW;
      }
      if (from_warehouse_id === to_warehouse_id) {
        await t.rollback();
        return res.status(400).json({ error: 'Склад отправителя и получателя должны различаться' });
      }
    }

    const defects = {};
    for (const it of rawItems || []) {
      const name = String(it?.material_name || it?.item_name || '').trim();
      const dq = toMoney(it?.defect_qty);
      if (name && dq > 0) defects[name] = dq;
    }

    const meta = {
      order_id: oid,
      from_stage: String(from_stage),
      to_stage: String(to_stage),
      defects: Object.keys(defects).length ? defects : undefined,
    };

    const safeStatus = rawStatus === 'posted' ? 'posted' : 'draft';

    const row = await db.MovementDocument.create(
      {
        doc_number: await nextMovementDocNumber(t),
        doc_date: date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        move_type: 'materials',
        from_warehouse_id,
        to_warehouse_id,
        comment: packStageComment(meta, note),
        status: safeStatus,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    await db.MovementDocumentItem.bulkCreate(
      items.map((it) => ({ ...it, document_id: row.id })),
      { transaction: t }
    );

    await t.commit();

    const full = await db.MovementDocument.findByPk(row.id, {
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items' },
      ],
    });
    const plain = full.get({ plain: true });
    const sm = parseStageMeta(plain.comment);
    res.status(201).json({
      ...plain,
      stage_meta: sm,
      user_note: stripStageTag(plain.comment),
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * GET /
 */
router.get('/', async (req, res, next) => {
  try {
    const { order_id, from_stage, to_stage } = req.query;

    const rows = await db.MovementDocument.findAll({
      where: { move_type: 'materials' },
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items' },
      ],
      order: [['doc_date', 'DESC'], ['id', 'DESC']],
      limit: 500,
    });

    let list = rows.map((d) => {
      const plain = d.get({ plain: true });
      const sm = parseStageMeta(plain.comment);
      const items = plain.Items || [];
      const total_qty = items.reduce((s, it) => s + toMoney(it.qty), 0);
      const total_sum = items.reduce((s, it) => s + toMoney(it.qty) * toMoney(it.price), 0);
      const meta = sm || {};
      const defectQtyTotal = meta.defects
        ? Object.values(meta.defects).reduce((a, b) => a + toMoney(b), 0)
        : 0;
      return {
        ...plain,
        stage_meta: sm,
        user_note: stripStageTag(plain.comment),
        total_qty,
        total_sum,
        defect_qty_total: defectQtyTotal,
      };
    });

    list = list.filter((d) => d.stage_meta);

    if (order_id) {
      const o = toIntOrNaN(order_id);
      if (!Number.isNaN(o)) {
        list = list.filter((d) => Number(d.stage_meta?.order_id) === o);
      }
    }
    if (from_stage) {
      list = list.filter((d) => d.stage_meta?.from_stage === String(from_stage));
    }
    if (to_stage) {
      list = list.filter((d) => d.stage_meta?.to_stage === String(to_stage));
    }

    const orderIds = [...new Set(list.map((d) => d.stage_meta?.order_id).filter(Boolean))];
    const orders = orderIds.length
      ? await db.Order.findAll({
          where: { id: orderIds },
          attributes: ['id', 'tz_code', 'model_name', 'title'],
        })
      : [];
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    list = list.map((d) => {
      const oid = d.stage_meta?.order_id;
      const o = oid ? orderMap.get(Number(oid)) : null;
      return {
        ...d,
        order_label: o ? `${o.tz_code || o.title || o.id} · ${o.model_name || ''}`.trim() : '',
      };
    });

    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /:id/approve — провести документ (списание / оприходование материалов)
 */
router.put('/:id/approve', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const doc = await db.MovementDocument.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!doc) {
      await t.rollback();
      return res.status(404).json({ error: 'не найден' });
    }

    const items = await db.MovementDocumentItem.findAll({
      where: { document_id: id },
      transaction: t,
    });

    if (doc.status === 'posted') {
      await t.rollback();
      return res.status(400).json({ error: 'Документ уже проведён' });
    }
    if (doc.move_type !== 'materials') {
      await t.rollback();
      return res.status(400).json({ error: 'Только материалы' });
    }

    const meta = parseStageMeta(doc.comment);
    const orderIdForMov = meta?.order_id != null ? toIntOrNaN(meta.order_id) : null;

    const fromId = Number(doc.from_warehouse_id);
    const toId = Number(doc.to_warehouse_id);

    for (const it of items) {
      const qty = Number(it.qty || 0);
      if (!(qty > 0)) continue;

      const fifo = await fifoDeductFromWarehouse(it.item_name, fromId, qty, t);
      if (fifo.remaining > 0 || fifo.qtyTaken <= 0 || !fifo.meta) {
        await t.rollback();
        return res.status(400).json({
          error:
            fifo.remaining > 0
              ? `Недостаточно остатка для «${it.item_name}» (ФИФО: не хватает ${toMoney(fifo.remaining)})`
              : `Материал «${it.item_name}» не найден на складе отправителя`,
        });
      }

      const avgPrice =
        fifo.qtyTaken > 0 ? toMoney(fifo.valueWithdrawn / fifo.qtyTaken) : toMoney(it.price || 0);

      const destBatch = await db.WarehouseMaterial.create(
        {
          name: fifo.meta.name,
          type: fifo.meta.type,
          unit: fifo.meta.unit,
          warehouse_id: toId,
          qty: fifo.qtyTaken,
          price: avgPrice,
          total_sum: toMoney(fifo.valueWithdrawn),
          received_at: doc.doc_date,
          batch_number: `ПЭ-${doc.doc_number}-${it.id}`,
        },
        { transaction: t }
      );

      await db.WarehouseMovement.create(
        {
          movement_kind: 'materials',
          ref_id: destBatch.id,
          item_name: it.item_name,
          from_warehouse_id: fromId,
          to_warehouse_id: toId,
          qty: fifo.qtyTaken,
          moved_at: doc.doc_date,
          user_id: req.user?.id || null,
          comment: `Этап ${meta?.from_stage || '?'}→${meta?.to_stage || '?'} док.${doc.doc_number}`,
          type: 'РАСХОД',
          quantity: fifo.qtyTaken,
          item_id: null,
          order_id: Number.isFinite(orderIdForMov) && orderIdForMov > 0 ? orderIdForMov : null,
        },
        { transaction: t }
      );
    }

    await doc.update({ status: 'posted' }, { transaction: t });
    await t.commit();

    const updated = await db.MovementDocument.findByPk(id, {
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items' },
      ],
    });
    const plain = updated.get({ plain: true });
    res.json({
      ...plain,
      stage_meta: parseStageMeta(plain.comment),
      user_note: stripStageTag(plain.comment),
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * GET /:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const row = await db.MovementDocument.findByPk(id, {
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items' },
      ],
    });
    if (!row) return res.status(404).json({ error: 'не найден' });
    const plain = row.get({ plain: true });
    const sm = parseStageMeta(plain.comment);
    let order_label = '';
    if (sm?.order_id) {
      const o = await db.Order.findByPk(sm.order_id, {
        attributes: ['id', 'tz_code', 'model_name', 'title'],
      });
      if (o) order_label = `${o.tz_code || o.title || o.id} · ${o.model_name || ''}`.trim();
    }
    res.json({
      ...plain,
      stage_meta: sm,
      user_note: stripStageTag(plain.comment),
      order_label,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
