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
      konfek_logo: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_model: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_name: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_sizes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_collection: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_fabric: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_fittings: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      konfek_note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      fabric_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { rows: [] },
      },
      /** Плоский массив [{ name, unit, qty_per_unit, price_per_unit }] — синхронизируется с fabric_data */
      fabric: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      fittings_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { rows: [] },
      },
      /** Плоский массив [{ name, unit, qty_per_unit, price_per_unit }] — синхронизируется с fittings_data */
      accessories: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      cutting_ops: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { rows: [] },
      },
      sewing_ops: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { rows: [] },
      },
      otk_ops: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { rows: [] },
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
