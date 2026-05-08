module.exports = (sequelize, DataTypes) => {
  const MovementDocumentItem = sequelize.define(
    'MovementDocumentItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      document_id: { type: DataTypes.INTEGER, allowNull: false },
      item_id: { type: DataTypes.INTEGER, allowNull: true },
      item_name: { type: DataTypes.STRING(255), allowNull: false },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      qty: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'movement_document_items',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );
  return MovementDocumentItem;
};
