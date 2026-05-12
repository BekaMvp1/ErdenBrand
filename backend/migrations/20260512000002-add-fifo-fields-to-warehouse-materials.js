'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const desc = await queryInterface.describeTable('warehouse_materials');
    if (!desc.received_at) {
      await queryInterface.addColumn('warehouse_materials', 'received_at', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
    if (!desc.batch_number) {
      await queryInterface.addColumn('warehouse_materials', 'batch_number', {
        type: Sequelize.STRING(80),
        allowNull: true,
      });
    }
    if (!desc.total_sum) {
      await queryInterface.addColumn('warehouse_materials', 'total_sum', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!desc.procurement_id) {
      await queryInterface.addColumn('warehouse_materials', 'procurement_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('warehouse_materials');
    if (desc.procurement_id) {
      await queryInterface.removeColumn('warehouse_materials', 'procurement_id');
    }
    if (desc.total_sum) {
      await queryInterface.removeColumn('warehouse_materials', 'total_sum');
    }
    if (desc.batch_number) {
      await queryInterface.removeColumn('warehouse_materials', 'batch_number');
    }
    if (desc.received_at) {
      await queryInterface.removeColumn('warehouse_materials', 'received_at');
    }
  },
};
