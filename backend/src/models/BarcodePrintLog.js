/**
 * Журнал печати штрихкодов (история фактов печати)
 */

module.exports = (sequelize, DataTypes) => {
  const BarcodePrintLog = sequelize.define(
    'BarcodePrintLog',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      /** FK → barcode_docs.id (документ / позиция штрихкода) */
      barcode_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      printed_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      printed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    { tableName: 'barcode_print_logs' }
  );
  return BarcodePrintLog;
};
