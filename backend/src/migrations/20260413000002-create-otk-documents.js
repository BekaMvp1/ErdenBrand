'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('otk_documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sewing_document_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'sewing_documents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      cutting_document_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'cutting_documents', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      section_id: { type: Sequelize.STRING(50), allowNull: true },
      floor_id: { type: Sequelize.STRING(50), allowNull: true },
      week_start: { type: Sequelize.DATEONLY, allowNull: true },
      actual_date: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.dropTable('otk_documents');
  },
};
