'use strict';

/**
 * Дефолт JSONB [] для fabric_data / fittings_data (как в модели Sequelize).
 * Требует существующих колонок (см. 20260504160000-add-fabric-fittings-data-to-orders).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'fabric_data', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: [],
    });
    await queryInterface.changeColumn('orders', 'fittings_data', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: [],
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'fabric_data', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.changeColumn('orders', 'fittings_data', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },
};
