'use strict';

/** Глобальные настройки опережения закупа и раскроя (одна строка). */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('production_cycle_settings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      purchase_lead_weeks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      cutting_lead_weeks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2,
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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
    await queryInterface.bulkInsert('production_cycle_settings', [
      {
        purchase_lead_weeks: 3,
        cutting_lead_weeks: 2,
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('production_cycle_settings');
  },
};
