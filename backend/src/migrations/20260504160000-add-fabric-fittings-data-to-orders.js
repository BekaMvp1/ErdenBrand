'use strict';

const { addColumnIfMissing } = require('../utils/migrationHelpers');

/** JSONB: строки ткани/фурнитуры с формы создания (для блока «Закуп») */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'fabric_data', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'orders', 'fittings_data', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('orders');
    if (cols.fittings_data) {
      await queryInterface.removeColumn('orders', 'fittings_data');
    }
    if (cols.fabric_data) {
      await queryInterface.removeColumn('orders', 'fabric_data');
    }
  },
};
