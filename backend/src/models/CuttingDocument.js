/** Документ раскроя, привязанный к строке плана цеха (planning_chains). */

module.exports = (sequelize, DataTypes) => {
  const CuttingDocument = sequelize.define(
    'CuttingDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      chain_id: { type: DataTypes.INTEGER, allowNull: false },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      section_id: { type: DataTypes.STRING(64), allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      original_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      actual_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
      workshop: { type: DataTypes.STRING(50), allowNull: true },
      floor_id: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      tableName: 'cutting_documents',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
    }
  );
  return CuttingDocument;
};
