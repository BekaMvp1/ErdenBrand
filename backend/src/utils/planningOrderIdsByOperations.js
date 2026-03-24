/**
 * Список заказов для календаря планирования — только через order_operations + orders.
 * Не поднимаем «все заказы цеха» без связи с операциями на этаже.
 */

const { QueryTypes } = require('sequelize');

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ workshop_id: number, floor_id: number | null }} opts
 *        floor_id — id building_floors; если null (цех без выбора этажа / один этаж в логике API), все операции цеха
 * @returns {Promise<number[]>}
 */
async function getOrderIdsForPlanningByOperations(sequelize, { workshop_id, floor_id }) {
  const wid = Number(workshop_id);
  if (!wid) return [];

  if (floor_id != null && floor_id !== '') {
    const fid = Number(floor_id);
    if (Number.isNaN(fid)) return [];
    const rows = await sequelize.query(
      `
      SELECT DISTINCT op.order_id AS id
      FROM order_operations op
      INNER JOIN orders o ON o.id = op.order_id
      LEFT JOIN operations oper ON oper.id = op.operation_id
      WHERE o.workshop_id = :workshop_id
        AND (
          op.floor_id = :floor_id
          OR (op.floor_id IS NULL AND oper.default_floor_id = :floor_id)
        )
      `,
      {
        replacements: { workshop_id: wid, floor_id: fid },
        type: QueryTypes.SELECT,
      }
    );
    return rows.map((r) => r.id);
  }

  const rows = await sequelize.query(
    `
    SELECT DISTINCT op.order_id AS id
    FROM order_operations op
    INNER JOIN orders o ON o.id = op.order_id
    WHERE o.workshop_id = :workshop_id
    `,
    {
      replacements: { workshop_id: wid },
      type: QueryTypes.SELECT,
    }
  );
  return rows.map((r) => r.id);
}

module.exports = { getOrderIdsForPlanningByOperations };
