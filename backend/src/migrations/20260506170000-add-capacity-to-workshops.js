'use strict';

const { addColumnIfMissing } = require('../utils/migrationHelpers');

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'workshops', 'capacity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('workshops');
    if (cols.capacity) {
      await queryInterface.removeColumn('workshops', 'capacity');
    }
  },
};
