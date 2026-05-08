'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('stage_report_items', 'material_type', {
      type: Sequelize.ENUM('fabric', 'accessories'),
      allowNull: true,
    });
    await queryInterface.addColumn('stage_report_items', 'warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('stage_report_items', 'price', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('stage_report_items', 'price');
    await queryInterface.removeColumn('stage_report_items', 'warehouse_id');
    await queryInterface.removeColumn('stage_report_items', 'material_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stage_report_items_material_type";');
  },
};
