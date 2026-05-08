'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('warehouse_movements');

    if (!table.from_warehouse_id) {
      await queryInterface.addColumn('warehouse_movements', 'from_warehouse_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.to_warehouse_id) {
      await queryInterface.addColumn('warehouse_movements', 'to_warehouse_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('warehouse_movements');

    if (table.to_warehouse_id) {
      await queryInterface.removeColumn('warehouse_movements', 'to_warehouse_id');
    }
    if (table.from_warehouse_id) {
      await queryInterface.removeColumn('warehouse_movements', 'from_warehouse_id');
    }
  },
};
