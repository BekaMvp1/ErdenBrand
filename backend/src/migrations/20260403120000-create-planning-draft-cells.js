'use strict';

/** Дневные ячейки плана (Планирование неделя) — агрегируются в недели для месяца. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planning_draft_cells', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      scope_key: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      row_id: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      section_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      subsection_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      cell_key: {
        type: Sequelize.STRING(2),
        allowNull: false,
      },
      /** Значение ячейки (план или факт в зависимости от cell_key: pp/mp — план, pf/mf — факт) */
      cell_value: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: '',
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
    await queryInterface.addIndex('planning_draft_cells', ['user_id', 'scope_key', 'row_id', 'date', 'cell_key'], {
      unique: true,
      name: 'planning_draft_cells_user_scope_row_date_key',
    });
    await queryInterface.addIndex('planning_draft_cells', ['user_id', 'scope_key', 'date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('planning_draft_cells');
  },
};
