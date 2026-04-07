/**
 * Роуты пошива: очередь задач по этажам.
 * Единая цепочка: план из production_plan_day, факт из sewing_fact, статус sewing_order_floors, партии sewing_batches.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { getWeekStart } = require('../utils/planningUtils');
const { computeKitSummary } = require('../utils/kitLogic');
const WORKING_DAYS_PER_WEEK = 6;

const router = express.Router();

/** Понедельник недели для даты (ISO) */
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/** Воскресенье недели для даты */
function getSunday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/** Этажи пошива по умолчанию: 1–4 (в т.ч. цех Салиха / 1 этаж) */
const SEWING_FLOOR_IDS_DEFAULT = [1, 2, 3, 4];

/**
 * Вычислить фактический раскрой без дублирования.
 * cut_qty = SUM(quantity_actual) по уникальным (color, size) — берём max при повторах,
 * чтобы избежать дублирования при нескольких CuttingTask или повторных записях в actual_variants.
 */
function getCutQtyDeduplicated(cutTasks) {
  const byColorSize = {};
  for (const t of cutTasks || []) {
    for (const v of t.actual_variants || []) {
      const color = String(v.color || '').trim() || '—';
      const size = String(v.size || '').trim() || '—';
      const key = `${color}|${size}`;
      const qty = parseInt(v.quantity_actual, 10) || 0;
      byColorSize[key] = Math.max(byColorSize[key] || 0, qty);
    }
  }
  return Object.values(byColorSize).reduce((s, q) => s + q, 0);
}

/**
 * Получить id этажей пошива из building_floors.
 * Логика:
 *  - если есть этажи с названием «Производство» — считаем их швейными;
 *  - ДОПОЛНИТЕЛЬНО всегда берём этажи 1–4, кроме «Склад» — чтобы
 *    1-й этаж (Салиха / Финиш) тоже участвовал в цепочке пошива.
 */
async function getSewingFloorIds() {
  const floors = await db.BuildingFloor.findAll({ attributes: ['id', 'name'], raw: true });
  const result = new Set();

  (floors || []).forEach((f) => {
    const name = String(f.name || '');
    const isProizv = /Производство|производство/i.test(name);
    const isSklad = /склад/i.test(name);
    // 1) Все этажи с «Производство»
    if (isProizv) result.add(f.id);
    // 2) Все этажи 1–4 кроме «Склад» — включая 1 этаж (Салиха / Финиш)
    if (f.id >= 1 && f.id <= 4 && !isSklad) result.add(f.id);
  });

  if (result.size > 0) {
    return Array.from(result).sort((a, b) => a - b);
  }
  return SEWING_FLOOR_IDS_DEFAULT;
}

/**
 * GET /api/sewing/facts-by-order
 * Сумма fact_qty из sewing_fact по заказу (этажи пошива), ключ — order_id — для черновика планирования.
 */
router.get('/facts-by-order', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const rows = await db.SewingFact.findAll({
      where: { floor_id: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'fact_qty'],
      raw: true,
    });
    const byOrder = {};
    for (const r of rows || []) {
      const oid = Number(r.order_id);
      if (!Number.isFinite(oid)) continue;
      byOrder[oid] = (byOrder[oid] || 0) + (Number(r.fact_qty) || 0);
    }
    res.json(byOrder);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sewing/fact-add
 * Добавить факт пошива: sewn_qty += add_qty.
 * available = cut_fact_qty - sewn_qty. Валидация: add_qty <= available.
 * Body: { order_id, floor_id, add_qty }
 */
router.put('/fact-add', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, add_qty } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива' });
    }
    const addQty = Math.max(0, parseInt(add_qty, 10) || 0);
    if (addQty <= 0) {
      return res.json({ ok: true, new_sewn: 0, new_available: 0 });
    }

    const cutTasks = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id), status: 'Готово', floor: effectiveFloorId },
      attributes: ['actual_variants'],
      raw: true,
    });
    const cutFactQty = getCutQtyDeduplicated(cutTasks);

    const factRows = await db.SewingFact.findAll({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId },
      attributes: ['date', 'fact_qty'],
      raw: true,
    });
    let sewnQty = 0;
    factRows.forEach((r) => { sewnQty += Number(r.fact_qty) || 0; });
    const available = Math.max(0, cutFactQty - sewnQty);
    // Система гибкая: допускаем ввод факта больше доступного (реальное производство может отличаться).

    const today = new Date().toISOString().slice(0, 10);
    const existing = factRows.find((r) => String(r.date).slice(0, 10) === today);
    const newTodayQty = (Number(existing?.fact_qty) || 0) + addQty;

    await db.SewingFact.upsert(
      {
        order_id: Number(order_id),
        floor_id: effectiveFloorId,
        date: today,
        fact_qty: newTodayQty,
      },
      { conflictFields: ['order_id', 'floor_id', 'date'] }
    );

    const newSewn = sewnQty + addQty;
    const newAvailable = Math.max(0, cutFactQty - newSewn);
    res.json({ ok: true, new_sewn: newSewn, new_available: newAvailable });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sewing/fact-total
 * Упрощённый ввод: заменить все записи sewing_fact одной строкой на сегодня (для обратной совместимости).
 * Body: { order_id, floor_id, fact_total }
 */
/**
 * GET /api/sewing/matrix?order_id=&floor_id=
 * Матрица цвет×размер из раскроя (actual_variants) или заказа (order_variants).
 * Возвращает: colors, sizes, cutByColorSize, cut_total, sewn, available.
 */
