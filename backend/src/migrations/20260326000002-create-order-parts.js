'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: части заказа (для комплектов: Пиджак → 3 этаж, Брюки → 2 этаж)
 * Используется при разделении заказа в планировании.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_parts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      part_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      sort_order: {
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
    await safeAddIndex(queryInterface, 'order_parts', ['order_id']);
    await safeAddIndex(queryInterface, 'order_parts', ['floor_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_parts');
  },
};
