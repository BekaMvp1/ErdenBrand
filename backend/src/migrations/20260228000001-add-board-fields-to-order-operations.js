'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: добавить поля для панели заказов в order_operations
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('order_operations');

    if (!table.stage_key) {
      await addColumnIfMissing(queryInterface, 'order_operations', 'stage_key', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    if (!table.planned_qty) {
      await addColumnIfMissing(queryInterface, 'order_operations', 'planned_qty', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!table.actual_qty) {
      await addColumnIfMissing(queryInterface, 'order_operations', 'actual_qty', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    await safeCreateIndexQuery(queryInterface, `
      CREATE INDEX IF NOT EXISTS order_operations_stage_key_idx
      ON order_operations (stage_key)
    `);
    await safeCreateIndexQuery(queryInterface, `
      CREATE INDEX IF NOT EXISTS order_operations_order_stage_idx
      ON order_operations (order_id, stage_key)
    `);
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('order_operations');

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS order_operations_order_stage_idx');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS order_operations_stage_key_idx');

    if (table.actual_qty) {
      await queryInterface.removeColumn('order_operations', 'actual_qty');
    }
    if (table.planned_qty) {
      await queryInterface.removeColumn('order_operations', 'planned_qty');
    }
    if (table.stage_key) {
      await queryInterface.removeColumn('order_operations', 'stage_key');
    }
  },
};
