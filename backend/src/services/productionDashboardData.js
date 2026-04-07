/**
 * Данные для Production Dashboard — раздельные лёгкие запросы (без полного скана qc_batches).
 */

const { Op } = require('sequelize');
const db = require('../models');
const { WORKING_DAYS_PER_WEEK, getWeekStart } = require('../utils/planningUtils');

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function getProductionStats() {
  const today = todayIso();

  const [statusRows] = await db.sequelize.query(
    `SELECT (SELECT COUNT(*) FROM orders o JOIN order_status os ON os.id = o.status_id
        WHERE LOWER(os.name) IN ('принят', 'в работе')) AS orders_in_progress`,
    { replacements: {} }
  );
  const orders_in_progress = parseInt(statusRows[0]?.orders_in_progress || 0, 10);

  const [cutTodayRows] = await db.sequelize.query(
    `SELECT COALESCE(SUM((SELECT SUM((v->>'quantity_actual')::int) FROM jsonb_array_elements(COALESCE(actual_variants,'[]'::jsonb)) v)), 0)::int AS cnt
      FROM cutting_tasks WHERE status = 'Готово' AND end_date = :today`,
    { replacements: { today } }
  );
  const cut_today = parseInt(cutTodayRows[0]?.cnt || 0, 10);

  const [sewnTodayRows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(fact_qty), 0)::int AS cnt FROM sewing_fact WHERE date = :today`,
    { replacements: { today } }
  );
  const sewn_today = parseInt(sewnTodayRows[0]?.cnt || 0, 10);

  const [qcTodayRows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(passed_total), 0)::int AS cnt FROM qc_batches
      WHERE DATE(created_at) = :today`,
    { replacements: { today } }
  );
  const qc_today = parseInt(qcTodayRows[0]?.cnt || 0, 10);

  const [whRows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(qty), 0)::int AS total FROM warehouse_stock`
  );
  const warehouse_ready = parseInt(whRows[0]?.total || 0, 10);

  const [shippedRows] = await db.sequelize.query(
    `SELECT COALESCE(SUM(si.qty), 0)::int AS cnt
      FROM shipments s
      LEFT JOIN shipment_items si ON si.shipment_id = s.id
      WHERE DATE(s.shipped_at) = :today`,
    { replacements: { today } }
  );
  let shipped_today = parseInt(shippedRows[0]?.cnt || 0, 10);
  if (isNaN(shipped_today) || shipped_today === 0) {
    const [shipLegacy] = await db.sequelize.query(
      `SELECT COALESCE(SUM(qty), 0)::int AS cnt FROM shipments WHERE DATE(shipped_at) = :today`,
      { replacements: { today } }
    );
    shipped_today = parseInt(shipLegacy[0]?.cnt || 0, 10);
  }

  return {
    orders_in_progress,
    cut_today,
    sewn_today,
    qc_today,
    warehouse_ready,
    shipped_today,
  };
}

/**
 * 7 календарных дней начиная с сегодня: план / мощность / перегруз.
 */
async function getDailyCapacityFromToday(numDays = 7) {
  const today = todayIso();
  const start = new Date(`${today}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + numDays - 1);
  const fromStr = today;
  const toStr = end.toISOString().slice(0, 10);

  const [planRows] = await db.sequelize.query(
    `SELECT date::text AS date, COALESCE(SUM(planned_qty), 0)::int AS plan
      FROM production_plan_day WHERE date >= :fromStr AND date <= :toStr
      GROUP BY date ORDER BY date`,
    { replacements: { fromStr, toStr } }
  );
  const planByDate = {};
  (planRows || []).forEach((r) => {
    planByDate[r.date] = r.plan;
  });

  const capacities = await db.WeeklyCapacity.findAll({
    attributes: ['week_start', 'capacity_week', 'building_floor_id'],
    raw: true,
  });
  const capByWeek = {};
  capacities.forEach((c) => {
    const ws = c.week_start ? String(c.week_start).slice(0, 10) : null;
    if (ws) capByWeek[ws] = (capByWeek[ws] || 0) + (parseFloat(c.capacity_week) || 0);
  });

  const daily_capacity = [];
  const d = new Date(`${fromStr}T12:00:00`);
  const endD = new Date(`${toStr}T12:00:00`);
  while (d <= endD) {
    const dateStr = d.toISOString().slice(0, 10);
    const plan = planByDate[dateStr] || 0;
    const ws = getWeekStart(dateStr);
    const capWeek = capByWeek[ws] || 0;
    const capacity = Math.round(capWeek / WORKING_DAYS_PER_WEEK);
    const overload = Math.max(0, plan - capacity);
    daily_capacity.push({ date: dateStr, plan, capacity, overload });
    d.setDate(d.getDate() + 1);
  }
  return daily_capacity;
}

