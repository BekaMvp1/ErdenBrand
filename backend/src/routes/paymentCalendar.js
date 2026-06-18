/**
 * Платёжный календарь по неделям
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const PaymentCalendar = db.PaymentCalendar;
const { upsertPaymentCalendarCell, weekNumberForDate, toNum } = require('../utils/paymentCalendarCell');

const router = express.Router();

const STAGE_CATEGORY = {
  procurement: 'supplier_fabric',
  purchase: 'supplier_fabric',
  cutting: 'dept_cutting',
  sewing: 'dept_sewing',
  otk: 'dept_otk',
};

function parseOrderIdFromSubcategory(subcategory) {
  const m = String(subcategory || '').match(/^order_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function parseOrderNumberFromNote(note) {
  const m = String(note || '').match(/№\s*([^.,]+)/);
  return m ? m[1].trim() : null;
}

function categoryForStage(stage) {
  return STAGE_CATEGORY[stage] || STAGE_CATEGORY[String(stage || '').trim()] || null;
}

/** Список заказов (order_*) за неделю и статью — для расшифровки плана */
router.get('/by-week', async (req, res, next) => {
  try {
    const { stage, week_number, year, category } = req.query;
    const y = parseInt(year, 10) || 2026;
    const wn = parseInt(week_number, 10);
    if (!Number.isFinite(wn)) {
      return res.status(400).json({ error: 'week_number обязателен' });
    }

    let cat = category ? String(category).trim() : '';
    if (!cat && stage) cat = categoryForStage(stage) || '';
    if (!cat) {
      return res.status(400).json({ error: 'category или stage обязателен' });
    }

    const rows = await PaymentCalendar.findAll({
      where: {
        year: y,
        week_number: wn,
        category: cat,
        subcategory: { [Op.like]: 'order_%' },
      },
      order: [['plan', 'DESC']],
    });

    const orderIds = rows
      .map((r) => parseOrderIdFromSubcategory(r.subcategory))
      .filter((id) => id != null);

    const orders =
      orderIds.length > 0
        ? await db.Order.findAll({
            where: { id: orderIds },
            attributes: ['id', 'tz_code', 'model_name', 'title', 'quantity', 'total_quantity'],
            include: [{ model: db.Client, attributes: ['name'] }],
          })
        : [];

    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const result = rows.map((row) => {
      const orderId = parseOrderIdFromSubcategory(row.subcategory);
      const order = orderId != null ? orderMap.get(orderId) : null;
      const plan = toNum(row.plan);
      return {
        order_id: orderId,
        order_number:
          order?.tz_code ||
          parseOrderNumberFromNote(row.note) ||
          (orderId != null ? String(orderId) : ''),
        order_name: order?.model_name || order?.title || null,
        quantity: order?.total_quantity ?? order?.quantity ?? null,
        client: order?.Client?.name || null,
        amount: plan,
        category: row.category,
        week_number: row.week_number,
        year: row.year,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Неделя плана: приоритет plan_date, иначе сохранённый week_number */
function resolveExpensePlanWeek(plan) {
  const fromDate = weekNumberForDate(plan.plan_date);
  if (fromDate) return fromDate;
  const fromField = parseInt(plan.week_number, 10);
  if (fromField >= 1 && fromField <= 52) return fromField;
  return null;
}

function expensePlanBelongsToYear(plan, year) {
  const fromYear = parseInt(plan.year, 10);
  if (fromYear === year) return true;
  const iso = String(plan.plan_date || '').slice(0, 10);
  return iso >= `${year}-01-01` && iso <= `${year}-12-31`;
}

/** Агрегация плановых расходов по неделям (все статусы, без лишних фильтров) */
router.get('/planned-expenses-by-week', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;
    const plans = await db.ExpensePlan.findAll({
      order: [['plan_date', 'ASC'], ['id', 'ASC']],
    });

    const byWeek = {};
    for (const row of plans) {
      const plan = row.toJSON ? row.toJSON() : row;
      if (!expensePlanBelongsToYear(plan, year)) continue;

      const amount = toNum(plan.amount);
      if (amount <= 0) continue;

      const weekNum = resolveExpensePlanWeek(plan);
      if (!weekNum) continue;

      const key = `${year}_${weekNum}`;
      if (!byWeek[key]) {
        byWeek[key] = { total: 0, items: [] };
      }
      byWeek[key].total += amount;
      byWeek[key].items.push({
        id: plan.id,
        article: plan.article,
        supplier: plan.supplier,
        employee: plan.employee,
        amount,
        plan_date: plan.plan_date,
        status: plan.status,
        tz: plan.tz,
      });
    }

    res.json(byWeek);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;
    const rows = await PaymentCalendar.findAll({
      where: { year },
      order: [
        ['week_number', 'ASC'],
        ['category', 'ASC'],
        ['subcategory', 'ASC'],
      ],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.put('/cell', async (req, res, next) => {
  try {
    const row = await upsertPaymentCalendarCell(PaymentCalendar, req.body);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('обязательны')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
