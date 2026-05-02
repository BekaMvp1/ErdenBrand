'use strict';

const { addColumnIfMissing } = require('../utils/migrationHelpers');

/** Недели и статусы Декатировка/Проверка в planning_chains; опережение в production_cycle_settings. */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'production_cycle_settings', 'dekatirovka_lead_weeks', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await addColumnIfMissing(queryInterface, 'production_cycle_settings', 'proverka_lead_weeks', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addColumnIfMissing(queryInterface, 'planning_chains', 'dekatirovka_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'proverka_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'dekatirovka_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });
    await addColumnIfMissing(queryInterface, 'planning_chains', 'proverka_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.sequelize.query(`
      UPDATE planning_chains
      SET
        dekatirovka_week_start = COALESCE(dekatirovka_week_start, purchase_week_start),
        proverka_week_start = COALESCE(proverka_week_start, cutting_week_start)
      WHERE dekatirovka_week_start IS NULL OR proverka_week_start IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('planning_chains', 'proverka_status');
    await queryInterface.removeColumn('planning_chains', 'dekatirovka_status');
    await queryInterface.removeColumn('planning_chains', 'proverka_week_start');
    await queryInterface.removeColumn('planning_chains', 'dekatirovka_week_start');
    await queryInterface.removeColumn('production_cycle_settings', 'proverka_lead_weeks');
    await queryInterface.removeColumn('production_cycle_settings', 'dekatirovka_lead_weeks');
  },
};
