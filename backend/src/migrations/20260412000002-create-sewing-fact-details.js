'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_fact_details', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sewing_document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sewing_documents', key: 'id' },
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
      cutting_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      sewing_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('sewing_fact_details', ['sewing_document_id'], {
      name: 'sewing_fact_details_sewing_document_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_fact_details');
  },
};
