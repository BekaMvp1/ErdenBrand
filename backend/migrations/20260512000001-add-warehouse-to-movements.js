'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDesc = await queryInterface.describeTable('movement_documents');
    if (!tableDesc.from_warehouse_id) {
      await queryInterface.addColumn('movement_documents', 'from_warehouse_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    if (!tableDesc.to_warehouse_id) {
      await queryInterface.addColumn('movement_documents', 'to_warehouse_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const tableDesc = await queryInterface.describeTable('movement_documents');
    if (tableDesc.from_warehouse_id) {
      await queryInterface.removeColumn('movement_documents', 'from_warehouse_id');
    }
    if (tableDesc.to_warehouse_id) {
      await queryInterface.removeColumn('movement_documents', 'to_warehouse_id');
    }
  },
};
