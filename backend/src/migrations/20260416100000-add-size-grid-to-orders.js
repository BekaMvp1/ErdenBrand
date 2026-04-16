'use strict';

/** Числовая сетка размеров и количества по ней (доп. к матрице вариантов) */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'size_grid_numeric', {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'size_grid_quantities', {
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
