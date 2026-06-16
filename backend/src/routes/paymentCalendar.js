/**
 * Платёжный календарь по неделям
 */

const express = require('express');
const db = require('../models');
const PaymentCalendar = db.PaymentCalendar;
const { upsertPaymentCalendarCell, weekNumberForDate, toNum } = require('../utils/paymentCalendarCell');

const router = express.Router();

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
