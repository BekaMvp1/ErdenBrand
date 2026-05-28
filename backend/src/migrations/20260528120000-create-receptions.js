'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('receptions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      order_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      order_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      reception_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      total_received: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      defect_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      defect_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      defect_note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      accepted_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'accepted',
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('receptions');
  },
};
