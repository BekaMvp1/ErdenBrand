'use strict';

const { safeAddIndex } = require('../utils/migrationHelpers');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_calendar', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2026,
      },
      week_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      week_start: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      week_end: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      subcategory: {
        type: Sequelize.STRING(200),
        allowNull: false,
        defaultValue: '',
      },
      plan: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      fact: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
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
    await safeAddIndex(queryInterface, 'payment_calendar', ['year', 'week_number', 'category', 'subcategory'], {
      name: 'payment_calendar_year_week_cat_sub',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_calendar');
  },
};
