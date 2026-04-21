'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: тип модели (Обычная | Комплект)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'model_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'regular',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'model_type');
  },
};
