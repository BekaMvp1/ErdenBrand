'use strict';

/** ОТК из цепочки: chain_id + недели факта; документы отгрузки по цепочке. */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('otk_documents', 'chain_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'planning_chains', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('otk_documents', 'original_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('otk_documents', 'actual_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS otk_documents_chain_id_unique
      ON otk_documents (chain_id) WHERE chain_id IS NOT NULL
    `);

    await queryInterface.createTable('shipping_documents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      chain_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'planning_chains', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      section_id: { type: Sequelize.STRING(64), allowNull: true },
      week_start: { type: Sequelize.DATEONLY, allowNull: false },
      original_week_start: { type: Sequelize.DATEONLY, allowNull: true },
      actual_week_start: { type: Sequelize.DATEONLY, allowNull: true },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
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
    await queryInterface.addIndex('shipping_documents', ['chain_id'], {
      unique: true,
      name: 'shipping_documents_chain_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_documents');
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS otk_documents_chain_id_unique`);
    await queryInterface.removeColumn('otk_documents', 'actual_week_start');
    await queryInterface.removeColumn('otk_documents', 'original_week_start');
    await queryInterface.removeColumn('otk_documents', 'chain_id');
  },
};
