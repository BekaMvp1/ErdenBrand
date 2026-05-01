/**
 * Справочник моделей изделий (наименование)
 */

module.exports = (sequelize, DataTypes) => {
  const ProductModel = sequelize.define(
    'ProductModel',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
    },
    {
      tableName: 'models',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['created_at'] },
      ],
    }
  );
  return ProductModel;
};
