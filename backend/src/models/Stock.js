/**
 * Остаток товаров (раздел Отгрузка) — не путать с warehouse_stock
 */

module.exports = (sequelize, DataTypes) => {
  const Stock = sequelize.define(
    'Stock',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: DataTypes.INTEGER,
      order_number: DataTypes.STRING,
      order_name: DataTypes.STRING,
      client: DataTypes.STRING,
      photo: DataTypes.STRING,
      color: DataTypes.STRING,
      size: DataTypes.STRING,
      quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      source: DataTypes.STRING,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'ready',
      },
    },
    {
      tableName: 'stock',
      underscored: true,
      timestamps: true,
    }
  );
  return Stock;
};