router.get('/matrix', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const order_id = req.query.order_id ? Number(req.query.order_id) : null;
    const floor_id = req.query.floor_id != null ? Number(req.query.floor_id) : null;
    if (!order_id || !floor_id || !sewingFloorIds.includes(floor_id)) {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }

    const colors = [];
    const sizes = [];
    const cutByColorSize = {};

    const cutTasks = await db.CuttingTask.findAll({
      where: { order_id, status: 'Готово', floor: floor_id },
      attributes: ['actual_variants'],
      raw: true,
    });
    for (const t of cutTasks) {
      for (const v of t.actual_variants || []) {
        const color = String(v.color || '').trim() || '—';
        const size = String(v.size || '').trim() || '—';
        const qty = parseInt(v.quantity_actual, 10) || 0;
        if (!colors.includes(color)) colors.push(color);
        if (!sizes.includes(size)) sizes.push(size);
        const key = `${color}|${size}`;
        cutByColorSize[key] = Math.max(cutByColorSize[key] || 0, qty);
      }
    }

    if (colors.length === 0 || sizes.length === 0) {
      const orderVariants = await db.OrderVariant.findAll({
        where: { order_id },
        include: [{ model: db.Size, as: 'Size', attributes: ['id', 'name', 'code'] }],
      });
      for (const ov of orderVariants) {
        const color = String(ov.color || '').trim() || '—';
        const size = (ov.Size && (ov.Size.name || ov.Size.code)) ? String(ov.Size.name || ov.Size.code) : String(ov.size_id || '—');
        if (size !== '—' && !sizes.includes(size)) sizes.push(size);
        if (!colors.includes(color)) colors.push(color);
        const key = `${color}|${size}`;
        cutByColorSize[key] = (cutByColorSize[key] || 0) + (parseInt(ov.quantity, 10) || 0);
      }
    }

    sizes.sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });

    const factRows = await db.SewingFact.findAll({
      where: { order_id, floor_id },
      attributes: ['fact_qty'],
      raw: true,
    });
    const sewn = factRows.reduce((s, r) => s + (Number(r.fact_qty) || 0), 0);

    const matrixRows = await db.SewingFactMatrix.findAll({
      where: { order_id, floor_id },
      attributes: ['color', 'size', 'fact_qty'],
      raw: true,
    });
    let sewnByColorSize = {};
    matrixRows.forEach((r) => {
      const color = String(r.color || '').trim() || '—';
      const size = String(r.size || '').trim() || '—';
      const key = `${color}|${size}`;
      sewnByColorSize[key] = (sewnByColorSize[key] || 0) + (Number(r.fact_qty) || 0);
    });
    const cut_total = Object.values(cutByColorSize).reduce((s, q) => s + q, 0);
    if (sewn > 0 && cut_total > 0 && Object.keys(sewnByColorSize).length === 0) {
      colors.forEach((color) => {
        sizes.forEach((size) => {
          const key = `${color}|${size}`;
          const cut = cutByColorSize[key] || 0;
          sewnByColorSize[key] = Math.round((sewn * cut) / cut_total);
        });
      });
      const roundedSum = Object.values(sewnByColorSize).reduce((a, b) => a + b, 0);
      if (roundedSum !== sewn && colors.length > 0 && sizes.length > 0) {
        const firstKey = `${colors[0]}|${sizes[0]}`;
        sewnByColorSize[firstKey] = (sewnByColorSize[firstKey] || 0) + (sewn - roundedSum);
      }
    }
    const available = Math.max(0, cut_total - sewn);

    res.json({
      colors,
      sizes,
      cutByColorSize,
      cut_total,
      sewn,
      available,
      sewnByColorSize,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sewing/fact-matrix
 * Сохранить факт пошива по матрице. Body: { order_id, floor_id, items: [{ color, size, fact_qty }] }
 * Или matrix: { "color|size": qty }
 */
router.put('/fact-matrix', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, items, matrix } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива' });
    }

    let totalQty = 0;
    if (Array.isArray(items)) {
      items.forEach((i) => { totalQty += Math.max(0, parseInt(i.fact_qty, 10) || 0); });
    } else if (matrix && typeof matrix === 'object') {
      Object.values(matrix).forEach((v) => { totalQty += Math.max(0, parseInt(v, 10) || 0); });
    }

    const cutTasks = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id), status: 'Готово', floor: effectiveFloorId },
      attributes: ['actual_variants'],
      raw: true,
    });
    const cutTotal = getCutQtyDeduplicated(cutTasks);
    const factRows = await db.SewingFact.findAll({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId },
      attributes: ['date', 'fact_qty'],
      raw: true,
    });
    const sewn = factRows.reduce((s, r) => s + (Number(r.fact_qty) || 0), 0);
    const available = Math.max(0, cutTotal - sewn);
    // Система гибкая: факт может отличаться от раскроя — без блокировки

    const today = new Date().toISOString().slice(0, 10);
    const existingToday = factRows.find((r) => r.date && String(r.date).slice(0, 10) === today);
    const existingTodayQty = existingToday ? Number(existingToday.fact_qty) || 0 : 0;
    const sewnOtherDays = sewn - existingTodayQty;
    const newTodayQty = totalQty;
    const newSewn = sewnOtherDays + newTodayQty;

    await db.SewingFact.upsert(
      {
        order_id: Number(order_id),
        floor_id: effectiveFloorId,
        date: today,
        fact_qty: newTodayQty,
      },
      { conflictFields: ['order_id', 'floor_id', 'date'] }
    );

    await db.SewingFactMatrix.destroy({ where: { order_id: Number(order_id), floor_id: effectiveFloorId } });
    if (Array.isArray(items) && items.length > 0) {
      const toInsert = items
        .map((i) => ({
          order_id: Number(order_id),
          floor_id: effectiveFloorId,
          color: String(i.color || '').trim() || '—',
          size: String(i.size || '').trim() || '—',
          fact_qty: Math.max(0, parseInt(i.fact_qty, 10) || 0),
        }))
        .filter((i) => i.fact_qty > 0);
      if (toInsert.length > 0) {
        await db.SewingFactMatrix.bulkCreate(toInsert);
      }
    }

    res.json({ ok: true, new_sewn: newSewn, new_available: Math.max(0, cutTotal - newSewn) });
  } catch (err) {
    next(err);
  }
});

