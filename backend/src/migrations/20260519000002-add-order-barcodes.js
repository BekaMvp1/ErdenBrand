'use strict';

const { addColumnIfMissing } = require('../utils/migrationHelpers');

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'barcodes', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('orders');
    if (cols.barcodes) {
      await queryInterface.removeColumn('orders', 'barcodes');
    }
  },
};
