'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('receptions');
    if (!table.photos) {
      await queryInterface.addColumn('receptions', 'photos', {
        type: Sequelize.JSONB,
        defaultValue: [],
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('receptions');
    if (table.photos) {
      await queryInterface.removeColumn('receptions', 'photos');
    }
  },
};
