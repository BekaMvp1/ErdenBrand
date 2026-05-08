'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('movement_document_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      document_id: { type: Sequelize.INTEGER, allowNull: false },
      item_id: { type: Sequelize.INTEGER, allowNull: true },
      item_name: { type: Sequelize.STRING(255), allowNull: false },
      unit: { type: Sequelize.STRING(30), allowNull: true },
      qty: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('movement_document_items', {
      fields: ['document_id'],
      type: 'foreign key',
      name: 'movement_document_items_document_fk',
      references: { table: 'movement_documents', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addIndex('movement_document_items', ['document_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('movement_document_items');
  },
};
