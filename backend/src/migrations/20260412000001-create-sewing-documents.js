'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      cutting_document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'cutting_documents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      chain_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'planning_chains', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      section_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      actual_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      floor_id: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
    await queryInterface.addIndex('sewing_documents', ['cutting_document_id'], {
      unique: true,
      name: 'sewing_documents_cutting_document_id_unique',
    });
    await queryInterface.addIndex('sewing_documents', ['order_id'], {
      name: 'sewing_documents_order_id_idx',
    });
    await queryInterface.addIndex('sewing_documents', ['week_start'], {
      name: 'sewing_documents_week_start_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_documents');
  },
};
