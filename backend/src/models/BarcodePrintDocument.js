/**
 * Документ печати штрихкодов (журнал)
 */

module.exports = (sequelize, DataTypes) => {
  const BarcodePrintDocument = sequelize.define(
    'BarcodePrintDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      printed_at: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('draft', 'printed'),
        allowNull: false,
        defaultValue: 'draft',
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    { tableName: 'barcode_print_documents' }
  );
  return BarcodePrintDocument;
};
