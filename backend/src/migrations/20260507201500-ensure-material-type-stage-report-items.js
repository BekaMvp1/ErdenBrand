'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'stage_report_items';
    const desc = await queryInterface.describeTable(table);
    if (!desc.material_type) {
      await queryInterface.addColumn(table, 'material_type', {
        type: Sequelize.ENUM('fabric', 'accessories'),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = 'stage_report_items';
    const desc = await queryInterface.describeTable(table);
    if (desc.material_type) {
      await queryInterface.removeColumn(table, 'material_type');
    }
  },
};
