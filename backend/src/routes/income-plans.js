/**
 * Плановые поступления — API
 */

const express = require('express');
const db = require('../models');
const {
  syncIncomePlanToPaymentCalendar,
  removeIncomePlanFromPaymentCalendar,
  normalizeIncomePlanDates,
  recalculateAllIncomePlans,
} = require('../utils/incomePlanPaymentCalendar');

const router = express.Router();

router.post('/recalculate', async (req, res, next) => {
  try {
    await recalculateAllIncomePlans(db.PaymentCalendar, db.IncomePlan);
    res.json({ ok: true, message: 'Пересчёт выполнен' });
  } catch (err) {
    console.error('[income-plans recalculate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res, next) => {
  try {
    const plans = await db.IncomePlan.findAll({
      order: [['created_at', 'DESC']],
    });
    res.json(plans.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[income-plans GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      dates: normalizeIncomePlanDates(req.body?.dates),
    };
    const plan = await db.IncomePlan.create(payload);
    await syncIncomePlanToPaymentCalendar(db.PaymentCalendar, plan);
    res.status(201).json(plan.toJSON());
  } catch (err) {
    console.error('[income-plans POST]', err.message);
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const plan = await db.IncomePlan.findByPk(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Not found' });
    }

    await removeIncomePlanFromPaymentCalendar(db.PaymentCalendar, plan);

    const payload = {
      ...req.body,
      dates: normalizeIncomePlanDates(req.body?.dates ?? plan.dates),
    };
    await plan.update(payload);
    await plan.reload();
    await syncIncomePlanToPaymentCalendar(db.PaymentCalendar, plan);

    res.json(plan.toJSON());
  } catch (err) {
    console.error('[income-plans PUT]', err.message);
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const plan = await db.IncomePlan.findByPk(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Not found' });
    }

    await removeIncomePlanFromPaymentCalendar(db.PaymentCalendar, plan);
    await plan.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error('[income-plans DELETE]', err.message);
    next(err);
  }
});

module.exports = router;