async function getTodayTasks() {
  const [cutCount] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT order_id) AS cnt FROM order_stages
      WHERE stage_key = 'cutting' AND status != 'DONE'`
  );
  const [sewCount] = await db.sequelize.query(
    `SELECT COUNT(DISTINCT order_id) AS cnt FROM order_stages
      WHERE stage_key = 'sewing' AND status != 'DONE'`
  );
  const [qcCount] = await db.sequelize.query(
    `SELECT COUNT(*) AS cnt FROM sewing_batches WHERE status = 'READY_FOR_QC'`
  );
  return {
    cutting: parseInt(cutCount[0]?.cnt || 0, 10),
    sewing: parseInt(sewCount[0]?.cnt || 0, 10),
    qc: parseInt(qcCount[0]?.cnt || 0, 10),
  };
}

async function getOrdersProgress() {
  const orders = await db.Order.findAll({
    where: {},
    include: [{ model: db.Client, as: 'Client', attributes: ['name'] }],
    attributes: ['id', 'title', 'tz_code', 'model_name', 'total_quantity', 'quantity'],
    order: [['id', 'DESC']],
    limit: 50,
  });

  const orderIds = orders.map((o) => o.id);
  const orderIdsForQuery = orderIds.length > 0 ? orderIds : [0];

  const cutByOrder = {};
  const cutTasks = await db.CuttingTask.findAll({
    where: { order_id: orderIdsForQuery, status: 'Готово' },
    attributes: ['order_id', 'actual_variants'],
    raw: true,
  });
  cutTasks.forEach((t) => {
    let sum = 0;
    for (const v of t.actual_variants || []) {
      sum += parseInt(v.quantity_actual, 10) || 0;
    }
    cutByOrder[t.order_id] = (cutByOrder[t.order_id] || 0) + sum;
  });

  const [sewByOrderRows] = await db.sequelize.query(
    `SELECT order_id, COALESCE(SUM(fact_qty), 0)::int AS total
      FROM sewing_fact WHERE order_id IN (:orderIds) GROUP BY order_id`,
    { replacements: { orderIds: orderIdsForQuery } }
  );
  const sewByOrder = {};
  (sewByOrderRows || []).forEach((r) => {
    sewByOrder[r.order_id] = r.total;
  });

  const qcByOrder = {};
  if (orderIds.length > 0) {
    const qcBatches = await db.QcBatch.findAll({
      include: [
        {
          model: db.SewingBatch,
          as: 'SewingBatch',
          attributes: ['order_id'],
          where: { order_id: orderIdsForQuery },
          required: true,
        },
      ],
      attributes: ['passed_total'],
    });
    qcBatches.forEach((qb) => {
      const oid = qb.SewingBatch?.order_id;
      if (oid) qcByOrder[oid] = (qcByOrder[oid] || 0) + (parseInt(qb.passed_total, 10) || 0);
    });
  }

  const [whByOrderRows] = await db.sequelize.query(
    `SELECT order_id, COALESCE(SUM(qty), 0)::int AS total
      FROM warehouse_stock WHERE order_id IN (:orderIds) GROUP BY order_id`,
    { replacements: { orderIds: orderIdsForQuery } }
  );
  const whByOrder = {};
  (whByOrderRows || []).forEach((r) => {
    whByOrder[r.order_id] = r.total;
  });

  const planByOrder = {};
  const planDays = await db.ProductionPlanDay.findAll({
    where: { order_id: orderIdsForQuery },
    attributes: ['order_id', 'planned_qty'],
    raw: true,
  });
  planDays.forEach((pd) => {
    planByOrder[pd.order_id] = (planByOrder[pd.order_id] || 0) + (pd.planned_qty || 0);
  });

  return orders.map((o) => {
    const plan = o.total_quantity ?? o.quantity ?? planByOrder[o.id] ?? 0;
    return {
      order_id: o.id,
      title: o.title || o.tz_code || `#${o.id}`,
      client_name: o.Client?.name || '—',
      model_name: o.model_name || o.tz_code || '—',
      plan,
      cutting: cutByOrder[o.id] ?? 0,
      sewing: sewByOrder[o.id] ?? 0,
      qc: qcByOrder[o.id] ?? 0,
      warehouse: whByOrder[o.id] ?? 0,
    };
  });
}

async function getDeadlines() {
  const today = todayIso();
  const threeWeeks = new Date();
  threeWeeks.setDate(threeWeeks.getDate() + 21);
  const deadlineEnd = threeWeeks.toISOString().slice(0, 10);
  const deadlineOrders = await db.Order.findAll({
    where: { deadline: { [Op.gte]: today, [Op.lte]: deadlineEnd } },
    include: [{ model: db.Client, as: 'Client', attributes: ['name'] }],
    attributes: ['id', 'title', 'deadline'],
    order: [['deadline', 'ASC']],
    limit: 15,
  });
  const todayMs = new Date(`${today}T12:00:00`).getTime();
  return deadlineOrders.map((o) => {
    const d = o.deadline ? String(o.deadline).slice(0, 10) : null;
    const deadlineMs = d ? new Date(`${d}T12:00:00`).getTime() : 0;
    const days_left = d ? Math.ceil((deadlineMs - todayMs) / 86400000) : null;
    return {
      order_id: o.id,
      title: o.title || `#${o.id}`,
      client_name: o.Client?.name || '—',
      deadline: d,
      days_left,
    };
  });
}

module.exports = {
  getProductionStats,
  getDailyCapacityFromToday,
  getTodayTasks,
  getOrdersProgress,
  getDeadlines,
};
