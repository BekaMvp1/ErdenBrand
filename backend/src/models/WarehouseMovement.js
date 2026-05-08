/**
 * Модель: Движение по складу (приход/расход)
 */

module.exports = (sequelize, DataTypes) => {
  const WarehouseMovement = sequelize.define('WarehouseMovement', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    item_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('ПРИХОД', 'РАСХОД'),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    movement_kind: {
      type: DataTypes.ENUM('goods', 'materials', 'wip'),
      allowNull: true,
    },
    ref_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    item_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    from_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    to_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    qty: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    moved_at: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    tableName: 'warehouse_movements',
    timestamps: true,
    underscored: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
    createdAt: 'created_at',
    updatedAt: false,
  });
  return WarehouseMovement;
};
