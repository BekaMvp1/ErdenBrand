module.exports = (sequelize, DataTypes) => {
  const StageReportItem = sequelize.define(
    'StageReportItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      report_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      unit: { type: DataTypes.STRING(40), allowNull: true },
      material_type: { type: DataTypes.ENUM('fabric', 'accessories'), allowNull: true },
      warehouse_id: { type: DataTypes.INTEGER, allowNull: true },
      plan_qty: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      fact_qty: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      supplier: { type: DataTypes.STRING(255), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },
    },
    {
      tableName: 'stage_report_items',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );
  return StageReportItem;
};
