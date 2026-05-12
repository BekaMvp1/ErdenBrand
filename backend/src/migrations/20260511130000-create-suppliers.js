'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('suppliers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      contact: { type: Sequelize.STRING(255), allowNull: true },
      phone: { type: Sequelize.STRING(80), allowNull: true },
      address: { type: Sequelize.STRING(500), allowNull: true },
      note: { type: Sequelize.STRING(500), allowNull: true },
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
    await queryInterface.dropTable('suppliers');
  },
};
