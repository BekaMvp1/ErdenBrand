/**
 * Общие роуты для этапов «Декатировка» и «Проверка»: быстрый GET (заказы + факты за месяц в JS), сохранение факта без изменений.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

function planningScopeKey(workshopId, floorId, monthKey) {
  const w = workshopId != null && String(workshopId).trim() !== '' ? String(workshopId).trim() : '0';
  const f = floorId != null && String(floorId).trim() !== '' ? String(floorId).trim() : '0';
  const m = String(monthKey || '').trim().slice(0, 7);
  return `w${w}_f${f}_m${m}`;
}

/** Поля заказа для списка этапов (таблица как Раскрой: фото, фильтр по цеху/датам). */
const ORDER_LIST_ATTRIBUTES = [
  'id',
  'title',
  'article',
  'model_name',
  'tz_code',
  'total_quantity',
  'quantity',
  'floor_id',
  'building_floor_id',
  'workshop_id',
  'planned_month',
  'deadline',
  'photos',
  'created_at',
];

function orderAllowed(req, order) {
  if (req.user.role !== 'technologist') return true;
  const allowed = req.allowedBuildingFloorId ?? req.allowedFloorId;
  if (!allowed) return true;
  const orderFloor = order.building_floor_id ?? order.floor_id;
  if (orderFloor != null && Number(orderFloor) !== Number(allowed)) return false;
  return true;
}

const STATUS = new Set(['not_started', 'in_progress', 'done']);

/** Лимит активных заказов за один GET — без SQL по planning_month_facts */
const LIST_ACTIVE_LIMIT = 100;
const LIST_EXTRA_FACT_ORDERS = 150;

/** Один раз загружаем id статуса «Готов» — без повторных round-trip на каждый GET */
let doneStatusIdResolved = false;
let cachedDoneStatusId = null;
async function getDoneStatusId() {
  if (doneStatusIdResolved) return cachedDoneStatusId;
  const row = await db.OrderStatus.findOne({
    attributes: ['id'],
    where: { name: 'Готов' },
    raw: true,
  });
  cachedDoneStatusId = row ? Number(row.id) : null;
  doneStatusIdResolved = true;
  return cachedDoneStatusId;
}

/**
 * Регистрирует GET (быстрый список: Order + факты за месяц в JS) и POST/PUT для этапа.
 * Аутентификация и роли задаются в app.js для /api/dekatirovka и /api/proverka.
 * @param {string} [routeLabel] — метка для console.time (например Proverka / Dekatirovka)
 */
