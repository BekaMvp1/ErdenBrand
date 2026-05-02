/**
 * База моделей: расширенная карточка (фото, ТЗ, лекала, табель мер, памятка)
 */

module.exports = (sequelize, DataTypes) => {
  const ModelsBase = sequelize.define(
    'ModelsBase',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: '',
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      technical_desc: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pamyatka: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      photos: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      lekala: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      tabel_mer: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: 'models_base',
      timestamps: true,
      underscored: true,
    }
  );
  return ModelsBase;
};
