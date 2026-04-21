'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Таблица sewing_fact_matrix: разбивка факта пошива по цвету и размеру (для предзаполнения полей на странице Пошив).
 * Один снимок на (order_id, floor_id); при сохранении матрицы строки перезаписываются.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_fact_matrix', {
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
      floor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      color: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      size: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      fact_qty: {
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
    await safeAddIndex(queryInterface, 'sewing_fact_matrix', ['order_id', 'floor_id', 'color', 'size'], {
      unique: true,
      name: 'sewing_fact_matrix_order_floor_color_size_unique',
    });
    await safeAddIndex(queryInterface, 'sewing_fact_matrix', ['order_id']);
    await safeAddIndex(queryInterface, 'sewing_fact_matrix', ['floor_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_fact_matrix');
  },
};