function setupStageFactsRoutes(router, FactModel, routeLabel) {
  const tag = routeLabel || FactModel?.name || 'StageFacts';

  router.get('/', async (req, res, next) => {
    const totalLabel = `[${tag}] GET total`;
    console.time(totalLabel);
    try {
      if (req._stageListT0 != null) {
        console.log(
          `[${tag}] ms before GET handler (stack до роутера, в т.ч. authenticate): ${Date.now() - req._stageListT0}ms`
        );
      }

      const month_key = req.query.month_key;
      const { workshop_id, building_floor_id } = req.query;
      if (!month_key || !/^\d{4}-\d{2}$/.test(String(month_key).trim())) {
        console.timeEnd(totalLabel);
        return res.status(400).json({ error: 'Укажите month_key (YYYY-MM)' });
      }
      const mk = String(month_key).trim().slice(0, 7);
      const scopeKey = planningScopeKey(workshop_id, building_floor_id, mk);

      const factsAttrs = ['id', 'order_id', 'month_key', 'actual_qty', 'status', 'note'];

      const parallelLabel = `[${tag}] facts + doneStatusId`;
      let facts;
      let doneId;
      console.time(parallelLabel);
      try {
        const pair = await Promise.all([
          FactModel.findAll({
            where: { month_key: mk },
            attributes: factsAttrs,
            raw: true,
          }),
          getDoneStatusId(),
        ]);
        facts = pair[0];
        doneId = pair[1];
      } finally {
        console.timeEnd(parallelLabel);
      }

      const factByOrder = {};
      for (const f of facts) {
        factByOrder[f.order_id] = f;
      }

      const whereActive = doneId != null ? { status_id: { [Op.ne]: doneId } } : {};

      const recentLabel = `[${tag}] orders recent`;
      let recentOrders;
      console.time(recentLabel);
      try {
        recentOrders = await db.Order.findAll({
          where: whereActive,
          attributes: ORDER_LIST_ATTRIBUTES,
          include: [{ model: db.Client, as: 'Client', attributes: ['name'], required: false }],
          order: [['created_at', 'DESC']],
          limit: LIST_ACTIVE_LIMIT,
        });
      } finally {
        console.timeEnd(recentLabel);
      }

      const recentIds = new Set(recentOrders.map((o) => o.id));
      const factOrderIds = [...new Set(facts.map((f) => f.order_id).filter((id) => Number.isFinite(id) && id > 0))];
      const missingForFacts = factOrderIds.filter((id) => !recentIds.has(id)).slice(0, LIST_EXTRA_FACT_ORDERS);

      let extraOrders = [];
      if (missingForFacts.length > 0) {
        const extraLabel = `[${tag}] orders extra by fact ids`;
        console.time(extraLabel);
        try {
          extraOrders = await db.Order.findAll({
            where: { id: { [Op.in]: missingForFacts } },
            attributes: ORDER_LIST_ATTRIBUTES,
            include: [{ model: db.Client, as: 'Client', attributes: ['name'], required: false }],
          });
        } finally {
          console.timeEnd(extraLabel);
        }
      }

      const merged = [];
      const seen = new Set();
      for (const o of recentOrders) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        merged.push(o);
      }
      for (const o of extraOrders) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        merged.push(o);
      }

      const buildLabel = `[${tag}] build rows`;
      const rows = [];
      console.time(buildLabel);
      try {
        for (const o of merged) {
          if (!orderAllowed(req, o)) continue;
          const plain = o.get({ plain: true });
          const fid = factByOrder[o.id];
          rows.push({
            order: {
              id: plain.id,
              title: plain.title,
              article: plain.article,
              model_name: plain.model_name,
              tz_code: plain.tz_code,
              total_quantity: plain.total_quantity ?? plain.quantity,
              client_name: plain.Client?.name || '—',
              workshop_id: plain.workshop_id,
              planned_month: plain.planned_month,
              deadline: plain.deadline,
              photos: plain.photos,
            },
            planned_qty: 0,
            fact_id: fid?.id ?? null,
            actual_qty: fid?.actual_qty ?? 0,
            status: fid?.status ?? 'not_started',
            note: fid?.note ?? '',
          });
        }
      } finally {
        console.timeEnd(buildLabel);
      }

      console.timeEnd(totalLabel);
      res.json({ month_key: mk, scope_key: scopeKey, rows });
    } catch (err) {
      console.timeEnd(totalLabel);
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      const { order_id, month_key, actual_qty, status, note } = req.body || {};
      const oid = parseInt(order_id, 10);
      const mk =
        month_key && /^\d{4}-\d{2}$/.test(String(month_key).trim())
          ? String(month_key).trim().slice(0, 7)
          : null;
      if (!Number.isFinite(oid) || oid < 1 || !mk) {
        return res.status(400).json({ error: 'Укажите order_id и month_key (YYYY-MM)' });
      }
      const order = await db.Order.findByPk(oid);
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      if (!orderAllowed(req, order)) return res.status(403).json({ error: 'Нет доступа к заказу' });

      const aq = Math.max(0, parseInt(actual_qty, 10) || 0);
      const st = STATUS.has(String(status)) ? String(status) : 'not_started';
      const nt = note != null && note !== '' ? String(note).slice(0, 2000) : null;

      const [row, created] = await FactModel.findOrCreate({
        where: { order_id: oid, month_key: mk },
        defaults: { actual_qty: aq, status: st, note: nt },
      });
      if (!created) await row.update({ actual_qty: aq, status: st, note: nt });
      res.json(row.get({ plain: true }));
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      if (!['admin', 'manager', 'technologist'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Некорректный id' });
      const row = await FactModel.findByPk(id);
      if (!row) return res.status(404).json({ error: 'Не найдено' });
      const order = await db.Order.findByPk(row.order_id);
      if (!order) return res.status(404).json({ error: 'Заказ не найден' });
      if (!orderAllowed(req, order)) return res.status(403).json({ error: 'Нет доступа к заказу' });

      const { actual_qty, status, note } = req.body || {};
      const patch = {};
      if (actual_qty !== undefined) patch.actual_qty = Math.max(0, parseInt(actual_qty, 10) || 0);
      if (status !== undefined) {
        patch.status = STATUS.has(String(status)) ? String(status) : row.status;
      }
      if (note !== undefined) patch.note = note != null && note !== '' ? String(note).slice(0, 2000) : null;
      await row.update(patch);
      res.json(row.get({ plain: true }));
    } catch (err) {
      next(err);
    }
  });
}

function createStageFactsRouter(FactModel) {
  const router = express.Router();
  setupStageFactsRoutes(router, FactModel, FactModel?.name || 'StageFacts');
  return router;
}

module.exports = {
  createStageFactsRouter,
  setupStageFactsRoutes,
  planningScopeKey,
};
