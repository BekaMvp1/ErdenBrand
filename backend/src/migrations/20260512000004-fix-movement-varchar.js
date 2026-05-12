'use strict';

/**
 * item_name хранит JSON партии (CUT_SEW_BATCH_JSON:…) — длиннее VARCHAR(255).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('movement_document_items', 'item_name', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('movement_document_items', 'item_name', {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};
