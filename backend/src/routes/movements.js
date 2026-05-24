/**
 * Перемещения материалов между этапами (склад → раскрой → пошив → ОТК → отгрузка).
 * Использует movement_documents / movement_document_items + проведение как у /api/warehouse/movement-docs/:id/post
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

/** Склад для списания фурнитуры при пошив→ОТК (создаётся при старте сервера, см. server.js) */
const SEWING_ACCESSORIES_WAREHOUSE_NAME = 'Склад фурнитуры пошива';

const VALID_STAGES = ['warehouse', 'cutting', 'sewing', 'otk', 'shipment'];

/** Списание материалов со склада (ФИФО) при проведении */
const MATERIAL_ROUTES = new Set([
  'warehouse→cutting',
  'warehouse→sewing',
  'warehouse→otk',
  'warehouse→warehouse',
]);

/** Перемещение между этапами без списания/оприходования материалов на складе */
const PRODUCT_ROUTES = new Set([
  'cutting→sewing',
  'sewing→otk',
  'otk→warehouse',
  'otk→shipment',
  'warehouse→shipment',
]);

function movementRouteKey(fromStage, toStage) {
  return `${String(fromStage || '')}→${String(toStage || '')}`;
}

function isMaterialMovementRoute(fromStage, toStage) {
  return MATERIAL_ROUTES.has(movementRouteKey(fromStage, toStage));
}

function isProductMovementRoute(fromStage, toStage) {
  return PRODUCT_ROUTES.has(movementRouteKey(fromStage, toStage));
}

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

