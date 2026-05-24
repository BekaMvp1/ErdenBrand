/**
 * Строки расхода себестоимости по этапу
 */

module.exports = (sequelize, DataTypes) => {
  const CostCalculationItem = sequelize.define(
    'CostCalculationItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      cost_calculation_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      stage: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      material_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      material_name: { type: DataTypes.TEXT, allowNull: true },
      qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      unit: { type: DataTypes.STRING(50), allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      total_sum: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'cost_calculation_items',
      underscored: true,
      timestamps: true,
    }
  );
  return CostCalculationItem;
};
