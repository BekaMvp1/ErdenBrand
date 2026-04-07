'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('otk_fact_details', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      otk_document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'otk_documents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      color: { type: Sequelize.STRING(100), allowNull: true },
      size: { type: Sequelize.STRING(50), allowNull: true },
      sewing_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      otk_passed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      otk_rejected: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      reject_reason: { type: Sequelize.TEXT, allowNull: true },
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('otk_fact_details');
  },
};
