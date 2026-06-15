/**
 * Позиция документа печати штрихкодов
 */

module.exports = (sequelize, DataTypes) => {
  const BarcodePrintDocumentItem = sequelize.define(
    'BarcodePrintDocumentItem',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      /** FK → barcode_docs.id */
      barcode_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      /** Снимок строки: article, color, size, barcode, tz, row_index */
      row_meta: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    { tableName: 'barcode_print_document_items' }
  );
  return BarcodePrintDocumentItem;
};
