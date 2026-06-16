/**
 * Справочник статей финплана
 */

module.exports = (sequelize, DataTypes) => {
  const FinPlanArticle = sequelize.define(
    'FinPlanArticle',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM('revenue', 'expense'),
        allowNull: false,
      },
      source: {
        type: DataTypes.ENUM('manual', 'planned_income', 'planned_expense'),
        allowNull: false,
        defaultValue: 'manual',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      linked_article_name: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      tableName: 'fin_plan_articles',
      underscored: true,
      timestamps: true,
    }
  );
  return FinPlanArticle;
};
