'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shipments_new', {
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
      client: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      shipment_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      destination: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      carrier: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      tracking: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      rows: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      total_quantity: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'shipped',
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
    await queryInterface.dropTable('shipments_new');
  },
};
