/**
 * Ручной факт по неделе в режиме «Планирование месяц» (ячейка Факт).
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningMonthFact = sequelize.define(
    'PlanningMonthFact',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      scope_key: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      week_slice_start: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      week_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      value: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'planning_month_facts',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
    }
  );
  return PlanningMonthFact;
};
