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
    planned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'План по части; для комплекта совпадает с количеством комплектов заказа',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: 'planned',
    },
  }, {
    tableName: 'order_parts',
    timestamps: true,
    underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
  });
  return OrderPart;
};
