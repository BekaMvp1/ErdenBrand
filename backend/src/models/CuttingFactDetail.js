/** Детализация факта раскроя по цвету/размеру (документ из плана цеха). */

module.exports = (sequelize, DataTypes) => {
  const CuttingFactDetail = sequelize.define(
    'CuttingFactDetail',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      cutting_document_id: { type: DataTypes.INTEGER, allowNull: false },
      color: { type: DataTypes.STRING(100), allowNull: true },
      size: { type: DataTypes.STRING(50), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'cutting_fact_details',
      timestamps: true,
      underscored: true,
    }
  );
  return CuttingFactDetail;
};
