'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cutting_reports', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      order_id: Sequelize.INTEGER,
      order_number: Sequelize.STRING,
      date: Sequelize.DATEONLY,
      executor: Sequelize.STRING,
      plan: Sequelize.INTEGER,
      fact: Sequelize.INTEGER,
      status: {
        type: Sequelize.STRING,
        defaultValue: 'in_progress',
      },
      note: Sequelize.TEXT,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cutting_reports');
  },
};
