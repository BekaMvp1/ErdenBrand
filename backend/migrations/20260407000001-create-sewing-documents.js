'use strict';

/** Копия для пути `backend/migrations/` (см. `.sequelizerc` — рабочие миграции в `src/migrations`). */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sewing_documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      cutting_document_id: {
        type: Sequelize.INTEGER,
        references: { model: 'cutting_documents', key: 'id' },
        onDelete: 'SET NULL',
        allowNull: true,
      },
      chain_id: {
        type: Sequelize.INTEGER,
        references: { model: 'planning_chains', key: 'id' },
        allowNull: true,
      },
      order_id: {
        type: Sequelize.INTEGER,
        references: { model: 'orders', key: 'id' },
        allowNull: true,
      },
      section_id: { type: Sequelize.STRING(50), allowNull: true },
      floor_id: { type: Sequelize.STRING(50), allowNull: true },
      week_start: { type: Sequelize.DATEONLY, allowNull: true },
      actual_date: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'pending',
      },
      comment: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.dropTable('sewing_documents');
  },
};
