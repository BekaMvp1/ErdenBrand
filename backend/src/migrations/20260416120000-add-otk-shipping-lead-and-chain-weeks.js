'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/** ОТК и отгрузка: недели опережения в настройках цикла; даты и статусы в planning_chains. */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'production_cycle_settings', 'otk_lead_weeks', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await addColumnIfMissing(queryInterface, 'production_cycle_settings', 'shipping_lead_weeks', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addColumnIfMissing(queryInterface, 'planning_chains', 'otk_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'shipping_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'otk_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'shipping_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.sequelize.query(`
      UPDATE planning_chains
      SET
        otk_week_start = COALESCE(otk_week_start, sewing_week_start),
        shipping_week_start = COALESCE(shipping_week_start, sewing_week_start)
      WHERE otk_week_start IS NULL OR shipping_week_start IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('planning_chains', 'shipping_status');
    await queryInterface.removeColumn('planning_chains', 'otk_status');
    await queryInterface.removeColumn('planning_chains', 'shipping_week_start');
    await queryInterface.removeColumn('planning_chains', 'otk_week_start');
    await queryInterface.removeColumn('production_cycle_settings', 'shipping_lead_weeks');
    await queryInterface.removeColumn('production_cycle_settings', 'otk_lead_weeks');
  },
};
