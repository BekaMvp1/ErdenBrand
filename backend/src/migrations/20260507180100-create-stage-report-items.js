'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stage_report_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(255), allowNull: false },
      unit: { type: Sequelize.STRING(40), allowNull: true },
      plan_qty: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      fact_qty: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      note: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('stage_report_items', {
      fields: ['report_id'],
      type: 'foreign key',
      name: 'stage_report_items_report_fk',
      references: { table: 'stage_reports', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stage_report_items');
  },
};
