'use strict';

/** Черновик планирования производства (UI-таблица): JSON по пользователю и scope (цех/этаж/месяц). */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planning_production_drafts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      scope_key: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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
    await queryInterface.addIndex('planning_production_drafts', ['user_id', 'scope_key'], {
      unique: true,
      name: 'planning_production_drafts_user_scope_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('planning_production_drafts');
  },
};
