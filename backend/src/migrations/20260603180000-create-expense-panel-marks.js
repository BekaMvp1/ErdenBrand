'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expense_panel_marks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      source: {
        type: Sequelize.ENUM('procurement', 'sewing', 'otk', 'planned_expense'),
        allowNull: false,
      },
      source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      is_distributed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      distributed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('expense_panel_marks', ['source', 'source_id'], {
      unique: true,
      name: 'expense_panel_marks_source_source_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('expense_panel_marks');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_expense_panel_marks_source";');
  },
};
