'use strict';

/**
 * Миграция: тип модели (Обычная | Комплект)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'model_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'regular',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'model_type');
  },
};
