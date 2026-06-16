/**
 * Панель расходов — агрегация из модулей + пометки распределения
 * Монтируется: /api/finance/expenses-panel
 */

const express = require('express');
const db = require('../models');
const ExpensePanelMark = require('../models/ExpensePanelMark')(
  db.sequelize,
  db.Sequelize.DataTypes
);
const {
  buildStageExpenses,
  buildPlannedExpenses,
  attachMarks,
} = require('./expensesPanelHelpers');

function parseQueryDate(value) {
  if (!value) return '';
  const s = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

const router = express.Router();

const ORDER_ATTRS = [
  'id',
  'tz_code',
  'model_name',
  'title',
  'article',
  'quantity',
  'total_quantity',
  'deadline',
  'receipt_date',
  'fabric_data',
  'fittings_data',
  'sewing_ops',
  'otk_ops',
  'total_fabric_cost',
  'total_accessories_cost',
  'total_sewing_cost',
  'total_otk_cost',
];

async function loadMarkMap() {
  const marks = await ExpensePanelMark.findAll();
  const map = new Map();
  for (const m of marks) {
    map.set(`${m.source}_${m.source_id}`, m);
  }
  return map;
}

function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { date_from: isoDateLocal(from), date_to: isoDateLocal(to) };
}

/** GET /?date_from=&date_to= */
router.get('/', async (req, res) => {
  try {
    const defaults = defaultMonthRange();
    const dateFrom = parseQueryDate(req.query.date_from) || defaults.date_from;
    const dateTo = parseQueryDate(req.query.date_to) || defaults.date_to;

    const [orders, chains, procurementRows, expensePlans, markMap] = await Promise.all([
      db.Order.findAll({ attributes: ORDER_ATTRS }),
      db.PlanningChain.findAll(),
      db.ProcurementRequest.findAll(),
      db.ExpensePlan.findAll(),
      loadMarkMap(),
    ]);

    const procurementByOrder = {};
    for (const pr of procurementRows) {
      procurementByOrder[Number(pr.order_id)] = pr;
    }

    const procurement = attachMarks(
      buildStageExpenses(orders, chains, procurementByOrder, 'procurement', dateFrom, dateTo),
      'procurement',
      markMap
    );
    const sewing = attachMarks(
      buildStageExpenses(orders, chains, procurementByOrder, 'sewing', dateFrom, dateTo),
      'sewing',
      markMap
    );
    const otk = attachMarks(
      buildStageExpenses(orders, chains, procurementByOrder, 'otk', dateFrom, dateTo),
      'otk',
      markMap
    );
    const planned_expense = attachMarks(
      buildPlannedExpenses(expensePlans, dateFrom, dateTo),
      'planned_expense',
      markMap
    );

    res.json({
      date_from: dateFrom,
      date_to: dateTo,
      procurement,
      sewing,
      otk,
      planned_expense,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /mark */
router.post('/mark', async (req, res) => {
  try {
    const { source, source_id, is_distributed } = req.body || {};
    const src = String(source || '').trim();
    const sourceId = parseInt(source_id, 10);

    if (!['procurement', 'sewing', 'otk', 'planned_expense'].includes(src)) {
      return res.status(400).json({ error: 'Некорректный source' });
    }
    if (!sourceId) {
      return res.status(400).json({ error: 'Укажите source_id' });
    }

    const distributed = !!is_distributed;
    const [mark] = await ExpensePanelMark.findOrCreate({
      where: { source: src, source_id: sourceId },
      defaults: {
        is_distributed: distributed,
        distributed_at: distributed ? new Date() : null,
      },
    });

    if (!mark.isNewRecord) {
      await mark.update({
        is_distributed: distributed,
        distributed_at: distributed ? new Date() : null,
      });
    }

    res.json(mark);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
