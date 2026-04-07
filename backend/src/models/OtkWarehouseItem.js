/**
 * Остаток готовой продукции на складе по строке ОТК (цвет×размер).
 * Таблица otk_warehouse_items — отдельно от warehouse_items (сырьё).
 */

module.exports = (sequelize, DataTypes) => {
  const OtkWarehouseItem = sequelize.define(
    'OtkWarehouseItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      otk_document_id: { type: DataTypes.INTEGER, allowNull: true },
      order_id: { type: DataTypes.INTEGER, allowNull: true },
      section_id: { type: DataTypes.STRING(50), allowNull: true },
      color: { type: DataTypes.STRING(100), allowNull: true },
      size: { type: DataTypes.STRING(50), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      shipped_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'in_stock',
      },
      received_at: { type: DataTypes.DATEONLY, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'otk_warehouse_items',
      underscored: true,
      timestamps: true,
    }
  );

  OtkWarehouseItem.associate = (models) => {
    OtkWarehouseItem.belongsTo(models.Order, { foreignKey: 'order_id' });
    OtkWarehouseItem.belongsTo(models.OtkDocument, { foreignKey: 'otk_document_id' });
  };

  return OtkWarehouseItem;
};
