'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: completed_at для заказов, составной индекс
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await safeAddIndex(queryInterface, 'orders', ['status_id', 'deadline'], {
      name: 'orders_status_deadline_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_status_deadline_idx');
    await queryInterface.removeColumn('orders', 'completed_at');
  },
};
