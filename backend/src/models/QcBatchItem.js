/**
 * ОТК по партии и размеру.
 * good_qty = checked_qty - defect_qty. passed_qty хранит good_qty (совместимость).
 */

module.exports = (sequelize, DataTypes) => {
  const QcBatchItem = sequelize.define(
    'QcBatchItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      qc_batch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      model_size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      size_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      checked_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      passed_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
      defect_qty: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      getterMethods: {
        good_qty() {
          return Math.max(0, (parseFloat(this.passed_qty) || 0));
        },
      },
      tableName: 'qc_batch_items',
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ['qc_batch_id', 'model_size_id'] },
        { fields: ['created_at'] }
      ],
    }
  );
  return QcBatchItem;
};