/** Ключ для поиска партии ткани/материала (частичное совпадение по имени) */
function fabricSearchKeyForFifo(rawName) {
  let s = String(rawName || '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (up.startsWith('SEW_OTK') || up.startsWith('CUT_SEW')) return '';
  let out = s.split(/\s·\s/)[0].trim();
  if (!out || out === s) {
    out = s.split(/\s*[—–-]\s*/)[0].trim();
  }
  return (out || s).trim();
}

/**
 * Списание по ФИФО: старые партии first (received_at / created_at).
 * Поиск партии — частичное совпадение имени (strpos по lower(name), затем fallback на полный перебор).
 */
async function fifoDeductFromWarehouse(itemName, warehouseId, qtyToDeduct, transaction) {
  const rawName = String(itemName || '').trim();
  const baseFabric = fabricSearchKeyForFifo(rawName);
  if (!baseFabric || !(qtyToDeduct > 0)) {
    return { remaining: qtyToDeduct, qtyTaken: 0, valueWithdrawn: 0, meta: null };
  }

  const safeForIlike = String(baseFabric).replace(/[%_\\]/g, '').trim();

  let all;
  if (safeForIlike) {
    all = await db.WarehouseMaterial.findAll({
      where: {
        warehouse_id: warehouseId,
        qty: { [Op.gt]: 0 },
        name: { [Op.iLike]: `%${safeForIlike}%` },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  } else {
    all = [];
  }

  if (!all.length) {
    all = await db.WarehouseMaterial.findAll({
      where: {
        warehouse_id: warehouseId,
        qty: { [Op.gt]: 0 },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const bf = baseFabric.toLowerCase();
    all = all.filter((m) => {
      const mn = String(m.name).toLowerCase();
      return mn === bf || mn.includes(bf) || bf.includes(mn);
    });
  }

  const matched = all;
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

/** Себестоимость / списание фурнитуры при approve — ошибки только в лог, approve не отменяем */
async function ensureCostCalculation(orderId, transaction) {
  let costCalc = await db.CostCalculation.findOne({
    where: { order_id: orderId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!costCalc) {
    costCalc = await db.CostCalculation.create(
      { order_id: orderId, status: 'in_progress' },
      { transaction }
    );
  }
  return costCalc;
}

/** Метры ткани для строки «склад → раскрой» */
function fabricQtyFromMovementItem(it) {
  const plain = typeof it.get === 'function' ? it.get({ plain: true }) : it;
  const m = plain.item_meta && typeof plain.item_meta === 'object' ? plain.item_meta : null;
  const q = parseFloat(plain.qty || m?.fact_meters || m?.plan_meters || 0);
  return toMoney(q);
}

/** Метры для списания ткани при раскрой→пошив (не использовать qty в шт. как метры) */
function fabricMetersForCuttingToSewingItem(it) {
  const plain = typeof it.get === 'function' ? it.get({ plain: true }) : it;
  const m = plain.item_meta && typeof plain.item_meta === 'object' ? plain.item_meta : null;
  const unit = String(plain.unit || '').toLowerCase();
  if (m) {
    const fm = parseFloat(m.fact_meters ?? m.fact_qty ?? '');
    if (Number.isFinite(fm) && fm > 0) return toMoney(fm);
    const pm = parseFloat(m.plan_meters ?? '');
    if (Number.isFinite(pm) && pm > 0) return toMoney(pm);
  }
  if (unit === 'м' || unit === 'm') {
    return fabricQtyFromMovementItem(it);
  }
  return 0;
}

function toIntSafe(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

function movementItemPieceQtyAndOpCost(it) {
  const line = parseMovementItemToProductLine(it);
  const plain = typeof it.get === 'function' ? it.get({ plain: true }) : it;
  const m = plain.item_meta && typeof plain.item_meta === 'object' ? plain.item_meta : null;
  let qty = toIntSafe(m?.total_qty);
  if (!qty) qty = toIntSafe(line.qty);
  if (!qty) qty = toIntSafe(plain.qty);
  return { qty, opCost: toMoney(line.operationCost) };
}

function orderFittingsList(order) {
  const raw = order?.fittings_data;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [];
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

const STAGE_PRODUCT_TAG = '[stage_product]';

function parseMovementItemToProductLine(it) {
  const plain = typeof it.get === 'function' ? it.get({ plain: true }) : it;
  let modelName = String(plain.item_name || '').trim();
  let sizes = {};
  let color = '';
  let operationCost = toMoney(plain.price || 0);
  let qty = Number(plain.qty || 0);

  const meta = plain.item_meta && typeof plain.item_meta === 'object' ? plain.item_meta : null;
  if (meta) {
    modelName = String(meta.model_name || meta.fabric_name || meta.material_name || meta.name || modelName).trim();
    sizes = meta.sizes && typeof meta.sizes === 'object' ? meta.sizes : {};
    color = String(meta.color || '').trim();
    if (meta.operation_cost != null) operationCost = toMoney(meta.operation_cost);
    const fromSizes = Object.values(sizes).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
    if (fromSizes > 0) qty = fromSizes;
    else if (meta.total_qty != null) qty = Number(meta.total_qty) || qty;
    else qty = Number(plain.qty || 0);
    return {
      modelName,
      sizes,
      color,
      operationCost,
      qty: toMoney(qty),
    };
  }

  if (modelName.startsWith('SEW_OTK_JSON:')) {
    try {
      const json = JSON.parse(modelName.replace(/^SEW_OTK_JSON:/, ''));
      modelName = String(json.model_name || json.name || '').trim();
      sizes = json.sizes && typeof json.sizes === 'object' ? json.sizes : {};
      color = String(json.color || '').trim();
      if (json.operation_cost != null) operationCost = toMoney(json.operation_cost);
      const fromSizes = Object.values(sizes).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
      if (fromSizes > 0) qty = fromSizes;
      else if (json.total_qty != null) qty = Number(json.total_qty) || qty;
    } catch {
      /* keep raw */
    }
  }

  return {
    modelName,
    sizes,
    color,
    operationCost,
    qty: toMoney(qty),
  };
}

function buildStageProductComment(payload) {
  const raw = `${STAGE_PRODUCT_TAG}${JSON.stringify(payload)}`;
  return raw.length > 500 ? `${raw.slice(0, 497)}...` : raw;
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

/** Разбор legacy: весь объект батча/строки был в item_name */
function normalizeLegacyMovementItem(it) {
  let item_name = String(it?.material_name || it?.item_name || '').trim();
  let unit = String(it?.unit || 'шт').trim().slice(0, 30);
  let qty = it?.qty;
  let price = it?.price ?? 0;
  let item_meta =
    it?.item_meta != null && typeof it.item_meta === 'object' ? { ...it.item_meta } : null;

  if (item_name.startsWith('CUT_SEW_BATCH_JSON:')) {
    try {
      const json = JSON.parse(item_name.slice('CUT_SEW_BATCH_JSON:'.length));
      item_name = String(json.fabric_name || json.material_name || '').trim() || item_name;
      item_meta = { ...json, ...(item_meta || {}) };
    } catch {
      /* keep */
    }
  }
  if (item_name.startsWith('SEW_OTK_JSON:')) {
    try {
      const json = JSON.parse(item_name.slice('SEW_OTK_JSON:'.length));
      item_name = String(json.model_name || json.material_name || '').trim() || item_name;
      item_meta = { ...json, ...(item_meta || {}) };
    } catch {
      /* keep */
    }
  }

  const metaClean =
    item_meta && typeof item_meta === 'object' && Object.keys(item_meta).length > 0 ? item_meta : null;

  return {
    item_name,
    unit,
    qty,
    price,
    item_meta: metaClean,
  };
}

function sanitizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const n = normalizeLegacyMovementItem(it);
      return {
        item_id:
          it?.item_id != null && !Number.isNaN(toIntOrNaN(it.item_id))
            ? toIntOrNaN(it.item_id)
            : it?.id != null && !Number.isNaN(toIntOrNaN(it.id))
              ? toIntOrNaN(it.id)
              : null,
        item_name: n.item_name,
        unit: n.unit || 'шт',
        qty: toMoney(n.qty),
        price: toMoney(n.price ?? 0),
        item_meta: n.item_meta,
      };
    })
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
      const n = normalizeLegacyMovementItem(it);
      const dq = toMoney(it?.defect_qty);
      if (n.item_name && dq > 0) defects[n.item_name] = dq;
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
    const { order_id, from_stage, to_stage, status: statusQ } = req.query;

    const where = { move_type: 'materials' };
    if (statusQ != null && String(statusQ).trim() !== '') {
      const st = String(statusQ).trim();
      if (st === 'draft' || st === 'posted') {
        where.status = st;
      }
    }

    const rows = await db.MovementDocument.findAll({
      where,
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items', required: false },
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

    const fromStage = meta?.from_stage;
    const toStage = meta?.to_stage;
    const routeKey = movementRouteKey(fromStage, toStage);
    const runFifo =
      meta &&
      isMaterialMovementRoute(fromStage, toStage) &&
      !isProductMovementRoute(fromStage, toStage);
    const runProduct = meta && isProductMovementRoute(fromStage, toStage);

    const fromId = Number(doc.from_warehouse_id);
    const toId = Number(doc.to_warehouse_id);

    if (runFifo) {
      for (const it of items) {
        const qty = Number(it.qty || 0);
        if (!(qty > 0)) continue;

        const fifo = await fifoDeductFromWarehouse(it.item_name, fromId, qty, t);
        if (fifo.remaining > 0 || fifo.qtyTaken <= 0 || !fifo.meta) {
          await t.rollback();
          const label =
            String(it.item_name || '').length > 120
              ? `${String(it.item_name).slice(0, 120)}…`
              : String(it.item_name || '');
          return res.status(400).json({
            error:
              fifo.remaining > 0
                ? `Недостаточно остатка для «${label}» (ФИФО: не хватает ${toMoney(fifo.remaining)})`
                : `Материал «${label}» не найден на складе отправителя`,
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
    } else if (meta && !isProductMovementRoute(fromStage, toStage) && !isMaterialMovementRoute(fromStage, toStage)) {
      await t.rollback();
      return res.status(400).json({
        error: `Проведение со складом для маршрута «${routeKey}» не настроено. Обратитесь к администратору.`,
      });
    }

    if (runProduct) {
      if (!Number.isFinite(toId) || toId < 1) {
        await t.rollback();
        return res.status(400).json({ error: 'Не указан склад назначения для изделий' });
      }

      for (const it of items) {
        const line = parseMovementItemToProductLine(it);
        const { modelName, sizes, color, operationCost, qty } = line;
        if (!(qty > 0) || !modelName) continue;

        const displayName = modelName.substring(0, 255);
        const articleNorm = color ? color.substring(0, 120).trim() : null;

        const [destGood] = await db.WarehouseGood.findOrCreate({
          where: {
            name: displayName,
            warehouse_id: toId,
            article: articleNorm,
          },
          defaults: {
            name: displayName,
            article: articleNorm,
            photo: null,
            warehouse_id: toId,
            qty: 0,
            price: operationCost,
            received_at: doc.doc_date,
          },
          transaction: t,
        });

        const prevQty = toMoney(destGood.qty || 0);
        const prevPrice = toMoney(destGood.price || 0);
        const addQty = toMoney(qty);
        const newQty = toMoney(prevQty + addQty);
        const newPrice =
          newQty > 0 ? toMoney((prevQty * prevPrice + addQty * operationCost) / newQty) : operationCost;

        await destGood.update(
          { qty: newQty, price: newPrice, received_at: doc.doc_date },
          { transaction: t }
        );

        const commentPayload = {
          from_stage: fromStage,
          to_stage: toStage,
          color,
          sizes,
          unit_price: operationCost,
          movement_doc_id: doc.id,
          item_line_id: it.id,
        };
        let comment = buildStageProductComment(commentPayload);
        if (comment.length > 500) {
          comment = buildStageProductComment({
            from_stage: fromStage,
            to_stage: toStage,
            color,
            unit_price: operationCost,
            movement_doc_id: doc.id,
            item_line_id: it.id,
          });
        }

        await db.WarehouseMovement.create(
          {
            movement_kind: 'goods',
            ref_id: doc.id,
            item_name: displayName,
            from_warehouse_id: Number.isFinite(fromId) && fromId > 0 ? fromId : null,
            to_warehouse_id: toId,
            qty: addQty,
            moved_at: doc.doc_date,
            user_id: req.user?.id || null,
            comment,
            type: 'ПРИХОД',
            quantity: addQty,
            item_id: null,
            order_id: Number.isFinite(orderIdForMov) && orderIdForMov > 0 ? orderIdForMov : null,
          },
          { transaction: t }
        );
      }
    }

    // Раскрой → пошив: списание ткани со склада раскроя (ФИФО); нехватка — только предупреждение
    if (routeKey === 'cutting→sewing' && runProduct && Number.isFinite(fromId) && fromId > 0) {
      try {
        const fabricItems = items.filter((item) => {
          const plain = typeof item.get === 'function' ? item.get({ plain: true }) : item;
          const name = String(plain.item_name || '').trim();
          const up = name.toUpperCase();
          return (
            name.length > 0 &&
            !up.startsWith('SEW_OTK') &&
            !up.startsWith('CUT_SEW') &&
            fabricMetersForCuttingToSewingItem(item) > 0
          );
        });

        for (const item of fabricItems) {
          const plain = typeof item.get === 'function' ? item.get({ plain: true }) : item;
          const fabricName = String(plain.item_name || '').trim();
          const factMeters = fabricMetersForCuttingToSewingItem(item);
          if (!(fabricName && factMeters > 0)) continue;

          const fifo = await fifoDeductFromWarehouse(fabricName, fromId, factMeters, t);
          if (fifo.remaining > 0) {
            console.warn(
              `[cutting→sewing] Нехватка ${fifo.remaining}м для "${fabricName}" на складе #${fromId}`
            );
          }
          if (fifo.qtyTaken > 0) {
            try {
              await db.WarehouseMovement.create(
                {
                  movement_kind: 'materials',
                  ref_id: doc.id,
                  item_name: fabricName,
                  from_warehouse_id: fromId,
                  to_warehouse_id: Number.isFinite(toId) && toId > 0 ? toId : null,
                  qty: fifo.qtyTaken,
                  moved_at: doc.doc_date,
                  user_id: req.user?.id || null,
                  comment: `Раскрой→Пошив: списание ткани док.${doc.doc_number}`,
                  type: 'РАСХОД',
                  quantity: fifo.qtyTaken,
                  item_id: null,
                  order_id:
                    Number.isFinite(orderIdForMov) && orderIdForMov > 0 ? orderIdForMov : null,
                },
                { transaction: t }
              );
            } catch (e) {
              console.error('[movement record]:', e.message);
            }
          }
        }
      } catch (fabricErr) {
        console.error('[cutting→sewing fabric]:', fabricErr.message);
      }
    }

    const oidForCost = Number.isFinite(orderIdForMov) && orderIdForMov > 0 ? orderIdForMov : null;

    if (oidForCost) {
      try {
        if (routeKey === 'warehouse→cutting' && runFifo) {
          let fabricQty = 0;
          let fabricSum = 0;
          for (const item of items) {
            const qty = fabricQtyFromMovementItem(item);
            const price = toMoney(item.price || 0);
            fabricQty = toMoney(fabricQty + qty);
            fabricSum = toMoney(fabricSum + qty * price);
          }
          const costCalc = await ensureCostCalculation(oidForCost, t);
          const newFabricQty = toMoney(parseFloat(costCalc.cutting_fabric_qty || 0) + fabricQty);
          const newFabricSum = toMoney(parseFloat(costCalc.cutting_fabric_sum || 0) + fabricSum);
          const acc = toMoney(parseFloat(costCalc.cutting_accessories_sum || 0));
          const op = toMoney(parseFloat(costCalc.cutting_op_total || 0));
          const newCuttingTotal = toMoney(newFabricSum + acc + op);
          await costCalc.update(
            {
              cutting_fabric_qty: newFabricQty,
              cutting_fabric_sum: newFabricSum,
              cutting_cost_total: newCuttingTotal,
            },
            { transaction: t }
          );
          await db.CostCalculationItem.create(
            {
              cost_calculation_id: costCalc.id,
              stage: 'cutting',
              material_type: 'fabric',
              material_name: 'Ткань (перемещение со склада)',
              qty: fabricQty,
              unit: 'м',
              price: fabricQty > 0 ? toMoney(fabricSum / fabricQty) : 0,
              total_sum: fabricSum,
              note: `Перемещение #${doc.id} со склада в раскрой`,
            },
            { transaction: t }
          );
        }
      } catch (costErr) {
        console.error('[costCalc approve]:', costErr.message);
      }

      try {
        if (routeKey === 'cutting→sewing' && runProduct) {
          let outputQty = 0;
          let cuttingZP = 0;
          for (const item of items) {
            const { qty, opCost } = movementItemPieceQtyAndOpCost(item);
            outputQty += qty;
            cuttingZP = toMoney(cuttingZP + qty * opCost);
          }
          const costCalc = await ensureCostCalculation(oidForCost, t);
          const newCuttingOpTotal = toMoney(parseFloat(costCalc.cutting_op_total || 0) + cuttingZP);
          const newCuttingOutputQty = toIntSafe(costCalc.cutting_output_qty || 0) + outputQty;
          const newCuttingTotal = toMoney(
            parseFloat(costCalc.cutting_fabric_sum || 0) +
              parseFloat(costCalc.cutting_accessories_sum || 0) +
              newCuttingOpTotal
          );
          await costCalc.update(
            {
              cutting_output_qty: newCuttingOutputQty,
              cutting_op_total: newCuttingOpTotal,
              cutting_op_cost_per_unit:
                newCuttingOutputQty > 0 ? toMoney(newCuttingOpTotal / newCuttingOutputQty) : 0,
              cutting_cost_total: newCuttingTotal,
            },
            { transaction: t }
          );
          if (cuttingZP > 0) {
            await db.CostCalculationItem.create(
              {
                cost_calculation_id: costCalc.id,
                stage: 'cutting',
                material_type: 'operation',
                material_name: 'ЗП раскройного отдела',
                qty: outputQty,
                unit: 'шт',
                price: outputQty > 0 ? toMoney(cuttingZP / outputQty) : 0,
                total_sum: cuttingZP,
                note: `Перемещение #${doc.id} раскрой→пошив`,
              },
              { transaction: t }
            );
          }
        }
      } catch (costErr) {
        console.error('[costCalc approve]:', costErr.message);
      }

      try {
        if (routeKey === 'sewing→otk' && runProduct) {
          let sewingQty = 0;
          let sewingZP = 0;
          for (const item of items) {
            const { qty, opCost } = movementItemPieceQtyAndOpCost(item);
            sewingQty += qty;
            sewingZP = toMoney(sewingZP + qty * opCost);
          }

          let sewingAccSum = 0;
          const costCalc = await ensureCostCalculation(oidForCost, t);

          const accWarehouse = await db.WarehouseRef.findOne({
            where: { name: SEWING_ACCESSORIES_WAREHOUSE_NAME },
            transaction: t,
          });
          const accWarehouseId = accWarehouse?.id || null;
          const fittingsFifoWhId =
            accWarehouseId && accWarehouseId > 0
              ? accWarehouseId
              : Number.isFinite(fromId) && fromId > 0
                ? fromId
                : null;

          const order = await db.Order.findByPk(oidForCost, { transaction: t });
          if (order) {
            const fittings = orderFittingsList(order);
            for (const fitting of fittings) {
              const fittingName = String(fitting.name || fitting.material_name || '').trim();
              if (!fittingName) continue;

              const perUnit = parseFloat(
                fitting.qty_per_unit != null ? fitting.qty_per_unit : fitting.qtyPerUnit || 0
              );
              const planQty = toMoney(perUnit * sewingQty);
              if (!(planQty > 0)) continue;

              const price = toMoney(parseFloat(fitting.price || 0));
              const sum = toMoney(planQty * price);
              sewingAccSum = toMoney(sewingAccSum + sum);

              let fifo = { remaining: planQty, qtyTaken: 0, valueWithdrawn: 0, meta: null };
              if (fittingsFifoWhId) {
                try {
                  fifo = await fifoDeductFromWarehouse(
                    fittingName,
                    fittingsFifoWhId,
                    planQty,
                    t
                  );
                  if (fifo.remaining > 0) {
                    console.warn(
                      `[sewing→otk] Нехватка фурнитуры: "${fittingName}" ${fifo.remaining} (склад #${fittingsFifoWhId})`
                    );
                  }
                } catch (e) {
                  console.error('[fifo accessories]:', e.message);
                }
              }

              try {
                if (fifo.qtyTaken > 0) {
                  await db.WarehouseMovement.create(
                    {
                      movement_kind: 'materials',
                      ref_id: doc.id,
                      item_name: fittingName,
                      from_warehouse_id: fittingsFifoWhId,
                      to_warehouse_id: Number.isFinite(toId) && toId > 0 ? toId : null,
                      qty: fifo.qtyTaken,
                      moved_at: doc.doc_date,
                      user_id: req.user?.id || null,
                      comment: `Пошив→ОТК: списание фурнитуры док.${doc.doc_number}`,
                      type: 'РАСХОД',
                      quantity: fifo.qtyTaken,
                      item_id: null,
                      order_id: oidForCost,
                    },
                    { transaction: t }
                  );
                }
              } catch (e) {
                console.error('[acc movement]:', e.message);
              }

              try {
                await db.CostCalculationItem.create(
                  {
                    cost_calculation_id: costCalc.id,
                    stage: 'sewing',
                    material_type: 'accessories',
                    material_name: fittingName,
                    qty: planQty,
                    unit: String(fitting.unit || 'шт').slice(0, 50),
                    price,
                    total_sum: sum,
                    note: `Пошив→ОТК: списание #${doc.id}`,
                  },
                  { transaction: t }
                );
              } catch (e) {
                console.error('[cost item acc]:', e.message);
              }
            }
          }
          const prevCuttingTotal = toMoney(parseFloat(costCalc.cutting_cost_total || 0));
          const newSewingOpTotal = toMoney(parseFloat(costCalc.sewing_op_total || 0) + sewingZP);
          const newSewingAccSum = toMoney(parseFloat(costCalc.sewing_accessories_sum || 0) + sewingAccSum);
          const newSewingOutputQty = toIntSafe(costCalc.sewing_output_qty || 0) + sewingQty;
          const newSewingTotal = toMoney(prevCuttingTotal + newSewingAccSum + newSewingOpTotal);
          await costCalc.update(
            {
              sewing_output_qty: newSewingOutputQty,
              sewing_op_total: newSewingOpTotal,
              sewing_op_cost_per_unit:
                newSewingOutputQty > 0 ? toMoney(newSewingOpTotal / newSewingOutputQty) : 0,
              sewing_accessories_sum: newSewingAccSum,
              sewing_cost_total: newSewingTotal,
            },
            { transaction: t }
          );
          if (sewingZP > 0) {
            await db.CostCalculationItem.create(
              {
                cost_calculation_id: costCalc.id,
                stage: 'sewing',
                material_type: 'operation',
                material_name: 'ЗП пошивного отдела',
                qty: sewingQty,
                unit: 'шт',
                price: sewingQty > 0 ? toMoney(sewingZP / sewingQty) : 0,
                total_sum: sewingZP,
                note: `Перемещение #${doc.id} пошив→отк`,
              },
              { transaction: t }
            );
          }
        }
      } catch (costErr) {
        console.error('[costCalc approve]:', costErr.message);
      }

      try {
        if ((routeKey === 'otk→warehouse' || routeKey === 'otk→shipment') && runProduct) {
          let otkQty = 0;
          let otkZP = 0;
          for (const item of items) {
            const { qty, opCost } = movementItemPieceQtyAndOpCost(item);
            otkQty += qty;
            otkZP = toMoney(otkZP + qty * opCost);
          }

          let otkAccSum = 0;
          const order = await db.Order.findByPk(oidForCost, { transaction: t });
          if (order) {
            const fittings = orderFittingsList(order);
            const otkFittings = fittings.filter((f) => f.stage === 'otk');
            const whOtk = Number.isFinite(fromId) && fromId > 0 ? fromId : null;
            for (const fitting of otkFittings) {
              const perUnit = parseFloat(
                fitting.qty_per_unit != null ? fitting.qty_per_unit : fitting.qtyPerUnit || 0
              );
              const planQty = toMoney(perUnit * otkQty);
              const price = toMoney(parseFloat(fitting.price || 0));
              otkAccSum = toMoney(otkAccSum + planQty * price);
              if (whOtk && planQty > 0) {
                const fitName = String(fitting.name || fitting.material_name || '').trim();
                if (fitName) {
                  const fifo = await fifoDeductFromWarehouse(fitName, whOtk, planQty, t);
                  if (fifo.remaining > 0) {
                    console.error(
                      `[costCalc approve] фурнитура ОТК «${fitName}»: не хватает ${fifo.remaining} (склад ${whOtk})`
                    );
                  }
                }
              }
            }
          }

          const costCalc = await ensureCostCalculation(oidForCost, t);
          const prevSewingTotal = toMoney(parseFloat(costCalc.sewing_cost_total || 0));
          const newOtkOpTotal = toMoney(parseFloat(costCalc.otk_op_total || 0) + otkZP);
          const newOtkAccSum = toMoney(parseFloat(costCalc.otk_accessories_sum || 0) + otkAccSum);
          const newOtkOutputQty = toIntSafe(costCalc.otk_output_qty || 0) + otkQty;
          const newOtkTotal = toMoney(prevSewingTotal + newOtkAccSum + newOtkOpTotal);
          const finalQty =
            newOtkOutputQty ||
            toIntSafe(costCalc.sewing_output_qty || 0) ||
            toIntSafe(costCalc.cutting_output_qty || 0);
          const costPerUnit = finalQty > 0 ? toMoney(newOtkTotal / finalQty) : 0;

          await costCalc.update(
            {
              otk_output_qty: newOtkOutputQty,
              otk_op_total: newOtkOpTotal,
              otk_op_cost_per_unit:
                newOtkOutputQty > 0 ? toMoney(newOtkOpTotal / newOtkOutputQty) : 0,
              otk_accessories_sum: newOtkAccSum,
              otk_cost_total: newOtkTotal,
              total_cost: newOtkTotal,
              cost_per_unit: costPerUnit,
              status: 'calculated',
            },
            { transaction: t }
          );
          if (otkZP > 0) {
            await db.CostCalculationItem.create(
              {
                cost_calculation_id: costCalc.id,
                stage: 'otk',
                material_type: 'operation',
                material_name: 'ЗП отдела ОТК',
                qty: otkQty,
                unit: 'шт',
                price: otkQty > 0 ? toMoney(otkZP / otkQty) : 0,
                total_sum: otkZP,
                note: `Перемещение #${doc.id} отк→отгрузка/склад`,
              },
              { transaction: t }
            );
          }
          if (otkAccSum > 0) {
            await db.CostCalculationItem.create(
              {
                cost_calculation_id: costCalc.id,
                stage: 'otk',
                material_type: 'accessories',
                material_name: 'Фурнитура ОТК (списание)',
                qty: otkQty,
                unit: 'шт',
                price: otkQty > 0 ? toMoney(otkAccSum / otkQty) : 0,
                total_sum: otkAccSum,
                note: `Перемещение #${doc.id} отк→отгрузка/склад`,
              },
              { transaction: t }
            );
          }
        }
      } catch (costErr) {
        console.error('[costCalc approve]:', costErr.message);
      }
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
    const pg = err.parent || err.original;
    console.error('[movements GET /:id] ОШИБКА:', err.message);
    console.error('[movements GET /:id] PG:', pg?.message || '(нет)');
    console.error('[movements GET /:id] sql:', pg?.sql || '(нет)');
    console.error('[movements GET /:id] stack:', err.stack);
    if (!res.headersSent) {
      return res.status(500).json({
        error: err.message || 'Внутренняя ошибка',
        pg: pg?.message,
        code: pg?.code,
      });
    }
    next(err);
  }
});

module.exports = router;
