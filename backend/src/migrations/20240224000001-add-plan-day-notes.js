'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: примечания к плану по дню (когда факт не совпадает с планом)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('production_plan_day');
    if (!cols.notes) {
      await addColumnIfMissing(queryInterface, 
        'production_plan_day',
        'notes',
        {
          type: Sequelize.TEXT,
          allowNull: true,
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('production_plan_day', 'notes');
  },
};
