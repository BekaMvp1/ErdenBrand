'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cutting_fact_details', {
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
      color: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      size: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('cutting_fact_details', ['cutting_document_id'], {
      name: 'cutting_fact_details_cutting_document_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cutting_fact_details');
  },
};
