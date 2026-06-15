'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('barcode_print_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      barcode_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'barcode_docs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      printed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      printed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      document_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'barcode_docs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('barcode_print_logs', ['barcode_id']);
    await queryInterface.addIndex('barcode_print_logs', ['document_id']);
    await queryInterface.addIndex('barcode_print_logs', ['printed_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('barcode_print_logs');
  },
};
