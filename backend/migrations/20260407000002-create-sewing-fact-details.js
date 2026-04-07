'use strict';

/** Копия для пути `backend/migrations/` (см. `.sequelizerc` — рабочие миграции в `src/migrations`). */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_fact_details', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sewing_document_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sewing_documents', key: 'id' },
        onDelete: 'CASCADE',
      },
      color: { type: Sequelize.STRING(100), allowNull: true },
      size: { type: Sequelize.STRING(50), allowNull: true },
      cutting_quantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      sewing_quantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sewing_fact_details');
  },
};
