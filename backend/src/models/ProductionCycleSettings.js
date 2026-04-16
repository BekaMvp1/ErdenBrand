/**
 * Настройки опережения производственного цикла (одна запись).
 */

module.exports = (sequelize, DataTypes) => {
  const ProductionCycleSettings = sequelize.define(
    'ProductionCycleSettings',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      purchase_lead_weeks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      cutting_lead_weeks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
      },
      otk_lead_weeks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      shipping_lead_weeks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: 'production_cycle_settings',
      timestamps: true,
      underscored: true,
    }
  );
  return ProductionCycleSettings;
};
