'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('tasks');
    if (!table.photo_data) {
      await queryInterface.addColumn('tasks', 'photo_data', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('tasks');
    if (table.photo_data) {
      await queryInterface.removeColumn('tasks', 'photo_data');
    }
  },
};
