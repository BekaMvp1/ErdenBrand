/**
 * Складской учёт: Раскрой → Пошив → ОТК → Склад → Отгрузка.
 * QC хранит: checked_qty, defect_qty, good_qty (good_qty = checked_qty - defect_qty).
 * Склад пополняется ТОЛЬКО из QC: warehouse_qty = good_qty (НЕ из sewing_batches).
 * Отгрузка: нельзя отгрузить больше, чем warehouse_qty.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { computeKitSummary } = require('../utils/kitLogic');

const router = express.Router();

// ————— Модели изделий и размерная сетка —————

/** GET /api/warehouse-stock/models — список моделей */
router.get('/models', async (req, res, next) => {
  try {
    const list = await db.ProductModel.findAll({
      order: [['name']],
      include: [{ model: db.ModelSize, as: 'ModelSizes', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/models — создать модель. body: { name } */
router.post('/models', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Укажите название модели' });
    }
    const row = await db.ProductModel.create({ name: String(name).trim() });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

/** GET /api/warehouse-stock/models/:id/sizes — размерная сетка модели */
router.get('/models/:id/sizes', async (req, res, next) => {
  try {
    const model = await db.ProductModel.findByPk(req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    const list = await db.ModelSize.findAll({
      where: { model_id: model.id },
      include: [{ model: db.Size, as: 'Size' }],
      order: [['Size', 'name']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/models/:id/sizes — добавить размер в сетку. body: { size_id } */
router.post('/models/:id/sizes', async (req, res, next) => {
  try {
    const model = await db.ProductModel.findByPk(req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    const { size_id } = req.body;
    if (!size_id) return res.status(400).json({ error: 'Укажите size_id' });
    const [row] = await db.ModelSize.findOrCreate({
      where: { model_id: model.id, size_id: Number(size_id) },
      defaults: { model_id: model.id, size_id: Number(size_id) },
    });
    const withSize = await db.ModelSize.findByPk(row.id, { include: [{ model: db.Size, as: 'Size' }] });
    res.status(201).json(withSize);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/warehouse-stock/models/:id/sizes/:sizeId — убрать размер из сетки */
router.delete('/models/:id/sizes/:sizeId', async (req, res, next) => {
  try {
    const deleted = await db.ModelSize.destroy({
      where: { model_id: req.params.id, size_id: req.params.sizeId },
    });
    if (!deleted) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ————— Пошив по размерам —————

/** GET /api/warehouse-stock/sewing?order_id= — записи пошива по заказу */
router.get('/sewing', async (req, res, next) => {
  try {
    const { order_id, from, to } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const where = { order_id: Number(order_id) };
    if (from && to) where.date = { [Op.between]: [from, to] };
    const list = await db.SewingRecord.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
        { model: db.BuildingFloor, as: 'BuildingFloor' },
      ],
      order: [['date', 'DESC'], ['id', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** POST /api/warehouse-stock/sewing — запись пошива. body: { order_id, floor_id?, model_size_id, qty, date } */
router.post('/sewing', async (req, res, next) => {
  try {
    const { order_id, floor_id, model_size_id, qty, date } = req.body;
    if (!order_id || !model_size_id || !date) {
      return res.status(400).json({ error: 'Укажите order_id, model_size_id, date' });
    }
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const ms = await db.ModelSize.findByPk(model_size_id);
    if (!ms) return res.status(404).json({ error: 'Размер модели не найден' });
    const q = Math.max(0, parseInt(qty, 10) || 0);
    if (q === 0) return res.status(400).json({ error: 'qty должно быть больше 0' });
    const row = await db.SewingRecord.create({
      order_id: Number(order_id),
      floor_id: floor_id ? Number(floor_id) : null,
      model_size_id: Number(model_size_id),
      qty: q,
      date: String(date).slice(0, 10),
    });
    const withAssoc = await db.SewingRecord.findByPk(row.id, {
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    next(err);
  }
});

// ————— Партии пошива (для ОТК по партиям) —————

/**
 * GET /api/warehouse-stock/batches/pending-qc — партии пошива, готовые к ОТК.
 * Партии со статусом READY_FOR_QC (создаются при «Завершить пошив → ОТК»).
 * Фильтры: q, floor_id, workshop_id.
 */
router.get('/batches/pending-qc', async (req, res, next) => {
  try {
    const { q, floor_id, workshop_id } = req.query;
    const [rows] = await db.sequelize.query(`
      SELECT sb.id, sb.order_id, sb.model_id, sb.floor_id, sb.batch_code, sb.finished_at,
             COALESCE(SUM(sbi.fact_qty), 0)::numeric AS total_fact
      FROM sewing_batches sb
      LEFT JOIN sewing_batch_items sbi ON sbi.batch_id = sb.id
      WHERE sb.status = 'READY_FOR_QC'
      GROUP BY sb.id
      HAVING COALESCE(SUM(sbi.fact_qty), 0) > 0
      ORDER BY sb.finished_at DESC NULLS LAST
    `);
    const orderIds = new Set();
    const floorIds = new Set();
    let list = [];
    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        orderIds.add(r.order_id);
        if (r.floor_id) floorIds.add(r.floor_id);
      });
      const orders = await db.Order.findAll({
        where: { id: [...orderIds] },
        include: [{ model: db.Client, as: 'Client' }],
        attributes: ['id', 'title', 'model_name', 'tz_code', 'photos'],
      });
      const orderMap = {};
      orders.forEach((o) => { orderMap[o.id] = o; });
      const allFloors = await db.BuildingFloor.findAll({
        where: { id: [...floorIds] },
        attributes: ['id', 'name'],
      });
      const floorMap = {};
      allFloors.forEach((f) => { floorMap[f.id] = f; });
      list = rows.map((r) => {
        const order = orderMap[r.order_id];
        const floor = r.floor_id ? floorMap[r.floor_id] : null;
        return {
          id: r.id,
          batch_code: r.batch_code,
          order_id: r.order_id,
          order_title: order?.title || `#${r.order_id}`,
          tz_code: order?.tz_code || '',
          model_name: order?.model_name || '',
          client_name: order?.Client?.name || '—',
          order_photos: order?.photos,
          floor_id: r.floor_id,
          floor_name: floor?.name || '—',
          finished_at: r.finished_at,
          total_fact: Number(r.total_fact) || 0,
          noBatch: false,
        };
      });
    }

    if (workshop_id) {
      const orderIds = await db.Order.findAll({
        where: { workshop_id: Number(workshop_id) },
        attributes: ['id'],
        raw: true,
      }).then((rows) => rows.map((r) => r.id));
      if (orderIds.length) list = list.filter((i) => orderIds.includes(i.order_id));
    }
    if (floor_id) {
      const fids = String(floor_id).split(',').map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
      if (fids.length) list = list.filter((i) => i.floor_id != null && fids.includes(i.floor_id));
    }
    if (q && String(q).trim()) {
      const lower = String(q).trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.order_title && i.order_title.toLowerCase().includes(lower)) ||
          (i.model_name && i.model_name.toLowerCase().includes(lower)) ||
          (i.client_name && i.client_name.toLowerCase().includes(lower)) ||
          (i.tz_code && i.tz_code.toLowerCase().includes(lower)) ||
          (i.batch_code && i.batch_code.toLowerCase().includes(lower))
      );
    }
    list.sort((a, b) => {
      const da = a.finished_at ? new Date(a.finished_at) : new Date(0);
      const db_ = b.finished_at ? new Date(b.finished_at) : new Date(0);
      return db_ - da;
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/warehouse-stock/batches/:id — партия с позициями по размерам (для формы ОТК).
 * Если заказ — комплект (OrderParts), в ответ добавляется kit_info.
 */
router.get('/batches/:id', async (req, res, next) => {
  try {
    const batch = await db.SewingBatch.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          attributes: ['id', 'title', 'model_name', 'tz_code', 'photos'],
          include: [
            { model: db.Client, as: 'Client', attributes: ['name'] },
            { model: db.OrderVariant, as: 'OrderVariants', attributes: ['color', 'size_id'], include: [{ model: db.Size, as: 'Size', attributes: ['id', 'name', 'code'] }], required: false },
            { model: db.OrderPart, as: 'OrderParts', required: false },
          ],
        },
        { model: db.BuildingFloor, as: 'BuildingFloor', attributes: ['id', 'name'] },
        {
          model: db.SewingBatchItem,
          as: 'SewingBatchItems',
          include: [
            { model: db.ModelSize, as: 'ModelSize', required: false, include: [{ model: db.Size, as: 'Size' }] },
            { model: db.Size, as: 'Size', required: false, attributes: ['id', 'name', 'code'] },
          ],
        },
        {
          model: db.QcBatch,
          as: 'QcBatch',
          required: false,
          include: [{ model: db.QcBatchItem, as: 'QcBatchItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] }],
        },
      ],
    });
    if (!batch) return res.status(404).json({ error: 'Партия не найдена' });
    const json = batch.toJSON();
    const parts = (batch.Order?.OrderParts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (parts.length > 0 && batch.order_id) {
      const orderBatches = await db.SewingBatch.findAll({
        where: {
          order_id: batch.order_id,
          status: { [Op.in]: ['READY_FOR_QC', 'QC_DONE'] },
        },
        include: [{ model: db.SewingBatchItem, as: 'SewingBatchItems' }],
      });
      const partQtyByFloor = {};
      for (const b of orderBatches) {
        const qty = (b.SewingBatchItems || []).reduce((s, i) => s + (parseInt(i.fact_qty, 10) || 0), 0);
        if (b.floor_id) partQtyByFloor[b.floor_id] = (partQtyByFloor[b.floor_id] || 0) + qty;
      }
      const kitSummary = computeKitSummary(parts, partQtyByFloor);
      json.kit_info = {
        order_title: batch.Order?.tz_code && batch.Order?.model_name
          ? `${batch.Order.tz_code} — ${batch.Order.model_name}` : batch.Order?.title || `#${batch.order_id}`,
        parts: kitSummary.part_quantities,
        kit_qty: kitSummary.kit_qty,
      };
    }
    res.json(json);
  } catch (err) {
    next(err);
  }
});

// ————— ОТК —————
// Единственный источник очереди ОТК: GET /batches/pending-qc (sewing_batches без qc_batches).
// Устаревший GET /qc/pending (sewing_plans, QcRecord) удалён — ломал поток Пошив → ОТК.

/** GET /api/warehouse-stock/qc?order_id= — записи ОТК по заказу (легаси, QcRecord) */
router.get('/qc', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const list = await db.QcRecord.findAll({
      where: { order_id: Number(order_id) },
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
      order: [['created_at', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/qc/batch — ОТК по партии (единый поток: только через партии).
 * body: { batch_id, items: [{ model_size_id?, size_id?, checked_qty, defect_qty }] }
 * QC хранит: checked_qty, defect_qty, good_qty (good_qty = checked_qty - defect_qty).
 * Склад пополняется ТОЛЬКО из QC: warehouse_qty = good_qty (НЕ из sewing_batches).
 */
router.post('/qc/batch', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { batch_id, items } = req.body;
    if (!batch_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите batch_id и items (массив { model_size_id?, size_id?, checked_qty, defect_qty })' });
    }
    const batch = await db.SewingBatch.findByPk(batch_id, {
      include: [{ model: db.SewingBatchItem, as: 'SewingBatchItems' }],
      transaction: t,
    });
    if (!batch) {
      await t.rollback();
      return res.status(404).json({ error: 'Партия не найдена' });
    }
    if (batch.status !== 'READY_FOR_QC' && batch.status !== 'QC_DONE') {
      await t.rollback();
      return res.status(400).json({ error: 'Партия должна быть в статусе «Готова к ОТК» (READY_FOR_QC)' });
    }

    const batchItemsBySize = {};
    let totalFact = 0;
    batch.SewingBatchItems.forEach((bi) => {
      const key = bi.model_size_id != null ? `m${bi.model_size_id}` : (bi.size_id != null ? `s${bi.size_id}` : `i${bi.id}`);
      const fact = Number(bi.fact_qty) || 0;
      batchItemsBySize[key] = {
        model_size_id: bi.model_size_id,
        size_id: bi.size_id,
        planned_qty: Number(bi.planned_qty) || 0,
        fact_qty: fact,
      };
      totalFact += fact;
    });

    // Уже проверенное количество по размерам (если ОТК проводился ранее по этой партии)
    const existingQc = await db.QcBatch.findOne({
      where: { batch_id: Number(batch_id) },
      include: [{ model: db.QcBatchItem, as: 'QcBatchItems' }],
      transaction: t,
    });
    const alreadyByKey = {};
    let alreadyCheckedTotal = 0;
    if (existingQc && existingQc.QcBatchItems) {
      existingQc.QcBatchItems.forEach((qci) => {
        const key =
          qci.model_size_id != null
            ? `m${qci.model_size_id}`
            : (qci.size_id != null ? `s${qci.size_id}` : `i${qci.id}`);
        const checked = Number(qci.checked_qty) || 0;
        alreadyByKey[key] = (alreadyByKey[key] || 0) + checked;
        alreadyCheckedTotal += checked;
      });
    }

    let checkedTotalDelta = 0;
    let passedTotalDelta = 0;
    let defectTotalDelta = 0;
    const qcItems = [];

    const validItems = items.filter((it) => (Number(it.model_size_id) || 0) > 0 || (Number(it.size_id) || 0) > 0);
    if (validItems.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Нет корректных позиций по размерам.' });
    }

    for (const it of validItems) {
      const model_size_id = Number(it.model_size_id) || null;
      const size_id = Number(it.size_id) || null;
      const key = model_size_id ? `m${model_size_id}` : (size_id ? `s${size_id}` : null);
      const bi = key ? batchItemsBySize[key] : null;
      const factQty = bi?.fact_qty ?? 0;
      const alreadyChecked = alreadyByKey[key] || 0;
      const remainingFact = Math.max(0, factQty - alreadyChecked);
      if (remainingFact <= 0) {
        continue;
      }
      let checked = parseInt(it.checked_qty, 10);
      if (Number.isNaN(checked)) checked = remainingFact;
      checked = Math.max(0, Math.min(checked, remainingFact));
      let defect = parseInt(it.defect_qty, 10);
      if (Number.isNaN(defect)) defect = 0;
      defect = Math.max(0, Math.min(defect, checked));
      const good_qty = Math.max(0, checked - defect);
      checkedTotalDelta += checked;
      passedTotalDelta += good_qty;
      defectTotalDelta += defect;
      qcItems.push({
        model_size_id: model_size_id || undefined,
        size_id: size_id || undefined,
        checked_qty: checked,
        passed_qty: good_qty,
        defect_qty: defect,
        good_qty,
        key,
      });
    }

    if (qcItems.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Нет нового количества к проверке (всё уже проверено ранее).' });
    }

    const totalCheckedAfter = alreadyCheckedTotal + checkedTotalDelta;
    const isFullyChecked = totalCheckedAfter >= totalFact;

    let qcBatch;
    if (existingQc) {
      qcBatch = existingQc;
      await qcBatch.update(
        {
          checked_total: Number(qcBatch.checked_total || 0) + checkedTotalDelta,
          passed_total: Number(qcBatch.passed_total || 0) + passedTotalDelta,
          defect_total: Number(qcBatch.defect_total || 0) + defectTotalDelta,
          status: isFullyChecked ? 'DONE' : qcBatch.status,
        },
        { transaction: t }
      );
    } else {
      qcBatch = await db.QcBatch.create(
        {
          batch_id: Number(batch_id),
          status: isFullyChecked ? 'DONE' : 'IN_PROGRESS',
          checked_total: checkedTotalDelta,
          passed_total: passedTotalDelta,
          defect_total: defectTotalDelta,
        },
        { transaction: t }
      );
    }

    // Обновляем/создаём позиции по размерам и пополняем склад только на дельту
    for (const it of qcItems) {
      const whereItem = {
        qc_batch_id: qcBatch.id,
        model_size_id: it.model_size_id || null,
        size_id: it.size_id || null,
      };
      const [existingItem, createdItem] = await db.QcBatchItem.findOrCreate({
        where: whereItem,
        defaults: {
          qc_batch_id: qcBatch.id,
          model_size_id: it.model_size_id || null,
          size_id: it.size_id || null,
          checked_qty: it.checked_qty,
          passed_qty: it.passed_qty,
          defect_qty: it.defect_qty,
        },
        transaction: t,
      });
      if (!createdItem) {
        await existingItem.update(
          {
            checked_qty: Number(existingItem.checked_qty || 0) + it.checked_qty,
            passed_qty: Number(existingItem.passed_qty || 0) + it.passed_qty,
            defect_qty: Number(existingItem.defect_qty || 0) + it.defect_qty,
          },
          { transaction: t }
        );
      }

      const warehouse_qty = it.good_qty ?? it.passed_qty ?? 0;
      if (warehouse_qty > 0 && ((it.model_size_id && it.model_size_id > 0) || (it.size_id && it.size_id > 0))) {
        const batchCode = batch.batch_code || `batch-${batch_id}`;
        const whereStock = it.model_size_id
          ? { batch_id: Number(batch_id), model_size_id: it.model_size_id }
          : { batch_id: Number(batch_id), size_id: it.size_id };
        const [stockRow, createdStock] = await db.WarehouseStock.findOrCreate({
          where: whereStock,
          defaults: {
            order_id: batch.order_id,
            model_size_id: it.model_size_id || null,
            size_id: it.size_id || null,
            batch: batchCode,
            batch_id: Number(batch_id),
            qty: warehouse_qty,
          },
          transaction: t,
        });
        if (!createdStock) {
          await stockRow.increment('qty', { by: warehouse_qty, transaction: t });
        }
      }
    }

    // Партия переходит в статус ОТК проведён только когда всё проверено
    if (isFullyChecked) {
      await batch.update({ status: 'QC_DONE' }, { transaction: t });

      // Цепочка: ОТК DONE → Склад IN_PROGRESS
      const now = new Date();
      const qcStage = await db.OrderStage.findOne({ where: { order_id: batch.order_id, stage_key: 'qc' }, transaction: t });
      if (qcStage) await qcStage.update({ status: 'DONE', completed_at: now }, { transaction: t });
      const whStage = await db.OrderStage.findOne({ where: { order_id: batch.order_id, stage_key: 'warehouse' }, transaction: t });
      if (whStage) await whStage.update({ status: 'IN_PROGRESS', started_at: now }, { transaction: t });
    }

    await t.commit();

    const withAssoc = await db.QcBatch.findByPk(qcBatch.id, {
      include: [
        { model: db.SewingBatch, as: 'SewingBatch' },
        { model: db.QcBatchItem, as: 'QcBatchItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/qc — запись ОТК.
 * body: { order_id, model_size_id, checked_qty, passed_qty, defect_qty, batch? }
 * После ОТК: на склад добавляется passed_qty по партии (batch). Если batch не передан — генерируется.
 */
router.post('/qc', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { order_id, model_size_id, checked_qty, passed_qty, defect_qty, batch } = req.body;
    if (!order_id || !model_size_id) {
      return res.status(400).json({ error: 'Укажите order_id, model_size_id' });
    }
    const order = await db.Order.findByPk(order_id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    const ms = await db.ModelSize.findByPk(model_size_id, { transaction: t });
    if (!ms) {
      await t.rollback();
      return res.status(404).json({ error: 'Размер модели не найден' });
    }
    const checked = Math.max(0, parseInt(checked_qty, 10) || 0);
    const passed = Math.max(0, parseInt(passed_qty, 10) || 0);
    // defect_qty = checked_qty - passed_qty (вычисляем, если не передан)
    let defect = parseInt(defect_qty, 10);
    if (Number.isNaN(defect)) defect = Math.max(0, checked - passed);
    else defect = Math.max(0, defect);

    const qcRow = await db.QcRecord.create(
      {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        checked_qty: checked,
        passed_qty: passed,
        defect_qty: defect,
      },
      { transaction: t }
    );

    // На склад: warehouse_qty += passed_qty по партии
    const batchKey = batch && String(batch).trim() ? String(batch).trim() : `qc-${qcRow.id}`;
    const [stockRow, created] = await db.WarehouseStock.findOrCreate({
      where: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: batchKey,
      },
      defaults: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: batchKey,
        qty: passed,
      },
      transaction: t,
    });
    if (!created && passed > 0) {
      await stockRow.increment('qty', { by: passed, transaction: t });
    }
    await t.commit();

    const withAssoc = await db.QcRecord.findByPk(qcRow.id, {
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

// ————— Склад (остатки по размерам и партиям) —————

/** GET /api/warehouse-stock/stock?order_id=&workshop_id= — остатки на складе. По партиям: batch_code, модель, размер, остаток. */
router.get('/stock', async (req, res, next) => {
  try {
    const { order_id, workshop_id } = req.query;
    const where = {};
    if (order_id) where.order_id = Number(order_id);
    if (workshop_id) {
      const orderIds = await db.Order.findAll({
        where: { workshop_id: Number(workshop_id) },
        attributes: ['id'],
        raw: true,
      }).then((rows) => rows.map((r) => r.id));
      if (orderIds.length === 0) return res.json([]);
      where.order_id = { [Op.in]: orderIds };
    }
    const list = await db.WarehouseStock.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', required: false, include: [{ model: db.Size, as: 'Size' }] },
        { model: db.Size, as: 'Size', required: false, attributes: ['id', 'name'] },
        { model: db.Order, as: 'Order', attributes: ['id', 'title', 'model_name', 'tz_code', 'total_quantity', 'quantity', 'photos'], include: [{ model: db.Client, as: 'Client', attributes: ['name'] }, { model: db.OrderPart, as: 'OrderParts', required: false }] },
        { model: db.SewingBatch, as: 'SewingBatch', attributes: ['id', 'batch_code', 'floor_id'], required: false },
      ],
      order: [['order_id'], ['batch_id'], ['model_size_id'], ['size_id'], ['batch']],
    });
    const out = list.map((row) => {
      const j = row.toJSON();
      j.batch_code = row.SewingBatch?.batch_code ?? row.batch ?? `#${row.batch_id || row.id}`;
      j.size_name = row.ModelSize?.Size?.name ?? row.Size?.name ?? String(row.size_id ?? row.model_size_id ?? '—');
      j.batch_floor_id = row.SewingBatch?.floor_id;
      return j;
    });

    const orderIdsWithParts = [...new Set(out.filter((r) => (r.Order?.OrderParts || []).length > 0).map((r) => r.order_id))];
    const kitOrders = [];
    for (const oid of orderIdsWithParts) {
      const order = out.find((r) => r.order_id === oid)?.Order;
      const parts = (order?.OrderParts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (parts.length === 0) continue;
      const partQtyByFloor = {};
      const orderRows = out.filter((r) => r.order_id === oid);
      parts.forEach((p) => {
        const floorQty = orderRows
          .filter((r) => r.batch_floor_id != null && Number(r.batch_floor_id) === Number(p.floor_id))
          .reduce((s, r) => s + (parseInt(r.qty, 10) || 0), 0);
        partQtyByFloor[p.floor_id] = floorQty;
      });
      const kitSummary = computeKitSummary(parts, partQtyByFloor);
      const orderTitle = order?.tz_code && order?.model_name
        ? `${order.tz_code} — ${order.model_name}` : order?.title || `#${oid}`;
      kitOrders.push({
        order_id: oid,
        order_title: orderTitle,
        parts: kitSummary.part_quantities,
        kit_qty: kitSummary.kit_qty,
      });
    }
    res.json({ rows: out, kit_orders: kitOrders });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/ship — отгрузка по warehouse_stock_id.
 * body: { warehouse_stock_id, qty }
 * Правило: qty <= warehouse_stock.qty. После отгрузки остаток уменьшается.
 */
router.post('/ship', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { warehouse_stock_id, qty } = req.body;
    if (!warehouse_stock_id) return res.status(400).json({ error: 'Укажите warehouse_stock_id' });
    const shipQty = Math.max(0, parseInt(qty, 10) || 0);
    if (shipQty <= 0) return res.status(400).json({ error: 'Количество должно быть больше 0' });

    const stockRow = await db.WarehouseStock.findByPk(warehouse_stock_id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!stockRow) {
      await t.rollback();
      return res.status(404).json({ error: 'Позиция на складе не найдена' });
    }
    const currentQty = parseInt(stockRow.qty, 10) || 0;
    if (shipQty > currentQty) {
      await t.rollback();
      return res.status(400).json({
        error: `Нельзя отгрузить больше, чем на складе. Остаток: ${currentQty}, запрошено: ${shipQty}`,
        warehouse_qty: currentQty,
        requested: shipQty,
      });
    }

    const newQty = currentQty - shipQty;
    if (newQty === 0) {
      await stockRow.destroy({ transaction: t });
    } else {
      await stockRow.update({ qty: newQty }, { transaction: t });
    }

    const shipment = await db.Shipment.create(
      {
        batch_id: stockRow.batch_id,
        order_id: stockRow.order_id,
        shipped_at: new Date(),
        status: 'shipped',
      },
      { transaction: t }
    );
    await db.ShipmentItem.create(
      {
        shipment_id: shipment.id,
        model_size_id: stockRow.model_size_id || null,
        size_id: stockRow.size_id || null,
        qty: shipQty,
      },
      { transaction: t }
    );

    await t.commit();
    const withAssoc = await db.Shipment.findByPk(shipment.id, {
      include: [
        { model: db.SewingBatch, as: 'SewingBatch' },
        { model: db.ShipmentItem, as: 'ShipmentItems' },
      ],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/** GET /api/warehouse-stock/stock/summary?order_id= — сводка по заказу: по каждому model_size сумма qty */
router.get('/stock/summary', async (req, res, next) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const rows = await db.WarehouseStock.findAll({
      where: { order_id: Number(order_id) },
      attributes: ['model_size_id', [db.sequelize.fn('SUM', db.sequelize.col('qty')), 'total_qty']],
      group: ['model_size_id'],
      raw: true,
    });
    const sizeIds = rows.map((r) => r.model_size_id);
    const modelSizes = await db.ModelSize.findAll({
      where: { id: sizeIds },
      include: [{ model: db.Size, as: 'Size' }],
    });
    const byId = {};
    modelSizes.forEach((ms) => { byId[ms.id] = ms; });
    const summary = rows.map((r) => ({
      model_size_id: r.model_size_id,
      total_qty: parseInt(r.total_qty, 10) || 0,
      model_size: byId[r.model_size_id],
    }));
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ————— Отгрузка —————

/** GET /api/warehouse-stock/shipments?order_id=&workshop_id= — отгрузки. Новая схема: по batch_id с shipment_items. */
router.get('/shipments', async (req, res, next) => {
  try {
    const { order_id, workshop_id } = req.query;
    const where = {};
    if (order_id) where.order_id = Number(order_id);
    if (workshop_id) {
      const orderIds = await db.Order.findAll({
        where: { workshop_id: Number(workshop_id) },
        attributes: ['id'],
        raw: true,
      }).then((rows) => rows.map((r) => r.id));
      if (orderIds.length === 0) return res.json([]);
      where.order_id = { [Op.in]: orderIds };
    }
    const list = await db.Shipment.findAll({
      where,
      include: [
        { model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }], required: false },
        {
          model: db.Order,
          as: 'Order',
          attributes: ['id', 'title', 'model_name', 'tz_code', 'total_quantity', 'quantity', 'photos'],
          include: [
            { model: db.Client, as: 'Client', attributes: ['name'] },
            { model: db.Workshop, as: 'Workshop', attributes: ['name'] },
          ],
          required: false,
        },
        { model: db.SewingBatch, as: 'SewingBatch', attributes: ['id', 'batch_code', 'order_id'], required: false },
        {
          model: db.ShipmentItem,
          as: 'ShipmentItems',
          include: [
            { model: db.ModelSize, as: 'ModelSize', required: false, include: [{ model: db.Size, as: 'Size' }] },
            { model: db.Size, as: 'Size', required: false, attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['shipped_at', 'DESC']],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/shipments — отгрузка.
 * Новая схема: body: { batch_id, items: [{ model_size_id, qty }] }
 * Правило: qty по размеру ≤ warehouse_stock.qty по этой партии и размеру. После отгрузки склад уменьшается.
 * Легаси: body: { order_id, model_size_id, batch, qty } — одна позиция.
 */
router.post('/shipments', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const { batch_id, items, order_id, model_size_id, batch, qty } = req.body;

    if (batch_id && Array.isArray(items) && items.length > 0) {
      const sewingBatch = await db.SewingBatch.findByPk(batch_id, { transaction: t });
      if (!sewingBatch) {
        await t.rollback();
        return res.status(404).json({ error: 'Партия не найдена' });
      }
      const shipment = await db.Shipment.create(
        {
          batch_id: Number(batch_id),
          order_id: sewingBatch.order_id,
          shipped_at: new Date(),
          status: 'shipped',
        },
        { transaction: t }
      );
      for (const it of items) {
        const shipQty = Math.max(0, parseFloat(it.qty) || 0);
        if (shipQty <= 0) continue;

        let stockRow;
        if (it.warehouse_stock_id) {
          stockRow = await db.WarehouseStock.findOne({
            where: { id: Number(it.warehouse_stock_id), batch_id: Number(batch_id) },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });
        } else {
          const model_size_id_it = Number(it.model_size_id);
          if (!model_size_id_it) continue;
          stockRow = await db.WarehouseStock.findOne({
            where: { batch_id: Number(batch_id), model_size_id: model_size_id_it },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });
        }
        if (!stockRow) {
          await t.rollback();
          return res.status(400).json({
            error: it.warehouse_stock_id
              ? 'Позиция склада не найдена для партии'
              : `Нет остатка по размеру model_size_id=${it.model_size_id} для партии`,
          });
        }
        const currentQty = parseFloat(stockRow.qty) || 0;
        if (shipQty > currentQty) {
          await t.rollback();
          return res.status(400).json({
            error: `Нельзя отгрузить больше, чем warehouse_qty. На складе: ${currentQty}, запрошено: ${shipQty}`,
            warehouse_qty: currentQty,
            requested: shipQty,
          });
        }
        const newQty = currentQty - shipQty;
        if (newQty === 0) {
          await stockRow.destroy({ transaction: t });
        } else {
          await stockRow.update({ qty: newQty }, { transaction: t });
        }
        await db.ShipmentItem.create(
          {
            shipment_id: shipment.id,
            model_size_id: stockRow.model_size_id || null,
            size_id: stockRow.size_id || null,
            qty: shipQty,
          },
          { transaction: t }
        );
      }
      await t.commit();
      const withAssoc = await db.Shipment.findByPk(shipment.id, {
        include: [
          { model: db.SewingBatch, as: 'SewingBatch' },
          { model: db.ShipmentItem, as: 'ShipmentItems', include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }] },
        ],
      });
      return res.status(201).json(withAssoc);
    }

    // Легаси: одна позиция по order_id, model_size_id, batch
    if (!order_id || !model_size_id || !batch) {
      return res.status(400).json({ error: 'Укажите batch_id и items ИЛИ order_id, model_size_id, batch, qty' });
    }
    const shipQty = Math.max(0, parseInt(qty, 10) || 0);
    if (shipQty === 0) {
      return res.status(400).json({ error: 'qty должно быть больше 0' });
    }
    const order = await db.Order.findByPk(order_id, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    const ms = await db.ModelSize.findByPk(model_size_id, { transaction: t });
    if (!ms) {
      await t.rollback();
      return res.status(404).json({ error: 'Размер модели не найден' });
    }
    const stockRow = await db.WarehouseStock.findOne({
      where: {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: String(batch).trim(),
      },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!stockRow) {
      await t.rollback();
      return res.status(400).json({ error: 'Партия не найдена на складе' });
    }
    const currentQty = parseInt(stockRow.qty, 10) || 0;
    if (shipQty > currentQty) {
      await t.rollback();
      return res.status(400).json({
        error: `Нельзя отгрузить больше, чем warehouse_qty. На складе: ${currentQty}, запрошено: ${shipQty}`,
        warehouse_qty: currentQty,
        requested: shipQty,
      });
    }
    const newStockQty = currentQty - shipQty;
    if (newStockQty === 0) {
      await stockRow.destroy({ transaction: t });
    } else {
      await stockRow.update({ qty: newStockQty }, { transaction: t });
    }
    const shipment = await db.Shipment.create(
      {
        order_id: Number(order_id),
        model_size_id: Number(model_size_id),
        batch: String(batch).trim(),
        qty: shipQty,
        shipped_at: new Date(),
        status: 'shipped',
      },
      { transaction: t }
    );
    await t.commit();
    const withAssoc = await db.Shipment.findByPk(shipment.id, {
      include: [{ model: db.ModelSize, as: 'ModelSize', include: [{ model: db.Size, as: 'Size' }] }],
    });
    res.status(201).json(withAssoc);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/orders/:order_id/send-to-shipping
 * Отправить на отгрузку: warehouse DONE, shipping IN_PROGRESS (единый пайплайн).
 */
router.post('/orders/:order_id/send-to-shipping', async (req, res, next) => {
  try {
    const order_id = Number(req.params.order_id);
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const now = new Date();
    const whStage = await db.OrderStage.findOne({ where: { order_id, stage_key: 'warehouse' } });
    if (whStage) await whStage.update({ status: 'DONE', completed_at: now });
    const shipStage = await db.OrderStage.findOne({ where: { order_id, stage_key: 'shipping' } });
    if (shipStage) await shipStage.update({ status: 'IN_PROGRESS', started_at: now });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse-stock/shipments/:id/complete
 * Завершить отгрузку: shipment status = completed, order_stages.shipping = DONE для заказа.
 */
router.post('/shipments/:id/complete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Укажите id отгрузки' });
    const shipment = await db.Shipment.findByPk(id, { attributes: ['id', 'order_id'] });
    if (!shipment) return res.status(404).json({ error: 'Отгрузка не найдена' });
    await shipment.update({ status: 'completed' });
    const now = new Date();
    const shipStage = await db.OrderStage.findOne({ where: { order_id: shipment.order_id, stage_key: 'shipping' } });
    if (shipStage) await shipStage.update({ status: 'DONE', completed_at: now });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
