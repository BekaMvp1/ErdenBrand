'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cutting_documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
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
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      actual_week_start: {
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
    await queryInterface.addIndex('cutting_documents', ['chain_id'], {
      unique: true,
      name: 'cutting_documents_chain_id_unique',
    });
    await queryInterface.addIndex('cutting_documents', ['order_id'], {
      name: 'cutting_documents_order_id_idx',
    });
    await queryInterface.addIndex('cutting_documents', ['actual_week_start'], {
      name: 'cutting_documents_actual_week_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cutting_documents');
  },
};
