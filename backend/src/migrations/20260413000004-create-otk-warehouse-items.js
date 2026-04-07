'use strict';

/** Остатки готовой продукции по документам ОТК (не путать с warehouse_items — сырьё). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('otk_warehouse_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      otk_document_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'otk_documents', key: 'id' },
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
      color: { type: Sequelize.STRING(100), allowNull: true },
      size: { type: Sequelize.STRING(50), allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      shipped_qty: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'in_stock',
      },
      received_at: { type: Sequelize.DATEONLY, allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.dropTable('otk_warehouse_items');
  },
};
