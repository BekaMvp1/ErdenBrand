'use strict';

/** Факты «Планирование месяц» вручную по неделям среза (week_index 0–3) и пользователю. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planning_month_facts', {
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
      week_slice_start: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      week_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      value: {
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
    await queryInterface.addIndex(
      'planning_month_facts',
      ['user_id', 'scope_key', 'week_slice_start', 'order_id', 'week_index'],
      {
        unique: true,
        name: 'planning_month_facts_user_scope_slice_order_week_uidx',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('planning_month_facts');
  },
};
