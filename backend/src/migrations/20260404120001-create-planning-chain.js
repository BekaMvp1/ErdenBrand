'use strict';

/** Цепочка закуп → раскрой → пошив по заказам из планирования. section_id — ключ секции черновика (floor_4, aksy, …). */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planning_chains', {
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
      section_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      purchase_week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      cutting_week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      sewing_week_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      purchase_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      cutting_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      sewing_status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
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
    await queryInterface.addIndex('planning_chains', ['order_id', 'section_id'], {
      unique: true,
      name: 'planning_chains_order_section_unique',
    });
    await queryInterface.addIndex('planning_chains', ['sewing_week_start'], {
      name: 'planning_chains_sewing_week_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('planning_chains');
  },
};
