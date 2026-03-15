'use strict';

/**
 * Миграция: дата поступления заказа (выбирается при создании заказа)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'receipt_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'receipt_date');
  },
};
