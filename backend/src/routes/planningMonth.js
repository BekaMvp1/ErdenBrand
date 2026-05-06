const express = require('express');
const db = require('../models');

const router = express.Router();

function monthKey(v) {
  const s = String(v || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

const METRICS = ['prep_plan', 'prep_fact', 'main_plan', 'main_fact'];

router.get('/', async (req, res) => {
  try {
    const month = monthKey(req.query.month);
    if (!month) return res.status(400).json({ error: 'month=YYYY-MM required' });

    const rows = await db.PlanningMonthFact.findAll({
      where: {
        user_id: req.user.id,
        scope_key: { [db.Sequelize.Op.like]: `pm2:${month}:%` },
      },
      attributes: ['order_id', 'scope_key', 'value'],
      raw: true,
    });

    const facts = [];
    rows.forEach((r) => {
      const parts = String(r.scope_key || '').split(':');
      // pm2:YYYY-MM:week:metric
      const week_number = Number(parts[2] || 0);
      const metric = parts[3] || '';
      if (!METRICS.includes(metric) || !Number.isFinite(week_number) || week_number < 1 || week_number > 5) return;
      facts.push({
        order_id: Number(r.order_id),
        week_number,
        metric,
        value: Number(r.value) || 0,
      });
    });

    return res.json({ facts });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'planning-month get failed' });
  }
});

router.post('/', async (req, res) => {
  try {
    const month = monthKey(req.body?.month);
    if (!month) return res.status(400).json({ error: 'month=YYYY-MM required' });
    const order_id = Number(req.body?.order_id);
    const week_number = Number(req.body?.week_number);
    const metric = String(req.body?.metric || '').trim();
    const value = Number(req.body?.value);

    if (!Number.isFinite(order_id) || order_id <= 0) return res.status(400).json({ error: 'order_id required' });
    if (!Number.isFinite(week_number) || week_number < 1 || week_number > 5) return res.status(400).json({ error: 'week_number must be 1..5' });
    if (!METRICS.includes(metric)) return res.status(400).json({ error: 'invalid metric' });

    const scope_key = `pm2:${month}:${week_number}:${metric}`;
    const [row, created] = await db.PlanningMonthFact.findOrCreate({
      where: {
        user_id: req.user.id,
        scope_key,
        week_slice_start: 0,
        order_id,
        week_index: 0,
      },
      defaults: { value: Number.isFinite(value) ? Math.round(value) : 0 },
    });
    if (!created) {
      await row.update({ value: Number.isFinite(value) ? Math.round(value) : 0 });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'planning-month save failed' });
  }
});

module.exports = router;
