/**
 * Модель: Комментарий к заказу (текст + фото)
 * Используется для корректировок при раскрое и пошиве.
 */

module.exports = (sequelize, DataTypes) => {
  const OrderComment = sequelize.define('OrderComment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    author_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    photos: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
  }, {
    tableName: 'order_comments',
    timestamps: true,
    underscored: true,
  });
  return OrderComment;
};
