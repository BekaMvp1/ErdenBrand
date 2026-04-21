'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: справочник цехов
 * Наш цех (4 этажа), Аутсорс (1), Аксы (1)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('workshops', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      floors_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    const existingWorkshops = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS cnt FROM workshops',
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (existingWorkshops.length && Number(existingWorkshops[0].cnt) > 0) {
      return;
    }

    await bulkInsertIfCountZero(queryInterface, 'workshops', [
      { name: 'Наш цех', floors_count: 4, is_active: true, created_at: new Date(), updated_at: new Date() },
      { name: 'Аутсорс', floors_count: 1, is_active: true, created_at: new Date(), updated_at: new Date() },
      { name: 'Аксы', floors_count: 1, is_active: true, created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workshops');
  },
};
