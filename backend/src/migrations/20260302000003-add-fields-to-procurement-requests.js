'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: дополнительные поля для закупа
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('procurement_requests');

    if (!table.due_date) {
      await addColumnIfMissing(queryInterface, 'procurement_requests', 'due_date', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!table.total_sum) {
      await addColumnIfMissing(queryInterface, 'procurement_requests', 'total_sum', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!table.created_by) {
      await addColumnIfMissing(queryInterface, 'procurement_requests', 'created_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('procurement_requests', 'created_by').catch(() => {});
    await queryInterface.removeColumn('procurement_requests', 'total_sum').catch(() => {});
    await queryInterface.removeColumn('procurement_requests', 'due_date').catch(() => {});
  },
};
