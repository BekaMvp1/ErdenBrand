'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      const desc = await queryInterface.describeTable('warehouse_materials');
      if (!desc.total_sum) {
        await queryInterface.addColumn('warehouse_materials', 'total_sum', {
          type: Sequelize.DECIMAL(12, 2),
          defaultValue: 0,
          allowNull: true,
        });
      }
      if (!desc.received_at) {
        await queryInterface.addColumn('warehouse_materials', 'received_at', {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          allowNull: true,
        });
      }
      if (!desc.batch_number) {
        await queryInterface.addColumn('warehouse_materials', 'batch_number', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      if (!desc.procurement_id) {
        await queryInterface.addColumn('warehouse_materials', 'procurement_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
        });
      }
    } catch (err) {
      console.error('Migration error:', err.message);
    }
  },

  down: async (queryInterface) => {
    const desc = await queryInterface.describeTable('warehouse_materials');
    if (desc.total_sum) {
      await queryInterface.removeColumn('warehouse_materials', 'total_sum');
    }
    if (desc.received_at) {
      await queryInterface.removeColumn('warehouse_materials', 'received_at');
    }
    if (desc.batch_number) {
      await queryInterface.removeColumn('warehouse_materials', 'batch_number');
    }
    if (desc.procurement_id) {
      await queryInterface.removeColumn('warehouse_materials', 'procurement_id');
    }
  },
};
