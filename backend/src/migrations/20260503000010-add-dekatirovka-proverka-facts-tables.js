'use strict';

/** Таблицы фактов этапов «Декатировка» и «Проверка» по заказу и календарному месяцу. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dekatirovka_facts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      month_key: { type: Sequelize.STRING(7), allowNull: false },
      actual_qty: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'not_started',
      },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('dekatirovka_facts', ['order_id', 'month_key'], {
      unique: true,
      name: 'dekatirovka_facts_order_month_uidx',
    });
    await queryInterface.addIndex('dekatirovka_facts', ['month_key'], { name: 'idx_dekatirovka_facts_month_key' });

    await queryInterface.createTable('proverka_facts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      month_key: { type: Sequelize.STRING(7), allowNull: false },
      actual_qty: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'not_started',
      },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('proverka_facts', ['order_id', 'month_key'], {
      unique: true,
      name: 'proverka_facts_order_month_uidx',
    });
    await queryInterface.addIndex('proverka_facts', ['month_key'], { name: 'idx_proverka_facts_month_key' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('proverka_facts');
    await queryInterface.dropTable('dekatirovka_facts');
  },
};
