'use strict';

/** Детали партии/изделия без засорения item_name JSON-префиксами */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('movement_document_items');

    if (!tableDesc.item_meta) {
      await queryInterface.addColumn('movement_document_items', 'item_meta', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('movement_document_items');
    if (tableDesc.item_meta) {
      await queryInterface.removeColumn('movement_document_items', 'item_meta');
    }
  },
};
