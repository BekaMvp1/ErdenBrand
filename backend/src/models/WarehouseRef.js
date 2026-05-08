module.exports = (sequelize, DataTypes) => {
  const WarehouseRef = sequelize.define(
    'WarehouseRef',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: 'warehouses',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['created_at'] }],
    }
  );

  return WarehouseRef;
};
