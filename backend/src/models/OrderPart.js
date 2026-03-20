/**
 * Модель: Часть заказа (при разделении комплекта)
 * Например: Пиджак → 3 этаж, Брюки → 2 этаж
 */

module.exports = (sequelize, DataTypes) => {
  const OrderPart = sequelize.define('OrderPart', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    part_name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'order_parts',
    timestamps: true,
    underscored: true,
  });
  return OrderPart;
};
