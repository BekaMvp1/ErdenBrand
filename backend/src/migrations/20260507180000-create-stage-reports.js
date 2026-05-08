'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stage_reports', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      doc_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      stage: { type: Sequelize.ENUM('purchase', 'cutting', 'sewing', 'otk', 'shipment'), allowNull: false },
      order_id: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: true },
      workshop_id: { type: Sequelize.INTEGER, allowNull: true },
      period_start: { type: Sequelize.DATEONLY, allowNull: true },
      period_end: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.ENUM('draft', 'approved'), allowNull: false, defaultValue: 'draft' },
      comment: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('stage_reports', {
      fields: ['order_id'],
      type: 'foreign key',
      name: 'stage_reports_order_fk',
      references: { table: 'orders', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addConstraint('stage_reports', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'stage_reports_user_fk',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addConstraint('stage_reports', {
      fields: ['workshop_id'],
      type: 'foreign key',
      name: 'stage_reports_workshop_fk',
      references: { table: 'workshops', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stage_reports');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stage_reports_stage";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stage_reports_status";');
  },
};
