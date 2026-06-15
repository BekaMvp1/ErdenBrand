/**
 * Отчёты раскроя
 */

module.exports = (sequelize, DataTypes) => {
  const CuttingReport = sequelize.define(
    'CuttingReport',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: DataTypes.INTEGER,
      order_number: DataTypes.STRING,
      date: DataTypes.DATEONLY,
      executor: DataTypes.STRING,
      plan: DataTypes.INTEGER,
      fact: DataTypes.INTEGER,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'in_progress',
      },
      note: DataTypes.TEXT,
    },
    { tableName: 'cutting_reports' }
  );
  return CuttingReport;
};
