'use strict';

const { safeCreateIndexQuery } = require('../utils/migrationHelpers');

/** Снимок таблицы «Планирование производства» (матрица недель) — переживает обновление страницы */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planning_matrix_snapshots', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      month: {
        type: Sequelize.STRING(7),
        allowNull: false,
      },
      workshop_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'workshops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      building_floor_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      week_slice_start: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      rows_json: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      updated_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await safeCreateIndexQuery(queryInterface, `
      CREATE UNIQUE INDEX planning_matrix_snapshots_uq
      ON planning_matrix_snapshots (month, workshop_id, week_slice_start, COALESCE(building_floor_id, -1));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS planning_matrix_snapshots_uq;');
    await queryInterface.dropTable('planning_matrix_snapshots');
  },
};
