/**
 * Роуты раскроя
 * MVP: задачи на раскрой по заказам, по типу
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');
const { getWeekStart } = require('../utils/planningUtils');

const router = express.Router();
// Этажи 1–4: раскрой передаётся в пошив (в т.ч. цех Салиха / 1 этаж)
const SEWING_FLOOR_IDS = [1, 2, 3, 4];
const { syncDocumentsForChainIds } = require('../services/chainDocumentsSync');

const CHAIN_DOC_STATUSES = new Set(['pending', 'in_progress', 'done']);
const CHAIN_DOC_WORKSHOPS = new Set(['floor_4', 'floor_3', 'floor_2', 'aksy', 'outsource']);

function normalizeCuttingDocIso(v) {
  const s = String(v || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

const cuttingDocumentInclude = [
  {
    model: db.Order,
    attributes: [
      'id',
      'title',
      'tz_code',
      'model_name',
      'article',
      'client_id',
      'photos',
      'quantity',
      'total_quantity',
    ],
    include: [{ model: db.Client, attributes: ['id', 'name'] }],
  },
  {
    model: db.PlanningChain,
    attributes: ['id', 'section_id', 'purchase_week_start', 'cutting_week_start', 'sewing_week_start'],
  },
  {
    model: db.CuttingFactDetail,
    as: 'cutting_facts',
    required: false,
    attributes: ['id', 'color', 'size', 'quantity', 'created_at', 'updated_at'],
  },
  {
    model: db.SewingDocument,
    as: 'sewing_doc',
    required: false,
    attributes: ['id', 'cutting_document_id', 'status'],
  },
];

function parseCuttingDocIdParam(req) {
  const id = parseInt(req.params.id, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Синхронизация факта раскроя с планом пошива (без ожидания статуса done).
 */
async function syncCuttingFactToSewingPlan(factRow) {
  const qty = Math.max(0, parseInt(factRow.quantity, 10) || 0);
  const cuttingDoc = await db.CuttingDocument.findByPk(factRow.cutting_document_id);
  if (!cuttingDoc) return;

  let sewingDoc = await db.SewingDocument.findOne({
    where: { cutting_document_id: cuttingDoc.id },
  });
  if (!sewingDoc) {
    sewingDoc = await db.SewingDocument.create({
      cutting_document_id: cuttingDoc.id,
      chain_id: cuttingDoc.chain_id,
      order_id: cuttingDoc.order_id,
      section_id: cuttingDoc.section_id,
      floor_id: cuttingDoc.floor_id != null && cuttingDoc.floor_id !== '' ? String(cuttingDoc.floor_id) : null,
      week_start: cuttingDoc.actual_week_start || cuttingDoc.week_start,
      status: 'pending',
    });
    console.log('[cutting→sewing] создан документ пошива:', sewingDoc.id);
  }

  const [sewingFact, created] = await db.SewingFactDetail.findOrCreate({
    where: {
      sewing_document_id: sewingDoc.id,
      color: factRow.color,
      size: factRow.size,
    },
    defaults: {
      cutting_quantity: qty,
      sewing_quantity: 0,
    },
  });
  if (!created) {
    await sewingFact.update({ cutting_quantity: qty });
  }
  console.log(
    created ? '[cutting→sewing] создана строка пошива:' : '[cutting→sewing] обновлён план пошива:',
    factRow.color,
    factRow.size,
    '→',
    qty
  );
}

/**
 * GET /api/cutting/documents — документы раскроя из плана цеха
 */
