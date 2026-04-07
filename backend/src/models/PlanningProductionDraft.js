/**
 * Черновик таблицы «Планирование производства» (PlanningDraft)
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningProductionDraft = sequelize.define(
    'PlanningProductionDraft',
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
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: 'planning_production_drafts',
      timestamps: true,
      underscored: true,
    }
  );
  return PlanningProductionDraft;
};
