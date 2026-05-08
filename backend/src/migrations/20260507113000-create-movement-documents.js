'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('movement_documents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      doc_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      doc_date: { type: Sequelize.DATEONLY, allowNull: false },
      move_type: { type: Sequelize.ENUM('goods', 'materials', 'wip'), allowNull: false },
      from_warehouse_id: { type: Sequelize.INTEGER, allowNull: false },
      to_warehouse_id: { type: Sequelize.INTEGER, allowNull: false },
      comment: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM('draft', 'posted'), allowNull: false, defaultValue: 'draft' },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('movement_documents', {
      fields: ['from_warehouse_id'],
      type: 'foreign key',
      name: 'movement_documents_from_warehouse_fk',
      references: { table: 'warehouses', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addConstraint('movement_documents', {
      fields: ['to_warehouse_id'],
      type: 'foreign key',
      name: 'movement_documents_to_warehouse_fk',
      references: { table: 'warehouses', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addConstraint('movement_documents', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'movement_documents_created_by_fk',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('movement_documents', ['doc_date']);
    await queryInterface.addIndex('movement_documents', ['move_type']);
    await queryInterface.addIndex('movement_documents', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('movement_documents');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_movement_documents_move_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_movement_documents_status";');
  },
};
