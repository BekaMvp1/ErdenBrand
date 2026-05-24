'use strict';

/**
 * При проведении перемещения в warehouse_movements копируется item_name партии (JSON) —
 * VARCHAR(255) вызывает ошибку.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('warehouse_movements', 'item_name', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('warehouse_movements', 'item_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
};