router.get('/documents', async (req, res, next) => {
  try {
    const rows = await db.CuttingDocument.findAll({
      order: [
        ['week_start', 'ASC'],
        ['id', 'ASC'],
      ],
      include: cuttingDocumentInclude,
    });
    res.json(rows.map((r) => r.toJSON()));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/documents/from-chain
 */
router.post('/documents/from-chain', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager' });
    }
    const chainIds = Array.isArray(req.body?.chain_ids) ? req.body.chain_ids : [];
    await syncDocumentsForChainIds(chainIds);
    await logAudit(req.user.id, 'SYNC', 'cutting_documents_from_chain', chainIds.length);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cutting/documents/:id/facts
 */
router.get('/documents/:id/facts', async (req, res, next) => {
  try {
    const docId = parseCuttingDocIdParam(req);
    if (!docId) return res.status(400).json({ error: 'Неверный id' });
    const doc = await db.CuttingDocument.findByPk(docId);
    if (!doc) return res.status(404).json({ error: 'Не найдено' });
    const facts = await db.CuttingFactDetail.findAll({
      where: { cutting_document_id: docId },
      order: [['id', 'ASC']],
      attributes: ['id', 'color', 'size', 'quantity'],
    });
    res.json(facts.map((f) => f.toJSON()));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/documents/:id/facts
 */
router.post('/documents/:id/facts', async (req, res, next) => {
  try {
    const docId = parseCuttingDocIdParam(req);
    if (!docId) return res.status(400).json({ error: 'Неверный id' });
    const doc = await db.CuttingDocument.findByPk(docId);
    if (!doc) return res.status(404).json({ error: 'Не найдено' });
    const color = req.body?.color != null ? String(req.body.color).slice(0, 100) : '';
    const size = req.body?.size != null ? String(req.body.size).slice(0, 50) : '';
    const quantity = Math.max(0, parseInt(req.body?.quantity, 10) || 0);
    const row = await db.CuttingFactDetail.create({
      cutting_document_id: docId,
      color: color || null,
      size: size || null,
      quantity,
    });
    await logAudit(req.user.id, 'CREATE', 'cutting_fact_detail', row.id);
    if (quantity > 0) {
      try {
        await syncCuttingFactToSewingPlan(row);
      } catch (sewingErr) {
        console.error('[cutting→sewing] ошибка после POST факта:', sewingErr.message);
      }
    }
    res.status(201).json(row.toJSON());
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/cutting/facts/:factId
 */
router.patch('/facts/:factId', async (req, res, next) => {
  try {
    const factId = parseInt(req.params.factId, 10);
    if (!factId) return res.status(400).json({ error: 'Неверный id' });
    console.log(
      '[cutting/facts/patch] id:',
      factId,
      'quantity:',
      req.body?.quantity,
      'time:',
      new Date().toISOString()
    );
    const row = await db.CuttingFactDetail.findByPk(factId);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const patch = {};
    if (req.body.color !== undefined) {
      patch.color = req.body.color == null || req.body.color === '' ? null : String(req.body.color).slice(0, 100);
    }
    if (req.body.size !== undefined) {
      patch.size = req.body.size == null || req.body.size === '' ? null : String(req.body.size).slice(0, 50);
    }
    if (req.body.quantity !== undefined) {
      patch.quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    await row.update(patch);
    await row.reload();
    await logAudit(req.user.id, 'UPDATE', 'cutting_fact_detail', factId);
    try {
      await syncCuttingFactToSewingPlan(row);
    } catch (sewingErr) {
      console.error('[cutting→sewing] ошибка после PATCH факта:', sewingErr.message);
    }
    res.json(row.toJSON());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/sync-to-sewing
 * Однократная синхронизация всех фактов раскроя (quantity > 0) в план пошива.
 */
router.post('/sync-to-sewing', async (req, res, next) => {
  try {
    const allFacts = await db.CuttingFactDetail.findAll({
      where: { quantity: { [Op.gt]: 0 } },
      include: [{ model: db.CuttingDocument, required: true }],
    });
    let synced = 0;
    for (const fact of allFacts) {
      if (!fact.CuttingDocument) continue;
      try {
        await syncCuttingFactToSewingPlan(fact);
        synced += 1;
      } catch (e) {
        console.error('[sync-to-sewing] строка', fact.id, e.message);
      }
    }
    console.log('[sync-to-sewing] синхронизировано:', synced);
    res.json({ synced, total: allFacts.length });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cutting/facts/:factId
 */
router.delete('/facts/:factId', async (req, res, next) => {
  try {
    const factId = parseInt(req.params.factId, 10);
    if (!factId) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.CuttingFactDetail.findByPk(factId);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    await row.destroy();
    await logAudit(req.user.id, 'DELETE', 'cutting_fact_detail', factId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/cutting/documents/:id
 */
router.patch('/documents/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.CuttingDocument.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const patch = {};
    if (req.body.week_start !== undefined) {
      const raw = normalizeCuttingDocIso(req.body.week_start);
      if (!raw) return res.status(400).json({ error: 'Некорректная week_start' });
      patch.week_start = getWeekStart(raw);
    }
    if (req.body.actual_week_start !== undefined) {
      if (req.body.actual_week_start == null || req.body.actual_week_start === '') {
        patch.actual_week_start = null;
      } else {
        const d = normalizeCuttingDocIso(req.body.actual_week_start);
        if (!d) return res.status(400).json({ error: 'Некорректная actual_week_start' });
        patch.actual_week_start = getWeekStart(d);
      }
    }
    if (req.body.section_id !== undefined) {
      if (req.body.section_id == null || req.body.section_id === '') {
        patch.section_id = null;
      } else {
        patch.section_id = String(req.body.section_id).trim().slice(0, 64) || null;
      }
    }
    if (req.body.status !== undefined) {
      const v = String(req.body.status).trim();
      if (!CHAIN_DOC_STATUSES.has(v)) return res.status(400).json({ error: 'Недопустимый status' });
      patch.status = v;
    }
    if (req.body.comment !== undefined) {
      patch.comment = req.body.comment == null ? null : String(req.body.comment).slice(0, 5000);
    }
    if (req.body.workshop !== undefined) {
      const raw = req.body.workshop;
      if (raw == null || raw === '') {
        patch.workshop = null;
      } else {
        const w = String(raw).trim();
        if (!CHAIN_DOC_WORKSHOPS.has(w)) {
          return res.status(400).json({ error: 'Недопустимый workshop' });
        }
        patch.workshop = w;
      }
    }
    if (req.body.floor_id !== undefined) {
      if (req.body.floor_id == null || req.body.floor_id === '') {
        patch.floor_id = null;
      } else {
        const fid = parseInt(req.body.floor_id, 10);
        if (!Number.isFinite(fid) || fid < 1) {
          return res.status(400).json({ error: 'Некорректный floor_id' });
        }
        const bf = await db.BuildingFloor.findByPk(fid);
        if (!bf) return res.status(400).json({ error: 'Этаж не найден' });
        patch.floor_id = fid;
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    await row.update(patch);
    await logAudit(req.user.id, 'UPDATE', 'cutting_document', id);

    const full = await db.CuttingDocument.findByPk(id, { include: cuttingDocumentInclude });
    res.json(full.toJSON());
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cutting/tasks?cutting_type=Аксы|cutting_type=Аутсорс|...
 * Список задач раскроя по типу
 */
router.get('/tasks', async (req, res, next) => {
  try {
    const { cutting_type } = req.query;
    const where = {};
    if (cutting_type) where.cutting_type = cutting_type;

    const tasks = await db.CuttingTask.findAll({
      where,
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [
            { model: db.Client, as: 'Client' },
            { model: db.OrderStatus, as: 'OrderStatus' },
            { model: db.OrderVariant, as: 'OrderVariants', include: [{ model: db.Size, as: 'Size' }] },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cutting/facts-by-order
 * Сумма quantity_actual по actual_variants всех задач раскроя, ключ — order_id (связь с заказом в планировании).
 */
router.get('/facts-by-order', async (req, res, next) => {
  try {
    const rows = await db.CuttingTask.findAll({
      attributes: ['order_id', 'actual_variants'],
      raw: true,
    });
    const byOrder = {};
    for (const t of rows) {
      const vars = t.actual_variants && Array.isArray(t.actual_variants) ? t.actual_variants : [];
      let s = 0;
      for (const v of vars) {
        s += parseInt(v.quantity_actual, 10) || 0;
      }
      const oid = Number(t.order_id);
      if (!Number.isFinite(oid)) continue;
      byOrder[oid] = (byOrder[oid] || 0) + s;
    }
    res.json(byOrder);
  } catch (err) {
    next(err);
  }
});

const FLOORS = [1, 2, 3, 4];

/**
 * Есть ли пересекающаяся активная задача на том же этаже
 * Пересечение: (start_date <= endDate) AND (end_date >= startDate)
 */
async function hasOverlappingFloorTask(db, floor, excludeTaskId, startDate, endDate) {
  if (!startDate || !endDate) return false;
  const replacements = { floor: Number(floor), startDate, endDate };
  const exclude = excludeTaskId ? 'AND id != :excludeId' : '';
  if (excludeTaskId) replacements.excludeId = parseInt(excludeTaskId, 10);
  const [rows] = await db.sequelize.query(
    `SELECT id FROM cutting_tasks WHERE floor = :floor AND status != 'Готово'
     AND start_date IS NOT NULL AND end_date IS NOT NULL
     AND start_date <= :endDate AND end_date >= :startDate ${exclude} LIMIT 1`,
    { replacements }
  );
  return rows.length > 0;
}

/** Валидация роста: PRESET — 165 или 170, CUSTOM — 120–220 */
function parseHeight(body) {
  const type = body.height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET';
  let value = parseInt(body.height_value, 10);
  if (type === 'PRESET') {
    if (value !== 165 && value !== 170) value = 170;
  } else {
    if (Number.isNaN(value) || value < 120 || value > 220) value = 170;
  }
  return { height_type: type, height_value: value };
}

/**
 * POST /api/cutting/tasks
 * Добавить задачу на раскрой
 * body: { order_id, cutting_type, floor, operation?, status?, responsible?, start_date?, end_date?, height_type?, height_value? }
 */
router.post('/tasks', async (req, res, next) => {
  try {
    const { order_id, cutting_type, floor, operation, status, responsible, start_date, end_date } = req.body;
    const height = parseHeight(req.body);

    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });
    if (!cutting_type || String(cutting_type).trim() === '') {
      return res.status(400).json({ error: 'Укажите тип раскроя' });
    }

    const floorNum = floor != null ? parseInt(floor, 10) : null;
    if (floorNum == null || isNaN(floorNum) || !FLOORS.includes(floorNum)) {
      return res.status(400).json({ error: 'Укажите этаж (1–4)' });
    }

    const order = await db.Order.findByPk(order_id);
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    // Технолог — только свой этаж
    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = order.building_floor_id ?? order.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа к этому заказу' });
      }
    }

    if (start_date && end_date) {
      const overlap = await hasOverlappingFloorTask(db, floorNum, null, start_date, end_date);
      if (overlap) {
        return res.status(400).json({ error: 'На этом этаже уже есть активная задача с пересекающимися датами' });
      }
    }

    const task = await db.CuttingTask.create({
      order_id,
      cutting_type: String(cutting_type).trim(),
      floor: floorNum,
      operation: operation ? String(operation).trim() : null,
      status: status || 'Ожидает',
      responsible: responsible ? String(responsible).trim() : null,
      start_date: start_date || null,
      end_date: end_date || null,
      height_type: height.height_type,
      height_value: height.height_value,
    });

    await logAudit(req.user.id, 'CREATE', 'cutting_task', task.id);
    const full = await db.CuttingTask.findByPk(task.id, {
      include: [{ model: db.Order, as: 'Order', include: [{ model: db.Client, as: 'Client' }] }],
    });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cutting/tasks/:id
 * Получить задачу раскроя по id (для печати)
 */
router.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await db.CuttingTask.findByPk(req.params.id, {
      include: [
        {
          model: db.Order,
          as: 'Order',
          include: [{ model: db.Client, as: 'Client' }],
        },
      ],
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    const t = task.get({ plain: true });
    const order = t.Order;
    const variants = (t.actual_variants || []).map((v) => ({
      color: v.color || '',
      size: v.size || '',
      quantity_planned: v.quantity_planned ?? 0,
      quantity_actual: v.quantity_actual ?? 0,
    }));
    res.json({
      id: t.id,
      order_id: t.order_id,
      cutting_type: t.cutting_type,
      floor: t.floor,
      status: t.status,
      responsible: t.responsible,
      start_date: t.start_date,
      end_date: t.end_date,
      height_value: t.height_value,
      order: order ? {
        id: order.id,
        title: order.title,
        tz_code: order.tz_code,
        model_name: order.model_name,
        client_name: order.Client?.name || '—',
      } : null,
      actual_variants: variants,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cutting/tasks/:id
 * Редактировать задачу
 */
router.put('/tasks/:id', async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const { operation, status, responsible, actual_variants, floor, start_date, end_date } = req.body;
    const height = parseHeight(req.body);

    const task = await db.CuttingTask.findByPk(taskId, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = task.Order?.building_floor_id ?? task.Order?.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    const updates = {};
    if (operation !== undefined) updates.operation = operation ? String(operation).trim() : null;
    if (status !== undefined) updates.status = String(status).trim() || 'Ожидает';
    if (responsible !== undefined) updates.responsible = responsible ? String(responsible).trim() : null;
    if (actual_variants !== undefined) updates.actual_variants = Array.isArray(actual_variants) ? actual_variants : null;

    // Этаж можно менять только если задача не завершена
    if (floor !== undefined) {
      if (task.status === 'Готово') {
        return res.status(400).json({ error: 'Нельзя изменить этаж у завершённой задачи' });
      }
      const floorNum = parseInt(floor, 10);
      if (isNaN(floorNum) || !FLOORS.includes(floorNum)) {
        return res.status(400).json({ error: 'Этаж должен быть от 1 до 4' });
      }
      updates.floor = floorNum;
    }
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (end_date !== undefined) updates.end_date = end_date || null;
    if (req.body.height_type !== undefined || req.body.height_value !== undefined) {
      updates.height_type = height.height_type;
      updates.height_value = height.height_value;
    }

    // При смене этажа или дат — проверка пересечений (если задача не завершена и есть даты)
    const newFloor = updates.floor ?? task.floor;
    const newStart = updates.start_date ?? task.start_date;
    const newEnd = updates.end_date ?? task.end_date;
    if (task.status !== 'Готово' && newStart && newEnd) {
      const overlap = await hasOverlappingFloorTask(db, newFloor, taskId, newStart, newEnd);
      if (overlap) {
        return res.status(400).json({ error: 'На этом этаже уже есть активная задача с пересекающимися датами' });
      }
    }

    await task.update(updates);
    await logAudit(req.user.id, 'UPDATE', 'cutting_task', taskId);

    // Когда задача переведена в «Готово» — автоматически передаём заказ в пошив
    if (String(updates.status ?? task.status).trim() === 'Готово') {
      const orderId = task.order_id;
      const floorId = Number(updates.floor ?? task.floor);
      if (orderId && floorId && SEWING_FLOOR_IDS.includes(floorId)) {
        await db.SewingOrderFloor.upsert(
          { order_id: orderId, floor_id: floorId, status: 'IN_PROGRESS', done_at: null, done_batch_id: null },
          { conflictFields: ['order_id', 'floor_id'] }
        );
      }
      const now = new Date();
      const cutStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'cutting' } });
      if (cutStage) await cutStage.update({ status: 'DONE', completed_at: now });
      const sewingStage = await db.OrderStage.findOne({ where: { order_id: orderId, stage_key: 'sewing' } });
      if (sewingStage) await sewingStage.update({ status: 'IN_PROGRESS', started_at: now });
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cutting/tasks/:id
 */
router.delete('/tasks/:id', async (req, res, next) => {
  try {
    const task = await db.CuttingTask.findByPk(req.params.id, {
      include: [{ model: db.Order, as: 'Order' }],
    });
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (req.user.role === 'technologist' && req.allowedFloorId) {
      const orderFloor = task.Order?.building_floor_id ?? task.Order?.floor_id;
      if (orderFloor == null || Number(orderFloor) !== Number(req.allowedFloorId)) {
        return res.status(403).json({ error: 'Нет доступа' });
      }
    }

    await task.destroy();
    await logAudit(req.user.id, 'DELETE', 'cutting_task', task.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/complete
 * Завершить раскрой по заказу (и опционально этажу). Проверка: факт >= план. order_stages.cutting = DONE.
 */
router.post('/complete', async (req, res, next) => {
  try {
    const { order_id, floor_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });

    const order = await db.Order.findByPk(Number(order_id), { attributes: ['id', 'quantity', 'total_quantity'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const where = { order_id: Number(order_id) };
    if (floor_id != null && floor_id !== '') where.floor = Number(floor_id);

    const tasks = await db.CuttingTask.findAll({ where, raw: true });
    let planTotal = 0;
    let factTotal = 0;
    for (const t of tasks) {
      const variants = t.actual_variants && Array.isArray(t.actual_variants) ? t.actual_variants : [];
      variants.forEach((v) => {
        planTotal += parseInt(v.quantity_planned, 10) || 0;
        factTotal += parseInt(v.quantity_actual, 10) || 0;
      });
    }
    if (planTotal <= 0) planTotal = Number(order.total_quantity ?? order.quantity ?? 0) || 0;
    // Факт может отличаться от плана (лекала, ткань, остатки) — система гибкая, без блокировки.

    const now = new Date();
    const cutStage = await db.OrderStage.findOne({ where: { order_id: Number(order_id), stage_key: 'cutting' } });
    if (cutStage) await cutStage.update({ status: 'DONE', completed_at: now });
    // Цепочка: раскрой DONE → пошив IN_PROGRESS
    const sewingStage = await db.OrderStage.findOne({ where: { order_id: Number(order_id), stage_key: 'sewing' } });
    if (sewingStage) await sewingStage.update({ status: 'IN_PROGRESS', started_at: now });

    // Автоматическая передача в пошив: создаём sewing_order_floors для этажей с раскроем
    const uniqueFloors = [...new Set(tasks.map((t) => t.floor).filter((f) => f != null && SEWING_FLOOR_IDS.includes(Number(f))))];
    for (const fid of uniqueFloors) {
      await db.SewingOrderFloor.upsert(
        { order_id: Number(order_id), floor_id: Number(fid), status: 'IN_PROGRESS', done_at: null, done_batch_id: null },
        { conflictFields: ['order_id', 'floor_id'] }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cutting/send-to-sewing
 * Единая цепочка: не создаём sewing_plan_rows. Только:
 * - проверка плана в Планировании (production_plan_day);
 * - upsert sewing_order_floors (order_id, floor_id) со статусом IN_PROGRESS;
 * - order_stages.sewing = IN_PROGRESS.
 * План по дням на странице Пошив читается из production_plan_day (GET /api/sewing/board).
 */
router.post('/send-to-sewing', async (req, res, next) => {
  try {
    const { order_id, floor_id } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const fid = Number(floor_id);
    if (!SEWING_FLOOR_IDS.includes(fid)) {
      return res.status(400).json({ error: 'Этаж пошива должен быть 1, 2, 3 или 4' });
    }

    const order = await db.Order.findByPk(Number(order_id), { attributes: ['id'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    // План пошива опционален — можно отправить в пошив без плана, факт раскроя уже есть.
    await db.SewingOrderFloor.upsert(
      { order_id: Number(order_id), floor_id: fid, status: 'IN_PROGRESS', done_at: null, done_batch_id: null },
      { conflictFields: ['order_id', 'floor_id'] }
    );

    const now = new Date();
    const sewingStage = await db.OrderStage.findOne({ where: { order_id: Number(order_id), stage_key: 'sewing' } });
    if (sewingStage) await sewingStage.update({ status: 'IN_PROGRESS', started_at: now });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
