/**
 * Разбивка факта пошива по цвету и размеру (для предзаполнения матрицы на странице Пошив).
 */

module.exports = (sequelize, DataTypes) => {
  const SewingFactMatrix = sequelize.define(
    'SewingFactMatrix',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      floor_id: { type: DataTypes.INTEGER, allowNull: false },
      color: { type: DataTypes.STRING(80), allowNull: false },
      size: { type: DataTypes.STRING(40), allowNull: false },
      fact_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'sewing_fact_matrix', timestamps: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ], underscored: true }
  );
  return SewingFactMatrix;
};
