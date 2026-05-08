module.exports = (sequelize, DataTypes) => {
  const StageReport = sequelize.define(
    'StageReport',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      doc_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      stage: { type: DataTypes.ENUM('purchase', 'cutting', 'sewing', 'otk', 'shipment'), allowNull: false },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      workshop_id: { type: DataTypes.INTEGER, allowNull: true },
      period_start: { type: DataTypes.DATEONLY, allowNull: true },
      period_end: { type: DataTypes.DATEONLY, allowNull: true },
      status: { type: DataTypes.ENUM('draft', 'approved'), allowNull: false, defaultValue: 'draft' },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'stage_reports',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );
  return StageReport;
};