router.put('/fact-total', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, fact_total } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива' });
    }
    const total = Math.max(0, parseInt(fact_total, 10) || 0);

    const cutTasks = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id), status: 'Готово', floor: effectiveFloorId },
      attributes: ['actual_variants'],
      raw: true,
    });
    const actualCutQty = getCutQtyDeduplicated(cutTasks);
    // Система гибкая: факт может отличаться от раскроя — без блокировки.

    const today = new Date().toISOString().slice(0, 10);
    const t = await db.sequelize.transaction();
    try {
      await db.SewingFact.destroy({
        where: { order_id: Number(order_id), floor_id: effectiveFloorId },
        transaction: t,
      });
      if (total > 0) {
        await db.SewingFact.create(
          { order_id: Number(order_id), floor_id: effectiveFloorId, date: today, fact_qty: total },
          { transaction: t }
        );
      }
      await t.commit();
      res.json({ ok: true, fact_total: total });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sewing/fact
 * Сохранить факт пошива в таблицу sewing_fact (order_id, floor_id, date, fact_qty).
 * Вызывается при нажатии «Сохранить» на странице Пошив.
 * Body: { order_id, floor_id, date, fact_qty }
 */
router.put('/fact', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, date, fact_qty } = req.body;
    if (!order_id || floor_id == null || floor_id === '' || !date) {
      return res.status(400).json({ error: 'Укажите order_id, floor_id и date' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива (производственный этаж)' });
    }
    const dateStr = String(date).slice(0, 10);
    const qty = Math.max(0, parseInt(fact_qty, 10) || 0);

    await db.SewingFact.upsert(
      {
        order_id: Number(order_id),
        floor_id: effectiveFloorId,
        date: dateStr,
        fact_qty: qty,
      },
      { conflictFields: ['order_id', 'floor_id', 'date'] }
    );
    const row = await db.SewingFact.findOne({
      where: { order_id: Number(order_id), floor_id: effectiveFloorId, date: dateStr },
    });

    res.json(row ? row.get({ plain: true }) : { order_id: Number(order_id), floor_id: effectiveFloorId, date: dateStr, fact_qty: qty });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/plan-dates?order_id=&floor_id=
 * Все даты плана по заказу и этажу (для «Завершить → ОТК»: сохранить факт по всем датам).
 */
router.get('/plan-dates', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const order_id = req.query.order_id != null && req.query.order_id !== '' ? Number(req.query.order_id) : null;
    const floor_id = req.query.floor_id != null && req.query.floor_id !== '' ? Number(req.query.floor_id) : null;
    if (!order_id || !floor_id || !sewingFloorIds.includes(floor_id)) {
      return res.status(400).json({ error: 'Укажите order_id и floor_id (производственный этаж)' });
    }
    const planRows = await db.ProductionPlanDay.findAll({
      where: { order_id, floor_id },
      attributes: ['date', 'planned_qty'],
      raw: true,
      order: [['date', 'ASC']],
    });
    const dates = (planRows || []).map((r) => ({
      date: r.date ? String(r.date).slice(0, 10) : null,
      planned_qty: Number(r.planned_qty) || 0,
    })).filter((d) => d.date);
    const factRows = await db.SewingFact.findAll({
      where: { order_id, floor_id },
      attributes: ['date', 'fact_qty'],
      raw: true,
    });
    const factByDate = {};
    (factRows || []).forEach((r) => {
      const d = r.date ? String(r.date).slice(0, 10) : null;
      if (d) factByDate[d] = Number(r.fact_qty) || 0;
    });
    const out = dates.map((d) => ({ date: d.date, planned_qty: d.planned_qty, fact_qty: factByDate[d.date] ?? 0 }));
    res.json({ dates: out });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing/fact/bulk
 * Сохранить факт по всем датам одним запросом. Обновляет таблицу sewing_fact.
 * Body: { order_id, floor_id, facts: [ { date, fact_qty }, ... ] } или rows: [ { date, fact_qty? or fact? }, ... ]
 */
router.post('/fact/bulk', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, facts, rows } = req.body;
    const effectiveOrderId = order_id != null && order_id !== '' ? Number(order_id) : NaN;
    const effectiveFloorId = floor_id != null && floor_id !== '' ? Number(floor_id) : NaN;
    if (Number.isNaN(effectiveOrderId) || effectiveOrderId <= 0 || Number.isNaN(effectiveFloorId) || !sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({
        error: 'Требуются order_id и floor_id (производственный этаж).',
        received: { order_id: req.body.order_id, floor_id: req.body.floor_id },
      });
    }
    // Поддержка формата facts: [{ date, fact_qty }] и legacy rows: [{ date, fact_qty } или { date, fact }]
    const arr = Array.isArray(facts) ? facts : (Array.isArray(rows) ? rows : []);
    const useFacts = Array.isArray(facts);

    // Валидация: факт пошива не может превышать фактически раскроенное
    const cutTasks = await db.CuttingTask.findAll({
      where: { order_id: effectiveOrderId, status: 'Готово', floor: effectiveFloorId },
      attributes: ['actual_variants'],
      raw: true,
    });
    const actualCutQty = getCutQtyDeduplicated(cutTasks);
    const existingFacts = await db.SewingFact.findAll({
      where: { order_id: effectiveOrderId, floor_id: effectiveFloorId },
      attributes: ['date', 'fact_qty'],
      raw: true,
    });
    const datesInRequest = new Set(arr.map((r) => (r.date ? String(r.date).slice(0, 10) : null)).filter(Boolean));
    let totalAfterSave = 0;
    for (const f of existingFacts) {
      const d = f.date ? String(f.date).slice(0, 10) : null;
      if (d && datesInRequest.has(d)) continue;
      totalAfterSave += Number(f.fact_qty) || 0;
    }
    for (const r of arr) {
      const dateStr = r.date ? String(r.date).slice(0, 10) : null;
      if (!dateStr) continue;
      const qty = useFacts
        ? Math.max(0, parseInt(r.fact_qty, 10) || 0)
        : Math.max(0, parseInt(r.fact_qty, 10) || parseInt(r.fact, 10) || 0);
      totalAfterSave += qty;
    }
    // Система гибкая: факт может отличаться от раскроя — без блокировки.

    const t = await db.sequelize.transaction();
    try {
      for (const r of arr) {
        const dateStr = r.date ? String(r.date).slice(0, 10) : null;
        if (!dateStr) continue;
        const qty = useFacts
          ? Math.max(0, parseInt(r.fact_qty, 10) || 0)
          : Math.max(0, parseInt(r.fact_qty, 10) || parseInt(r.fact, 10) || 0);
        await db.SewingFact.upsert(
          {
            order_id: effectiveOrderId,
            floor_id: effectiveFloorId,
            date: dateStr,
            fact_qty: qty,
          },
          { transaction: t, conflictFields: ['order_id', 'floor_id', 'date'] }
        );
      }
      await t.commit();
      res.json({ ok: true, count: arr.length });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/board
 * Список для UI Пошив: статус из sewing_order_floors, план из Планирования (production_plan_day), факт из sewing_fact.
 * Ключ связки: (order_id, floor_id). plan_rows: [{ date, plan_qty }], fact_rows: [{ date, fact_qty }].
 * Параметры: status, date_from, date_to, q, order_id (опционально)
 */
router.get('/board', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getMonday(today);
    const weekEnd = getSunday(today);
    let date_from = req.query.date_from || weekStart;
    let date_to = req.query.date_to || weekEnd;
    if (date_from > date_to) [date_from, date_to] = [date_to, date_from];
    const statusFilter = (req.query.status || 'IN_PROGRESS').toUpperCase();
    const q = (req.query.q || '').trim();
    const workshopIdFilter = req.query.workshop_id ? Number(req.query.workshop_id) : null;

    const keys = new Set();

    // Ключи (order_id, floor_id) — из sewing_order_floors и раскроя (производственные этажи)
    const orderFloors = await db.SewingOrderFloor.findAll({
      where: { floor_id: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor_id', 'status', 'done_batch_id'],
      raw: true,
    });
    orderFloors.forEach((r) => keys.add(`${r.order_id}-${r.floor_id}`));

    const cuttingDone = await db.CuttingTask.findAll({
      where: { status: 'Готово', floor: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor'],
      raw: true,
    });
    cuttingDone.forEach((r) => keys.add(`${r.order_id}-${r.floor}`));

    // План по дням — единый источник: Планирование (production_plan_day), ключ (order_id, floor_id, date)
    const orderIdFilter = req.query.order_id ? Number(req.query.order_id) : null;
    const planWhere = {
      floor_id: { [Op.in]: sewingFloorIds },
      date: { [Op.between]: [date_from, date_to] },
    };
    if (orderIdFilter != null) planWhere.order_id = orderIdFilter;
    const planRows = await db.ProductionPlanDay.findAll({
      where: planWhere,
      attributes: ['order_id', 'floor_id', 'date', 'planned_qty'],
      raw: true,
    });
    const planByKey = {};
    (planRows || []).forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      if (!planByKey[k]) planByKey[k] = [];
      const dateStr = r.date ? String(r.date).slice(0, 10) : null;
      if (dateStr) planByKey[k].push({ date: dateStr, plan_qty: Number(r.planned_qty) || 0 });
    });
    // Чтобы блок этажа появился на Пошиве: добавляем ключи из плана (если запланировали 3 этаж — показываем блок 3)
    Object.keys(planByKey).forEach((k) => keys.add(k));

    // Факт по дням — только из sewing_fact (order_id, floor_id, date)
    const factRows = await db.SewingFact.findAll({
      where: {
        floor_id: { [Op.in]: sewingFloorIds },
        date: { [Op.between]: [date_from, date_to] },
      },
      attributes: ['order_id', 'floor_id', 'date', 'fact_qty'],
      raw: true,
    });
    const factByKey = {};
    factRows.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      if (!factByKey[k]) factByKey[k] = [];
      factByKey[k].push({ date: r.date, fact_qty: Number(r.fact_qty) || 0 });
    });

    // actual_cut_qty по (order_id, floor): сумма actual_variants без дублирования (unique color|size)
    const cutTasks = await db.CuttingTask.findAll({
      where: { status: 'Готово', floor: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor', 'actual_variants'],
      raw: true,
    });
    const actualCutByKey = {};
    const tasksByKey = {};
    cutTasks.forEach((t) => {
      const k = `${t.order_id}-${t.floor}`;
      if (!tasksByKey[k]) tasksByKey[k] = [];
      tasksByKey[k].push(t);
    });
    for (const k of Object.keys(tasksByKey)) {
      actualCutByKey[k] = getCutQtyDeduplicated(tasksByKey[k]);
    }

    // already_in_sewing = сумма sewing_fact по всему периоду для (order_id, floor)
    const factTotalByKey = {};
    for (const r of factRows) {
      const k = `${r.order_id}-${r.floor_id}`;
      factTotalByKey[k] = (factTotalByKey[k] || 0) + (Number(r.fact_qty) || 0);
    }
    // Нужна полная сумма по всем датам, не только период — для available_for_sewing
    const factAllRows = await db.SewingFact.findAll({
      where: { floor_id: { [Op.in]: sewingFloorIds } },
      attributes: ['order_id', 'floor_id', 'fact_qty'],
      raw: true,
    });
    const totalSewingFactByKey = {};
    factAllRows.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      totalSewingFactByKey[k] = (totalSewingFactByKey[k] || 0) + (Number(r.fact_qty) || 0);
    });

    const availableForSewingByKey = {};
    for (const k of Object.keys(actualCutByKey)) {
      const cut = actualCutByKey[k] || 0;
      const inSewing = totalSewingFactByKey[k] || 0;
      availableForSewingByKey[k] = Math.max(0, cut - inSewing);
    }

    const statusByKey = {};
    const doneBatchByKey = {};
    orderFloors.forEach((r) => {
      const k = `${r.order_id}-${r.floor_id}`;
      statusByKey[k] = r.status;
      if (r.done_batch_id) doneBatchByKey[k] = r.done_batch_id;
    });

    let orderIds = [...new Set([...keys].map((k) => parseInt(k.split('-')[0], 10)))];
    const orderWhere = { id: orderIds };
    if (workshopIdFilter) orderWhere.workshop_id = workshopIdFilter;
    const orders = await db.Order.findAll({
      where: orderWhere,
      attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id', 'photos', 'model_type'],
      include: [
        { model: db.Client, as: 'Client', required: false, attributes: ['name'] },
        { model: db.OrderPart, as: 'OrderParts', required: false },
      ],
    });
    orderIds = orders.map((o) => o.id);
    if (workshopIdFilter && orderIds.length === 0) {
      return res.json({ floors: [], period: { date_from, date_to } });
    }
    if (workshopIdFilter) {
      const allowedIds = new Set(orderIds);
      [...keys].forEach((k) => {
        const oid = parseInt(k.split('-')[0], 10);
        if (!allowedIds.has(oid)) keys.delete(k);
      });
    }
    const orderMap = {};
    orders.forEach((o) => { orderMap[o.id] = o; });

    if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null) {
      const allowed = req.allowedBuildingFloorId;
      [...keys].forEach((k) => {
        const [, fidStr] = k.split('-');
        if (parseInt(fidStr, 10) !== allowed) keys.delete(k);
      });
    }

    // Сортируем строки по дате внутри каждой ячейки
    Object.keys(planByKey).forEach((k) => planByKey[k].sort((a, b) => a.date.localeCompare(b.date)));
    Object.keys(factByKey).forEach((k) => factByKey[k].sort((a, b) => a.date.localeCompare(b.date)));

    const itemsByFloor = {};
    sewingFloorIds.forEach((fid) => { itemsByFloor[fid] = []; });
    for (const key of keys) {
      const [orderIdStr, floorIdStr] = key.split('-');
      const order_id = parseInt(orderIdStr, 10);
      const floor_id = parseInt(floorIdStr, 10);
      if (!sewingFloorIds.includes(floor_id)) continue;
      if (orderIdFilter != null && order_id !== orderIdFilter) continue;
      const status = statusByKey[key] || 'IN_PROGRESS';
      if (statusFilter !== 'ALL' && status !== statusFilter) continue;
      const order = orderMap[order_id];
      if (!order) continue;
      const clientName = order.Client?.name || '—';
      const orderTitle = order.title || '—';
      const tzCode = order.tz_code || '';
      const modelName = order.model_name || order.title || '—';
      let order_title = tzCode ? `${tzCode} — ${modelName}` : modelName;
      const partsForFloor = (order.OrderParts || []).filter((p) => Number(p.floor_id) === Number(floor_id));
      if (partsForFloor.length > 0) {
        const partName = partsForFloor[0].part_name;
        order_title = `${order_title} — ${partName}`;
      }
      if (q) {
        const term = q.toLowerCase();
        if (
          !orderTitle.toLowerCase().includes(term) &&
          !modelName.toLowerCase().includes(term) &&
          !clientName.toLowerCase().includes(term) &&
          !String(order.id).includes(term) &&
          !(tzCode && tzCode.toLowerCase().includes(term))
        ) continue;
      }
      const plan_rows = planByKey[key] || [];
      const fact_rows = factByKey[key] || [];
      const plan_sum = plan_rows.reduce((s, r) => s + r.plan_qty, 0);
      const fact_sum = fact_rows.reduce((s, r) => s + r.fact_qty, 0);
      if (process.env.NODE_ENV !== 'production' && plan_sum === 0 && keys.has(key)) {
        console.log('[sewing/board] план пустой при наличии ключа (разрыв цепочки?)', { key, order_id, floor_id });
      }
      const actual_cut_qty = actualCutByKey[key] || 0;
      const already_in_sewing = totalSewingFactByKey[key] || 0;
      const available_for_sewing = Math.max(0, actual_cut_qty - already_in_sewing);

      const parts = (order.OrderParts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      let kit_info = null;
      if (parts.length > 0) {
        const partQtyByFloor = {};
        parts.forEach((p) => {
          const k = `${order_id}-${p.floor_id}`;
          partQtyByFloor[p.floor_id] = totalSewingFactByKey[k] || 0;
        });
        kit_info = computeKitSummary(parts, partQtyByFloor);
      }
      if (!itemsByFloor[floor_id]) itemsByFloor[floor_id] = [];
      itemsByFloor[floor_id].push({
        order_id,
        order_title,
        model_name: modelName,
        client_name: clientName,
        order_photos: order.photos,
        status,
        done_batch_id: doneBatchByKey[key] || null,
        plan_rows,
        fact_rows,
        totals: { plan_sum, fact_sum },
        order_deadline: order.deadline || null,
        workshop_id: order.workshop_id,
        actual_cut_qty,
        available_for_sewing,
        order_parts: parts,
        kit_info,
      });
    }

    sewingFloorIds.forEach((fid) => {
      if (itemsByFloor[fid]) {
        itemsByFloor[fid].sort((a, b) => {
          const da = a.order_deadline || '9999-12-31';
          const db_ = b.order_deadline || '9999-12-31';
          return da.localeCompare(db_) || (a.order_title || '').localeCompare(b.order_title || '');
        });
      }
    });

    const workshopIds = [...new Set(orders.map((o) => o.workshop_id).filter(Boolean))];
    const weekStarts = [getWeekStart(date_from), getWeekStart(date_to)];
    const capacityRows = workshopIds.length > 0
      ? await db.WeeklyCapacity.findAll({
          where: {
            workshop_id: { [Op.in]: workshopIds },
            building_floor_id: { [Op.in]: sewingFloorIds },
            week_start: { [Op.in]: weekStarts },
          },
          attributes: ['building_floor_id', 'capacity_week'],
          raw: true,
        })
      : [];
    const capacityByFloor = {};
    capacityRows.forEach((r) => {
      const fid = r.building_floor_id;
      const cap = parseFloat(r.capacity_week) || 0;
      const capDay = Math.round(cap / WORKING_DAYS_PER_WEEK);
      if (capDay > 0 && (!capacityByFloor[fid] || capDay > capacityByFloor[fid])) {
        capacityByFloor[fid] = capDay;
      }
    });

    const kitOrders = [];
    const seenOrderIds = new Set();
    for (const order of orders) {
      const parts = (order.OrderParts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (parts.length === 0 || seenOrderIds.has(order.id)) continue;
      seenOrderIds.add(order.id);
      const partQtyByFloor = {};
      parts.forEach((p) => {
        const k = `${order.id}-${p.floor_id}`;
        partQtyByFloor[p.floor_id] = totalSewingFactByKey[k] || 0;
      });
      const kitSummary = computeKitSummary(parts, partQtyByFloor);
      const orderTitle = order.tz_code && order.model_name
        ? `${order.tz_code} — ${order.model_name}` : order.title || '—';
      kitOrders.push({
        order_id: order.id,
        order_title: orderTitle,
        parts: kitSummary.part_quantities,
        kit_qty: kitSummary.kit_qty,
      });
    }

    const floors = sewingFloorIds.map((floor_id) => ({
      floor_id,
      capacity_per_day: capacityByFloor[floor_id] ?? null,
      items: itemsByFloor[floor_id],
    }));
    res.json({ floors, period: { date_from, date_to }, kit_orders: kitOrders });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/tasks
 * Параметры: floor_id, date_from, date_to, status (all|in_progress|done), q, order_id
 * По умолчанию: текущая неделя, status=in_progress (пошив не завершён)
 * Сортировка: дедлайн заказа ASC, дата задачи ASC
 */
router.get('/tasks', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getMonday(today);
    const weekEnd = getSunday(today);

    let date_from = req.query.date_from || weekStart;
    let date_to = req.query.date_to || weekEnd;
    if (date_from > date_to) {
      [date_from, date_to] = [date_to, date_from];
    }

    const floor_id = req.query.floor_id;
    const statusFilter = String(req.query.status || 'in_progress').toLowerCase();
    const q = (req.query.q || '').trim();
    const order_id = req.query.order_id ? Number(req.query.order_id) : null;

    const planWhere = {
      date: { [Op.between]: [date_from, date_to] },
    };
    if (floor_id && floor_id !== 'all') {
      const fid = Number(floor_id);
      if (sewingFloorIds.includes(fid)) planWhere.floor_id = fid;
    }
    if (order_id) planWhere.order_id = order_id;

    let planDays = await db.ProductionPlanDay.findAll({
      where: planWhere,
      include: [
        {
          model: db.Order,
          as: 'Order',
          required: true,
          attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id', 'building_floor_id'],
          include: [
            { model: db.Client, as: 'Client', required: false, attributes: ['name'] },
            { model: db.Workshop, as: 'Workshop', required: false, attributes: ['id', 'name', 'floors_count'] },
          ],
        },
        {
          model: db.BuildingFloor,
          as: 'BuildingFloor',
          required: false,
          attributes: ['id', 'name'],
        },
      ],
      order: [],
    });

    // Ограничение технолога по этажу
    if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null) {
      planDays = planDays.filter((row) => row.Order && (row.floor_id == null || row.floor_id === req.allowedBuildingFloorId));
    }

    const tasks = [];
    for (const row of planDays) {
      const order = row.Order;
      if (!order) continue;

      const planned_qty = Number(row.planned_qty) || 0;
      const actual_qty = Number(row.actual_qty) || 0;
      let status = 'NOT_STARTED';
      if (planned_qty > 0 && actual_qty >= planned_qty) status = 'DONE';
      else if (actual_qty > 0) status = 'IN_PROGRESS';

      if (statusFilter === 'in_progress' && status === 'DONE') continue;
      if (statusFilter === 'done' && status !== 'DONE') continue;

      const clientName = order.Client?.name || '—';
      const orderTitle = order.title || '—';
      const tzCode = order.tz_code || '';
      const modelName = order.model_name || order.title || '—';
      const orderTzModel = tzCode ? `${tzCode} — ${modelName}` : modelName;

      if (q) {
        const term = q.toLowerCase();
        const match =
          orderTitle.toLowerCase().includes(term) ||
          modelName.toLowerCase().includes(term) ||
          clientName.toLowerCase().includes(term) ||
          String(order.id).includes(term) ||
          (tzCode && tzCode.toLowerCase().includes(term));
        if (!match) continue;
      }

      const floorName = row.BuildingFloor?.name || (row.floor_id ? `Этаж ${row.floor_id}` : '—');

      tasks.push({
        id: row.id,
        order_id: order.id,
        order_title: orderTitle,
        order_tz_model: orderTzModel,
        client_name: clientName,
        floor_id: row.floor_id,
        floor_name: floorName,
        date: row.date,
        planned_qty,
        actual_qty,
        status,
        workshop_id: order.workshop_id,
        workshop_name: order.Workshop?.name || null,
        order_deadline: order.deadline || null,
      });
    }

    // Дополнительно: заказы с завершённым раскроем по производственным этажам, которых ещё нет в плане
    const seenOrderFloor = new Set(tasks.map((t) => `${t.order_id}-${t.floor_id ?? 'n'}`));
    const cuttingDone = await db.CuttingTask.findAll({
      where: {
        status: 'Готово',
        floor: { [Op.in]: sewingFloorIds },
      },
      attributes: ['order_id', 'floor'],
      raw: true,
    });
    const orderFloorFromCutting = [];
    const seenCut = new Set();
    for (const c of cuttingDone) {
      if (order_id != null && c.order_id !== order_id) continue;
      const fid = c.floor;
      const key = `${c.order_id}-${fid}`;
      if (seenOrderFloor.has(key) || seenCut.has(key)) continue;
      seenCut.add(key);
      orderFloorFromCutting.push({ order_id: c.order_id, floor_id: fid });
    }
    if (orderFloorFromCutting.length > 0) {
      const orderIds = [...new Set(orderFloorFromCutting.map((o) => o.order_id))];
      const orders = await db.Order.findAll({
        where: { id: orderIds },
        attributes: ['id', 'title', 'tz_code', 'model_name', 'deadline', 'workshop_id'],
        include: [
          { model: db.Client, as: 'Client', required: false, attributes: ['name'] },
          { model: db.Workshop, as: 'Workshop', required: false, attributes: ['id', 'name'] },
        ],
      });
      const orderMap = {};
      orders.forEach((o) => { orderMap[o.id] = o; });
      const floors = await db.BuildingFloor.findAll({
        where: { id: sewingFloorIds },
        attributes: ['id', 'name'],
      });
      const floorNameById = {};
      floors.forEach((f) => { floorNameById[f.id] = f.name; });
      for (const { order_id, floor_id } of orderFloorFromCutting) {
        const order = orderMap[order_id];
        if (!order) continue;
        if (req.user?.role === 'technologist' && req.allowedBuildingFloorId != null && req.allowedBuildingFloorId !== floor_id) continue;
        const clientName = order.Client?.name || '—';
        const orderTitle = order.title || '—';
        const tzCode = order.tz_code || '';
        const modelName = order.model_name || order.title || '—';
        const orderTzModel = tzCode ? `${tzCode} — ${modelName}` : modelName;
        if (q) {
          const term = q.toLowerCase();
          const match =
            orderTitle.toLowerCase().includes(term) ||
            modelName.toLowerCase().includes(term) ||
            clientName.toLowerCase().includes(term) ||
            String(order.id).includes(term) ||
            (tzCode && tzCode.toLowerCase().includes(term));
          if (!match) continue;
        }
        const floorName = floorNameById[floor_id] || `Этаж ${floor_id}`;
        let d = new Date(date_from + 'T12:00:00');
        const end = new Date(date_to + 'T12:00:00');
        while (d <= end) {
          const dateStr = d.toISOString().slice(0, 10);
          const syntheticId = `cut-${order_id}-${floor_id}-${dateStr}`;
          tasks.push({
            id: syntheticId,
            order_id: order.id,
            order_title: orderTitle,
            order_tz_model: orderTzModel,
            client_name: clientName,
            floor_id,
            floor_name: floorName,
            date: dateStr,
            planned_qty: 0,
            actual_qty: 0,
            status: 'NOT_STARTED',
            workshop_id: order.workshop_id,
            workshop_name: order.Workshop?.name || null,
            order_deadline: order.deadline || null,
          });
          d.setDate(d.getDate() + 1);
        }
      }
    }

    // Сортировка: дедлайн заказа ASC, дата задачи ASC
    tasks.sort((a, b) => {
      const deadlineA = a.order_deadline || '9999-12-31';
      const deadlineB = b.order_deadline || '9999-12-31';
      if (deadlineA !== deadlineB) return deadlineA.localeCompare(deadlineB);
      return (a.date || '').localeCompare(b.date || '');
    });

    res.json({ tasks, period: { date_from, date_to } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sewing/complete-status?order_id=&floor_id=
 * Проверка: завершён ли пошив по заказу (и этажу). Партия DONE уже создана.
 */
router.get('/complete-status', async (req, res, next) => {
  try {
    const order_id = req.query.order_id ? Number(req.query.order_id) : null;
    const floor_id = req.query.floor_id != null && req.query.floor_id !== '' ? Number(req.query.floor_id) : null;
    if (!order_id) return res.status(400).json({ error: 'Укажите order_id' });

    const where = { order_id, status: 'DONE' };
    if (floor_id != null && floor_id !== '') where.floor_id = Number(floor_id);

    const batch = await db.SewingBatch.findOne({ where, attributes: ['id'] });
    res.json({ completed: !!batch });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sewing/complete
 * Ежедневное поступление в ОТК: партия по периоду date_from/date_to.
 * fact_sum и plan_sum считаются по фильтру df/dt. Завершение разрешено при fact_sum > 0 (без требования закрыть весь план).
 * Дубликат за тот же (order_id, floor_id, date_from, date_to) — возврат существующего batch_id.
 * Body: { order_id, floor_id, date_from?, date_to? }
 * Ответ: { ok: true, batch_id }
 */
router.post('/complete', async (req, res, next) => {
  try {
    const sewingFloorIds = await getSewingFloorIds();
    const { order_id, floor_id, date_from, date_to } = req.body;
    if (!order_id || floor_id == null || floor_id === '') {
      return res.status(400).json({ error: 'Укажите order_id и floor_id' });
    }
    const effectiveFloorId = Number(floor_id);
    if (!sewingFloorIds.includes(effectiveFloorId)) {
      return res.status(400).json({ error: 'Укажите этаж пошива (производственный этаж).' });
    }

    const df = date_from ? String(date_from).slice(0, 10) : null;
    const dt = date_to ? String(date_to).slice(0, 10) : null;
    const replacements = {
      order_id: Number(order_id),
      floor_id: effectiveFloorId,
      df,
      dt,
    };

    const order = await db.Order.findByPk(Number(order_id), {
      attributes: ['id', 'model_id', 'workshop_id'],
    });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    const [factAgg] = await db.sequelize.query(
      `SELECT COALESCE(SUM(fact_qty), 0)::int AS fact_sum
       FROM sewing_fact
       WHERE order_id = :order_id AND floor_id = :floor_id
         AND (:df IS NULL OR date >= :df)
         AND (:dt IS NULL OR date <= :dt)`,
      { replacements }
    );
    const fact_sum = Number(factAgg?.[0]?.fact_sum) || 0;

    if (fact_sum <= 0) {
      return res.status(400).json({
        error: 'Нет факта пошива за выбранный период. Введите факт по датам и нажмите «Сохранить факты».',
      });
    }

    const cutTasksComplete = await db.CuttingTask.findAll({
      where: { order_id: Number(order_id), status: 'Готово', floor: effectiveFloorId },
      attributes: ['actual_variants'],
      raw: true,
    });
    const actualCutQty = getCutQtyDeduplicated(cutTasksComplete);
    // Система гибкая: факт может отличаться от раскроя — без блокировки.

    const [planAgg] = await db.sequelize.query(
      `SELECT COALESCE(SUM(planned_qty), 0)::int AS plan_sum
       FROM production_plan_day
       WHERE order_id = :order_id AND floor_id = :floor_id
         AND (:df IS NULL OR date >= :df)
         AND (:dt IS NULL OR date <= :dt)`,
      { replacements }
    );
    const plan_sum = Number(planAgg?.[0]?.plan_sum) || 0;

    // Не допускать дублей за тот же период: если партия уже есть — вернуть её batch_id
    if (df != null && dt != null) {
      const existingBatch = await db.SewingBatch.findOne({
        where: {
          order_id: Number(order_id),
          floor_id: effectiveFloorId,
          date_from: df,
          date_to: dt,
        },
        attributes: ['id'],
      });
      if (existingBatch) {
        return res.status(200).json({ ok: true, batch_id: existingBatch.id });
      }
    }

    const t = await db.sequelize.transaction();
    try {
      const now = new Date();
      const dfStr = (df || now.toISOString().slice(0, 10)).replace(/-/g, '');
      const dtStr = (dt || df || now.toISOString().slice(0, 10)).replace(/-/g, '');
      // Читабельный код партии: ПШ-{order_id}-{этаж}-{дата_от}-{дата_до}
      const batchCode = `ПШ-${order_id}-${effectiveFloorId}-${dfStr}-${dtStr}`;

      const orderPartRow = await db.OrderPart.findOne({
        where: { order_id: Number(order_id), floor_id: effectiveFloorId },
        attributes: ['id'],
        transaction: t,
      });

      const batch = await db.SewingBatch.create(
        {
          order_id: Number(order_id),
          model_id: order.model_id || null,
          floor_id: effectiveFloorId,
          order_part_id: orderPartRow ? orderPartRow.id : null,
          batch_code: batchCode,
          date_from: df || null,
          date_to: dt || null,
          qty: fact_sum,
          started_at: now,
          finished_at: now,
          status: 'READY_FOR_QC',
        },
        { transaction: t }
      );

      // Размеры из items (матрица цвет×размер) или fallback: одна запись с fact_sum.
      // model_size_id = null, size_id из справочника sizes (по имени/коду).
      const items = req.body.items || [];
      const bySize = {};
      for (const it of items) {
        const sizeKey = String(it.size || '').trim() || '—';
        const qty = Math.max(0, parseInt(it.fact_qty, 10) || 0);
        if (qty > 0) bySize[sizeKey] = (bySize[sizeKey] || 0) + qty;
      }
      const sizesTable = await db.Size.findAll({ where: { is_active: true }, attributes: ['id', 'name', 'code'] });
      const sizeByNameOrCode = {};
      sizesTable.forEach((s) => {
        if (s.name) sizeByNameOrCode[String(s.name).trim()] = s.id;
        if (s.code) sizeByNameOrCode[String(s.code).trim()] = s.id;
      });
      const resolveSizeId = (key) => sizeByNameOrCode[key] || sizeByNameOrCode[String(key).toLowerCase()] || null;

      if (Object.keys(bySize).length > 0) {
        for (const [sizeKey, qty] of Object.entries(bySize)) {
          if (qty <= 0) continue;
          const sizeId = resolveSizeId(sizeKey);
          await db.SewingBatchItem.create(
            {
              batch_id: batch.id,
              model_size_id: null,
              size_id: sizeId,
              planned_qty: 0,
              fact_qty: qty,
            },
            { transaction: t }
          );
        }
      } else if (fact_sum > 0) {
        // Размеры из раскроя (actual_variants): один SewingBatchItem на размер
        const cutBySize = {};
        const cutTasksForSizes = await db.CuttingTask.findAll({
          where: { order_id: Number(order_id), status: 'Готово', floor: effectiveFloorId },
          attributes: ['actual_variants'],
          raw: true,
        });
        const byColorSize = {};
        for (const ct of cutTasksForSizes) {
          for (const v of ct.actual_variants || []) {
            const color = String(v.color || '').trim() || '—';
            const size = String(v.size || '').trim() || '—';
            const key = `${color}|${size}`;
            const q = Math.max(0, parseInt(v.quantity_actual, 10) || 0);
            if (q > 0) byColorSize[key] = Math.max(byColorSize[key] || 0, q);
          }
        }
        for (const [key, q] of Object.entries(byColorSize)) {
          const size = key.split('|').pop() || '—';
          cutBySize[size] = (cutBySize[size] || 0) + q;
        }
        let totalCut = 0;
        for (const q of Object.values(cutBySize)) totalCut += q;
        const scale = totalCut > 0 ? fact_sum / totalCut : 1;
        let created = false;
        for (const [sizeKey, cutQty] of Object.entries(cutBySize)) {
          const sizeId = resolveSizeId(sizeKey);
          const qty = totalCut > 0 ? Math.max(0, Math.round(cutQty * scale)) : 0;
          if (qty <= 0) continue;
          await db.SewingBatchItem.create(
            {
              batch_id: batch.id,
              model_size_id: null,
              size_id: sizeId,
              planned_qty: 0,
              fact_qty: qty || cutQty,
            },
            { transaction: t }
          );
          created = true;
        }
        if (!created) {
          const ovs = await db.OrderVariant.findAll({
            where: { order_id: Number(order_id) },
            include: [{ model: db.Size, as: 'Size' }],
          });
          let sizeId = null;
          for (const ov of ovs) {
            if (ov.Size) sizeId = ov.Size.id;
          }
          if (!sizeId && sizesTable.length > 0) sizeId = sizesTable[0].id;
          await db.SewingBatchItem.create(
            {
              batch_id: batch.id,
              model_size_id: null,
              size_id: sizeId,
              planned_qty: plan_sum,
              fact_qty: fact_sum,
            },
            { transaction: t }
          );
        }
      }

      // Отмечаем пошив по этому заказу+этажу как завершённый (панель заказов показывает «Пошив ✓»)
      await db.SewingOrderFloor.upsert(
        {
          order_id: Number(order_id),
          floor_id: effectiveFloorId,
          status: 'DONE',
          done_at: now,
          done_batch_id: batch.id,
        },
        { conflictFields: ['order_id', 'floor_id'], transaction: t }
      );

      const [sewingStage] = await db.OrderStage.findOrCreate({
        where: { order_id: Number(order_id), stage_key: 'sewing' },
        defaults: { status: 'NOT_STARTED' },
        transaction: t,
      });
      await sewingStage.update({ status: 'DONE', completed_at: now }, { transaction: t });

      const [qcStage] = await db.OrderStage.findOrCreate({
        where: { order_id: Number(order_id), stage_key: 'qc' },
        defaults: { status: 'NOT_STARTED' },
        transaction: t,
      });
      await qcStage.update({ status: 'IN_PROGRESS', started_at: now }, { transaction: t });

      await t.commit();
      res.json({ ok: true, batch_id: batch.id });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/sewing/ensure-batch удалён: партия создаётся только через POST /api/sewing/complete (факт из sewing_fact).

module.exports = router;
