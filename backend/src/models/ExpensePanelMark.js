/**
 * Пометки распределения расходов в панели финансов
 */

module.exports = (sequelize, DataTypes) => {
  const ExpensePanelMark = sequelize.define(
    'ExpensePanelMark',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      source: {
        type: DataTypes.ENUM('procurement', 'sewing', 'otk', 'planned_expense'),
        allowNull: false,
      },
      source_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      is_distributed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      distributed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'expense_panel_marks',
      underscored: true,
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['source', 'source_id'],
        },
      ],
    }
  );
  return ExpensePanelMark;
};
