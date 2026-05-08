module.exports = (sequelize, DataTypes) => {
  const WarehouseGood = sequelize.define(
    'WarehouseGood',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      article: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      photo: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      warehouse_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      qty: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      received_at: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
    },
    {
      tableName: 'warehouse_goods',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['warehouse_id'] }, { fields: ['created_at'] }],
    }
  );

  return WarehouseGood;
};
