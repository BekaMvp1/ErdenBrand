'use strict';

/** Детали партии/изделия без засорения item_name JSON-префиксами */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('movement_document_items', 'item_meta', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('movement_document_items', 'item_meta');
  },
};
