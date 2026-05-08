module.exports = (sequelize, DataTypes) => {
  const WarehouseMaterial = sequelize.define(
    'WarehouseMaterial',
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
      type: {
        type: DataTypes.ENUM('fabric', 'accessories'),
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'шт',
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
      tableName: 'warehouse_materials',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['warehouse_id'] }, { fields: ['type'] }, { fields: ['created_at'] }],
    }
  );

  return WarehouseMaterial;
};
module.exports = (sequelize, DataTypes) => {
  const WarehouseMaterial = sequelize.define(
    'WarehouseMaterial',
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
      type: {
        type: DataTypes.ENUM('fabric', 'accessories'),
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'шт',
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
      tableName: 'warehouse_materials',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['warehouse_id'] }, { fields: ['type'] }, { fields: ['created_at'] }],
    }
  );

  return WarehouseMaterial;
};
