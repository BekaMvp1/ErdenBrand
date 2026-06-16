/**
 * Плановые и фактические суммы финплана по месяцам
 */

module.exports = (sequelize, DataTypes) => {
  const FinPlanEntry = sequelize.define(
    'FinPlanEntry',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      article_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      month: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      plan_amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      fact_amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: 'fin_plan_entries',
      underscored: true,
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['article_id', 'year', 'month'],
        },
      ],
    }
  );
  return FinPlanEntry;
};
