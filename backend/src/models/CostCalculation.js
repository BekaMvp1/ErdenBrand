/**
 * Себестоимость по заказу (раскрой / пошив / ОТК)
 */

module.exports = (sequelize, DataTypes) => {
  const CostCalculation = sequelize.define(
    'CostCalculation',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      cutting_fabric_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_fabric_sum: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_accessories_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_accessories_sum: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_output_qty: { type: DataTypes.INTEGER, defaultValue: 0 },
      cutting_op_cost_per_unit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_op_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cutting_cost_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      sewing_accessories_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      sewing_accessories_sum: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      sewing_output_qty: { type: DataTypes.INTEGER, defaultValue: 0 },
      sewing_op_cost_per_unit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      sewing_op_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      sewing_cost_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      otk_accessories_qty: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      otk_accessories_sum: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      otk_output_qty: { type: DataTypes.INTEGER, defaultValue: 0 },
      otk_op_cost_per_unit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      otk_op_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      otk_cost_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      total_cost: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      cost_per_unit: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      status: { type: DataTypes.STRING(50), defaultValue: 'draft' },
    },
    {
      tableName: 'cost_calculations',
      underscored: true,
      timestamps: true,
    }
  );
  return CostCalculation;
};
