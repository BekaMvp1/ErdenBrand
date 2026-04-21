'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/** Числовая сетка размеров и количества по ней (доп. к матрице вариантов) */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'orders', 'size_grid_numeric', {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'orders', 'size_grid_quantities', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'size_grid_quantities');
    await queryInterface.removeColumn('orders', 'size_grid_numeric');
  },
};
