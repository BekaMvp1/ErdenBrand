/**
 * Планирование расходов
 */

module.exports = (sequelize, DataTypes) => {
  const ExpensePlan = sequelize.define(
    'ExpensePlan',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      plan_date: DataTypes.DATEONLY,
      week_number: DataTypes.INTEGER,
      year: DataTypes.INTEGER,
      article: DataTypes.STRING,
      tz: DataTypes.STRING,
      supplier: DataTypes.STRING,
      employee: DataTypes.STRING,
      amount: DataTypes.DECIMAL(12, 2),
      note: DataTypes.TEXT,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'planned',
      },
    },
    {
      tableName: 'expense_plans',
      underscored: true,
      timestamps: true,
    }
  );
  return ExpensePlan;
};
