/**
 * Партия пошива. Создаётся при запуске пошива, закрывается при завершении/вводе факта.
 */

module.exports = (sequelize, DataTypes) => {
  const SewingBatch = sequelize.define(
    'SewingBatch',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      model_id: { type: DataTypes.INTEGER, allowNull: true },
      floor_id: { type: DataTypes.INTEGER, allowNull: true },
      order_part_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Часть комплекта (order_parts); NULL — обычный заказ без разбиения',
      },
      batch_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      date_from: { type: DataTypes.DATEONLY, allowNull: true },
      date_to: { type: DataTypes.DATEONLY, allowNull: true },
      qty: { type: DataTypes.INTEGER, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: true },
      finished_at: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.ENUM('IN_PROGRESS', 'DONE', 'READY_FOR_QC', 'QC_DONE'),
        allowNull: false,
        defaultValue: 'IN_PROGRESS',
      },
    },
    { tableName: 'sewing_batches', timestamps: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ], underscored: true }
  );
  return SewingBatch;
};
