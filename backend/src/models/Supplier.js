module.exports = (sequelize, DataTypes) => {
  const Supplier = sequelize.define(
    'Supplier',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      contact: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(80), allowNull: true },
      address: { type: DataTypes.STRING(500), allowNull: true },
      note: { type: DataTypes.STRING(500), allowNull: true },
    },
    {
      tableName: 'suppliers',
      timestamps: true,
      underscored: true,
    }
  );
  return Supplier;
};
