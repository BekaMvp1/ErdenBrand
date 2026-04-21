'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: варианты заказа (цвет + размер + количество)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_variants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      color: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      size_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sizes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await safeAddIndex(queryInterface, 'order_variants', ['order_id']);
    await safeAddIndex(queryInterface, 'order_variants', ['size_id']);
    await safeAddIndex(queryInterface, 'order_variants', ['color']);
    await safeAddIndex(queryInterface, 'order_variants', ['order_id', 'color', 'size_id'], {
      unique: true,
    });

    // Ограничение: quantity >= 0
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE order_variants ADD CONSTRAINT order_variants_quantity_check CHECK (quantity >= 0)',
      );
    } catch (e) {
      const msg = String(e?.message || '');
      const code = e?.original?.code || e?.parent?.code;
      if (/already exists/i.test(msg) || code === '42710') {
        // пропустить
      } else {
        throw e;
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE order_variants DROP CONSTRAINT IF EXISTS order_variants_quantity_check');
    await queryInterface.dropTable('order_variants');
  },
};
