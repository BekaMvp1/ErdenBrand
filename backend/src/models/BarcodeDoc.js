/**
 * Документы штрихкодов для печати термоэтикеток
 */

module.exports = (sequelize, DataTypes) => {
  const BarcodeDoc = sequelize.define(
    'BarcodeDoc',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      tz: DataTypes.STRING,
      name: DataTypes.STRING,
      note: DataTypes.TEXT,
      rows: DataTypes.JSONB,
    },
    { tableName: 'barcode_docs' }
  );
  return BarcodeDoc;
};
