'use strict';

/** Поля конфекционной карты в models_base */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('models_base', 'konfek_logo', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_model', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_name', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_sizes', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_collection', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_fabric', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_fittings', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('models_base', 'konfek_note', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('models_base', 'konfek_note');
    await queryInterface.removeColumn('models_base', 'konfek_fittings');
    await queryInterface.removeColumn('models_base', 'konfek_fabric');
    await queryInterface.removeColumn('models_base', 'konfek_collection');
    await queryInterface.removeColumn('models_base', 'konfek_sizes');
    await queryInterface.removeColumn('models_base', 'konfek_name');
    await queryInterface.removeColumn('models_base', 'konfek_model');
    await queryInterface.removeColumn('models_base', 'konfek_logo');
  },
};
