/**
 * Планирование комплектов: план/факт по частям, комплект = MIN(части).
 * В кодовой базе «части» = order_parts (не путать с order_operations — этапы пайплайна).
 */

const { QueryTypes } = require('sequelize');

/**
 * Агрегаты по заказам с комплектами для UI (accordion).
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ workshop_id: number, date_from?: string, date_to?: string, building_floor_id?: number|null }} filters
 */
async function getKitPlanningRows(sequelize, filters) {
  const { workshop_id, date_from, date_to, building_floor_id } = filters;
  const repl = { workshop_id };
  let dateFilter = '';
  if (date_from && date_to) {
    repl.date_from = date_from;
    repl.date_to = date_to;
    dateFilter = `AND o.deadline >= :date_from AND o.deadline <= :date_to`;
  }

  let floorWhere = '';
  if (building_floor_id != null && building_floor_id !== 'all') {
    repl.floor_id = Number(building_floor_id);
    floorWhere = 'AND op.floor_id = :floor_id';
  }

  /* eslint-disable max-len */
  const sql = `
    SELECT
      o.id AS order_id,
      o.title,
      o.tz_code,
      o.model_name,
      o.total_quantity,
      o.quantity,
      o.model_type,
      o.deadline,
      o.workshop_id,
      c.name AS client_name,
      op.id AS part_id,
      op.part_name,
      op.floor_id AS part_floor_id,
      op.sort_order,
      COALESCE(op.planned_quantity, o.total_quantity, o.quantity, 0)::int AS part_planned,
      COALESCE(fact.completed_qty, 0)::int AS part_completed
    FROM orders o
    INNER JOIN clients c ON c.id = o.client_id
    INNER JOIN order_parts op ON op.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(sb.qty), 0)::int AS completed_qty
      FROM sewing_batches sb
      WHERE sb.order_id = o.id
        AND (
          sb.order_part_id = op.id
          OR (sb.order_part_id IS NULL AND sb.floor_id IS NOT DISTINCT FROM op.floor_id)
        )
    ) fact ON true
    WHERE o.workshop_id = :workshop_id
      AND o.model_type = 'set'
      ${dateFilter}
      ${floorWhere}
    ORDER BY c.name, o.title, op.sort_order, op.id
  `;
  /* eslint-enable max-len */

  const rows = await sequelize.query(sql, {
    replacements: repl,
    type: QueryTypes.SELECT,
  });

  return rows;
}

/**
 * Сводка по заказу: план комплекта, факт комплекта = MIN(факт по частям).
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('../models')} db — модели Sequelize (для include)
 */
async function getKitOrderSummary(sequelize, db, orderId) {
  const order = await db.Order.findByPk(orderId, {
    attributes: ['id', 'total_quantity', 'quantity', 'model_type'],
    include: [{ model: db.OrderPart, as: 'OrderParts', required: false }],
  });
  if (!order || order.model_type !== 'set') {
    return { kit_planned: 0, kit_completed: 0, parts: [], is_kit: false };
  }

  const baseQty = order.total_quantity ?? order.quantity ?? 0;
  const partsRaw = (order.OrderParts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const batches = await db.SewingBatch.findAll({
    where: { order_id: orderId },
    attributes: ['id', 'qty', 'floor_id', 'order_part_id'],
    raw: true,
  });

  const partRows = partsRaw.map((op) => {
    const planned = op.planned_quantity != null ? Number(op.planned_quantity) : baseQty;
    let sum = 0;
    for (const sb of batches) {
      if (sb.order_part_id === op.id) {
        sum += Number(sb.qty) || 0;
      } else if (sb.order_part_id == null && Number(sb.floor_id) === Number(op.floor_id)) {
        sum += Number(sb.qty) || 0;
      }
    }
    return {
      part_id: op.id,
      part_name: op.part_name,
      floor_id: op.floor_id,
      planned,
      completed: sum,
      status: op.status || 'planned',
    };
  });

  const plannedVals = partRows.map((p) => p.planned);
  const completedVals = partRows.map((p) => p.completed);
  const kit_planned = plannedVals.length ? Math.min(...plannedVals) : baseQty;
  const kit_completed = completedVals.length ? Math.min(...completedVals) : 0;

  return {
    kit_planned,
    kit_completed,
    parts: partRows,
    is_kit: true,
  };
}

/**
 * Группировка плоских строк в структуру для accordion (одна строка на заказ + parts).
 */
function groupKitRowsToOrders(flatRows) {
  const byOrder = new Map();
  for (const r of flatRows) {
    const oid = r.order_id;
    if (!byOrder.has(oid)) {
      byOrder.set(oid, {
        order_id: oid,
        title: r.title,
        tz_code: r.tz_code,
        model_name: r.model_name,
        client_name: r.client_name,
        deadline: r.deadline,
        workshop_id: r.workshop_id,
        total_quantity: r.total_quantity,
        model_type: r.model_type,
        parts: [],
      });
    }
    byOrder.get(oid).parts.push({
      part_id: r.part_id,
      part_name: r.part_name,
      floor_id: r.part_floor_id,
      sort_order: r.sort_order,
      planned: Number(r.part_planned) || 0,
      completed: Number(r.part_completed) || 0,
    });
  }
  const orders = [...byOrder.values()];
  for (const o of orders) {
    const p = o.parts.map((x) => x.planned);
    const c = o.parts.map((x) => x.completed);
    o.kit_planned = p.length ? Math.min(...p) : o.total_quantity ?? 0;
    o.kit_completed = c.length ? Math.min(...c) : 0;
  }
  return { orders };
}

module.exports = {
  getKitPlanningRows,
  getKitOrderSummary,
  groupKitRowsToOrders,
};
