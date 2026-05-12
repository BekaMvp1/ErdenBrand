'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('stage_report_items', 'supplier', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('stage_report_items', 'supplier');
  },
};
