/**
 * Роуты для дашборда (монтируются в app.js как /api/dashboard + authenticate + requireRole)
 *
 * Зарегистрированные маршруты:
 *   GET  /api/dashboard              — KPI, floor_stats, hot_orders, stage_counts (router.get('/'))
 *   GET  /api/dashboard/production   — production_stats, daily_capacity, orders_progress, today_tasks, deadlines
 *   GET  /api/dashboard/summary      — totalOrders, activeOrders, completedOrders, completionPercent
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { WORKING_DAYS_PER_WEEK, getWeekStart } = require('../utils/planningUtils');

const router = express.Router();

/** Понедельник и воскресенье текущей недели (YYYY-MM-DD) */
function getWeekBounds() {
  const d = new Date();
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    monday: mon.toISOString().slice(0, 10),
    sunday: sun.toISOString().slice(0, 10),
  };
}

/**
 * GET /api/dashboard
 * Дашборд производства: KPI, табло этажей, горящие заказы, счётчики по этапам
 */
router.get('/', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const { monday, sunday } = getWeekBounds();

    // KPI: заказы в работе (Принят, В работе), просроченные
    const [statusRows] = await db.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE LOWER(os.name) IN ('принят', 'в работе')) AS orders_in_progress,
        (SELECT COUNT(*) FROM orders WHERE deadline < :today) AS overdue
    `, { replacements: { today } });
    const kpi = {
      orders_in_progress: parseInt(statusRows[0]?.orders_in_progress || 0, 10),
      overdue: parseInt(statusRows[0]?.overdue || 0, 10),
      today_plan: 0,
      today_fact: 0,
      qc_pending: 0,
      warehouse_ready: 0,
      to_ship: 0,
    };

    // План/факт сегодня по пошиву (production_plan_day)
    const [dayRows] = await db.sequelize.query(`
      SELECT 
        COALESCE(SUM(planned_qty), 0)::int AS plan_today,
        COALESCE(SUM(actual_qty), 0)::int AS fact_today
      FROM production_plan_day WHERE date = :today
    `, { replacements: { today } });
    kpi.today_plan = parseInt(dayRows[0]?.plan_today || 0, 10);
    kpi.today_fact = parseInt(dayRows[0]?.fact_today || 0, 10);

    // ОТК ожидают: партии DONE без QC
    const [qcRows] = await db.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM sewing_batches sb
      LEFT JOIN qc_batches qb ON qb.batch_id = sb.id
      WHERE sb.status = 'READY_FOR_QC'
    `);
    kpi.qc_pending = parseInt(qcRows[0]?.cnt || 0, 10);

    // На складе готово: сумма qty
    const [whRows] = await db.sequelize.query(`SELECT COALESCE(SUM(qty), 0)::int AS total FROM warehouse_stock`);
    kpi.warehouse_ready = parseInt(whRows[0]?.total || 0, 10);

    // К отгрузке сегодня/завтра: заказы с дедлайном сегодня или завтра
    const [shipRows] = await db.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM orders WHERE deadline IN (:today, :tomorrow)
    `, { replacements: { today, tomorrow } });
    kpi.to_ship = parseInt(shipRows[0]?.cnt || 0, 10);

    // Табло этажей 1..4: план сегодня, факт сегодня, % выполнения, остаток на неделю
    const [floorToday] = await db.sequelize.query(`
      SELECT floor_id,
             COALESCE(SUM(planned_qty), 0)::int AS plan_today,
             COALESCE(SUM(actual_qty), 0)::int AS fact_today
      FROM production_plan_day WHERE date = :today AND floor_id IN (1,2,3,4)
      GROUP BY floor_id
    `, { replacements: { today } });
    const [floorWeek] = await db.sequelize.query(`
      SELECT floor_id,
             COALESCE(SUM(planned_qty), 0)::int AS plan_week,
             COALESCE(SUM(actual_qty), 0)::int AS fact_week
      FROM production_plan_day WHERE date BETWEEN :monday AND :sunday AND floor_id IN (1,2,3,4)
      GROUP BY floor_id
    `, { replacements: { monday, sunday } });
    const weekByFloor = {};
    floorWeek.forEach((r) => { weekByFloor[r.floor_id] = r; });
    const floorNames = { 1: 'Этаж 1', 2: 'Этаж 2', 3: 'Этаж 3', 4: 'Этаж 4' };
    const floor_stats = [1, 2, 3, 4].map((fid) => {
      const t = floorToday.find((r) => r.floor_id === fid) || { plan_today: 0, fact_today: 0 };
      const w = weekByFloor[fid] || { plan_week: 0, fact_week: 0 };
      const plan_today = parseInt(t.plan_today || 0, 10);
      const fact_today = parseInt(t.fact_today || 0, 10);
      const plan_week = parseInt(w.plan_week || 0, 10);
      const fact_week = parseInt(w.fact_week || 0, 10);
      const remainder_week = Math.max(0, plan_week - fact_week);
      const percent = plan_today > 0 ? Math.round((fact_today / plan_today) * 100) : 0;
      return {
        floor_id: fid,
        floor_name: floorNames[fid],
        plan_today,
        fact_today,
        percent,
        remainder_week,
      };
    });

    // Горящие заказы: просрочены или дедлайн <= 3 дня, топ 10 по приоритету
    const threeDaysLater = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    const hotOrders = await db.Order.findAll({
      where: { deadline: { [Op.lte]: threeDaysLater } },
      include: [
        { model: db.Client, as: 'Client', attributes: ['name'] },
        { model: db.OrderStatus, as: 'OrderStatus', attributes: ['name'] },
      ],
      attributes: ['id', 'title', 'deadline', 'created_at'],
      order: [['deadline', 'ASC']],
      limit: 10,
    });
    const hot_orders = hotOrders.map((o) => ({
      id: o.id,
      title: o.title,
      deadline: o.deadline,
      client_name: o.Client?.name || '—',
      status_name: o.OrderStatus?.name || '—',
      is_overdue: o.deadline && o.deadline < today,
    }));

    // Счётчики по этапам: заказы, у которых этап не DONE (упрощённо — по order_operations)
    const stageKeys = ['procurement', 'cutting', 'sewing', 'qc', 'warehouse', 'shipping'];
    const [stageRows] = await db.sequelize.query(`
      SELECT stage_key, COUNT(DISTINCT order_id) AS cnt
      FROM order_operations
      WHERE stage_key IS NOT NULL AND stage_key != ''
      GROUP BY stage_key
    `);
    const stage_counts = {};
    stageKeys.forEach((k) => { stage_counts[k] = 0; });
    stageRows.forEach((r) => {
      if (stage_counts[r.stage_key] !== undefined) stage_counts[r.stage_key] = parseInt(r.cnt, 10);
    });

    res.json({
      kpi,
      floor_stats,
      hot_orders,
      stage_counts,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/production
 * Production control panel: stats, daily capacity, orders progress, today tasks, deadlines
 */
router.get('/production', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // ——— 1. Production stats ———
    const [statusRows] = await db.sequelize.query(`
      SELECT (SELECT COUNT(*) FROM orders o JOIN order_status os ON os.id = o.status_id
        WHERE LOWER(os.name) IN ('принят', 'в работе')) AS orders_in_progress
    `, { replacements: {} });
    const orders_in_progress = parseInt(statusRows[0]?.orders_in_progress || 0, 10);

    const [cutTodayRows] = await db.sequelize.query(`
      SELECT COALESCE(SUM((SELECT SUM((v->>'quantity_actual')::int) FROM jsonb_array_elements(COALESCE(actual_variants,'[]'::jsonb)) v)), 0)::int AS cnt
      FROM cutting_tasks WHERE status = 'Готово' AND end_date = :today
    `, { replacements: { today } });
    const cut_today = parseInt(cutTodayRows[0]?.cnt || 0, 10);

    const [sewnTodayRows] = await db.sequelize.query(`
      SELECT COALESCE(SUM(fact_qty), 0)::int AS cnt FROM sewing_fact WHERE date = :today
    `, { replacements: { today } });
    const sewn_today = parseInt(sewnTodayRows[0]?.cnt || 0, 10);

    const [qcTodayRows] = await db.sequelize.query(`
      SELECT COALESCE(SUM(passed_total), 0)::int AS cnt FROM qc_batches
      WHERE DATE(created_at) = :today
    `, { replacements: { today } });
    const qc_today = parseInt(qcTodayRows[0]?.cnt || 0, 10);

    const [whRows] = await db.sequelize.query(`SELECT COALESCE(SUM(qty), 0)::int AS total FROM warehouse_stock`);
    const warehouse_ready = parseInt(whRows[0]?.total || 0, 10);

    const [shippedRows] = await db.sequelize.query(`
      SELECT COALESCE(SUM(si.qty), 0)::int AS cnt
      FROM shipments s
      LEFT JOIN shipment_items si ON si.shipment_id = s.id
      WHERE DATE(s.shipped_at) = :today
    `, { replacements: { today } });
    let shipped_today = parseInt(shippedRows[0]?.cnt || 0, 10);
    if (isNaN(shipped_today) || shipped_today === 0) {
      const [shipLegacy] = await db.sequelize.query(`
        SELECT COALESCE(SUM(qty), 0)::int AS cnt FROM shipments WHERE DATE(shipped_at) = :today
      `, { replacements: { today } });
      shipped_today = parseInt(shipLegacy[0]?.cnt || 0, 10);
    }

    const production_stats = {
      orders_in_progress,
      cut_today,
      sewn_today,
      qc_today,
      warehouse_ready,
      shipped_today,
    };

    // ——— 2. Daily capacity (last 14 days) ———
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 14);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const [planRows] = await db.sequelize.query(`
      SELECT date::text AS date, COALESCE(SUM(planned_qty), 0)::int AS plan
      FROM production_plan_day WHERE date >= :fromStr AND date <= :today
      GROUP BY date ORDER BY date
    `, { replacements: { fromStr, today } });
    const planByDate = {};
    (planRows || []).forEach((r) => { planByDate[r.date] = r.plan; });

    const capacities = await db.WeeklyCapacity.findAll({ attributes: ['week_start', 'capacity_week', 'building_floor_id'], raw: true });
    const capByWeek = {};
    capacities.forEach((c) => {
      const ws = c.week_start ? String(c.week_start).slice(0, 10) : null;
      if (ws) capByWeek[ws] = (capByWeek[ws] || 0) + (parseFloat(c.capacity_week) || 0);
    });

    const daily_capacity = [];
    const d = new Date(fromStr + 'T12:00:00');
    const end = new Date(today + 'T12:00:00');
    while (d <= end) {
      const dateStr = d.toISOString().slice(0, 10);
      const plan = planByDate[dateStr] || 0;
      const ws = getWeekStart(dateStr);
      const capWeek = capByWeek[ws] || 0;
      const capacity = Math.round(capWeek / WORKING_DAYS_PER_WEEK);
      const overload = Math.max(0, plan - capacity);
      daily_capacity.push({ date: dateStr, plan, capacity, overload });
      d.setDate(d.getDate() + 1);
    }

    // ——— 3. Orders progress ———
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

    const [sewByOrderRows] = await db.sequelize.query(`
      SELECT order_id, COALESCE(SUM(fact_qty), 0)::int AS total
      FROM sewing_fact WHERE order_id IN (:orderIds) GROUP BY order_id
    `, { replacements: { orderIds: orderIdsForQuery } });
    const sewByOrder = {};
    (sewByOrderRows || []).forEach((r) => { sewByOrder[r.order_id] = r.total; });

    const qcByOrder = {};
    const qcBatches = await db.QcBatch.findAll({
      where: {},
      include: [{ model: db.SewingBatch, as: 'SewingBatch', attributes: ['order_id'] }],
      attributes: ['passed_total'],
    });
    qcBatches.forEach((qb) => {
      const oid = qb.SewingBatch?.order_id;
      if (oid) qcByOrder[oid] = (qcByOrder[oid] || 0) + (parseInt(qb.passed_total, 10) || 0);
    });

    const [whByOrderRows] = await db.sequelize.query(`
      SELECT order_id, COALESCE(SUM(qty), 0)::int AS total
      FROM warehouse_stock WHERE order_id IN (:orderIds) GROUP BY order_id
    `, { replacements: { orderIds: orderIdsForQuery } });
    const whByOrder = {};
    (whByOrderRows || []).forEach((r) => { whByOrder[r.order_id] = r.total; });

    const planByOrder = {};
    const planDays = await db.ProductionPlanDay.findAll({
      where: { order_id: orderIdsForQuery },
      attributes: ['order_id', 'planned_qty'],
      raw: true,
    });
    planDays.forEach((pd) => {
      planByOrder[pd.order_id] = (planByOrder[pd.order_id] || 0) + (pd.planned_qty || 0);
    });

    const orders_progress = orders.map((o) => {
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

    // ——— 4. Today tasks (orders at each stage) ———
    const [cutCount] = await db.sequelize.query(`
      SELECT COUNT(DISTINCT order_id) AS cnt FROM order_stages
      WHERE stage_key = 'cutting' AND status != 'DONE'
    `);
    const [sewCount] = await db.sequelize.query(`
      SELECT COUNT(DISTINCT order_id) AS cnt FROM order_stages
      WHERE stage_key = 'sewing' AND status != 'DONE'
    `);
    const [qcCount] = await db.sequelize.query(`
      SELECT COUNT(*) AS cnt FROM sewing_batches WHERE status = 'READY_FOR_QC'
    `);
    const today_tasks = {
      cutting: parseInt(cutCount[0]?.cnt || 0, 10),
      sewing: parseInt(sewCount[0]?.cnt || 0, 10),
      qc: parseInt(qcCount[0]?.cnt || 0, 10),
    };

    // ——— 5. Deadlines ———
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
    const todayMs = new Date(today + 'T12:00:00').getTime();
    const deadlines = deadlineOrders.map((o) => {
      const d = o.deadline ? String(o.deadline).slice(0, 10) : null;
      const deadlineMs = d ? new Date(d + 'T12:00:00').getTime() : 0;
      const days_left = d ? Math.ceil((deadlineMs - todayMs) / 86400000) : null;
      return {
        order_id: o.id,
        title: o.title || `#${o.id}`,
        client_name: o.Client?.name || '—',
        deadline: d,
        days_left,
      };
    });

    res.json({
      production_stats,
      daily_capacity,
      orders_progress,
      today_tasks,
      deadlines,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/summary
 * Возвращает сводку: всего заказов, активные, выполненные, процент выполнения
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Один запрос: агрегация по статусам
    const [rows] = await db.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM orders) as total,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name IN ('Принят', 'В работе')) as active,
        (SELECT COUNT(*) FROM orders o 
         JOIN order_status os ON os.id = o.status_id 
         WHERE os.name = 'Готов') as completed
    `);

    const r = rows[0];
    const totalOrders = parseInt(r?.total || 0, 10);
    const activeOrders = parseInt(r?.active || 0, 10);
    const completedOrders = parseInt(r?.completed || 0, 10);

    // Процент выполнения (выполненные / всего * 100)
    const completionPercent =
      totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;

    res.json({
      totalOrders,
      activeOrders,
      completedOrders,
      completionPercent,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
