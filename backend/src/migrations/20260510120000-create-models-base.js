'use strict';

/** Таблица «База моделей»: карточки моделей с фото, ТЗ, лекалами, табелем мер, памяткой */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('models_base', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: Sequelize.STRING(80),
        allowNull: false,
        defaultValue: '',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      technical_desc: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      pamyatka: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      photos: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      lekala: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      tabel_mer: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('models_base', ['code'], { name: 'idx_models_base_code' });
    await queryInterface.addIndex('models_base', ['name'], { name: 'idx_models_base_name' });
    await queryInterface.addIndex('models_base', ['created_at'], { name: 'idx_models_base_created_at' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('models_base');
  },
};
