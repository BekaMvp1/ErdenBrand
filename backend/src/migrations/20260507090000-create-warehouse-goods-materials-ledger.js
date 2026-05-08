'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('warehouses', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('warehouse_goods', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      article: { type: Sequelize.STRING(120), allowNull: true },
      photo: { type: Sequelize.TEXT, allowNull: true },
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      qty: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      received_at: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('warehouse_materials', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      type: { type: Sequelize.ENUM('fabric', 'accessories'), allowNull: false },
      unit: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'шт' },
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'warehouses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      qty: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      received_at: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.bulkInsert('warehouses', [
      { name: 'Основной склад', created_at: new Date(), updated_at: new Date() },
      { name: 'Склад сырья', created_at: new Date(), updated_at: new Date() },
      { name: 'Склад готовой продукции', created_at: new Date(), updated_at: new Date() },
      { name: 'Аутсорс склад', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('warehouse_materials');
    await queryInterface.dropTable('warehouse_goods');
    await queryInterface.dropTable('warehouses');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_warehouse_materials_type";');
  },
};
