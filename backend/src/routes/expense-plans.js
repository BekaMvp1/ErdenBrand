/**
 * Планирование расходов — API
 */

const express = require('express');
const db = require('../models');
const {
  normalizeExpensePlanPayload,
  syncExpensePlanToPaymentCalendar,
  removeExpensePlanFromPaymentCalendar,
  recalculateAllExpensePlans,
} = require('../utils/expensePlanPaymentCalendar');

const router = express.Router();

router.post('/recalculate', async (req, res, next) => {
  try {
    await recalculateAllExpensePlans(db.PaymentCalendar, db.ExpensePlan);
    res.json({ ok: true, message: 'Пересчёт расходов выполнен' });
  } catch (err) {
    console.error('[expense-plans recalculate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res, next) => {
  try {
    const plans = await db.ExpensePlan.findAll({
      order: [['plan_date', 'ASC'], ['created_at', 'DESC']],
    });
    res.json(plans.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[expense-plans GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = normalizeExpensePlanPayload(req.body);
    const plan = await db.ExpensePlan.create(payload);
    await plan.reload();
    await syncExpensePlanToPaymentCalendar(db.PaymentCalendar, plan);
    res.status(201).json(plan.toJSON());
  } catch (err) {
    console.error('[expense-plans POST]', err.message);
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const plan = await db.ExpensePlan.findByPk(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Not found' });
    }

    await removeExpensePlanFromPaymentCalendar(db.PaymentCalendar, plan);

    const payload = normalizeExpensePlanPayload({
      ...plan.toJSON(),
      ...req.body,
    });
    await plan.update(payload);
    await plan.reload();
    await syncExpensePlanToPaymentCalendar(db.PaymentCalendar, plan);

    res.json(plan.toJSON());
  } catch (err) {
    console.error('[expense-plans PUT]', err.message);
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const plan = await db.ExpensePlan.findByPk(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Not found' });
    }

    await removeExpensePlanFromPaymentCalendar(db.PaymentCalendar, plan);
    await plan.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error('[expense-plans DELETE]', err.message);
    next(err);
  }
});

module.exports = router;
