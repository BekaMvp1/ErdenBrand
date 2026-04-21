'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: добавление size_in_numbers и size_in_letters в orders
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'size_in_numbers', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'orders', 'size_in_letters', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'size_in_numbers');
    await queryInterface.removeColumn('orders', 'size_in_letters');
  },
};
