/**
 * Платёжный календарь: план/факт по неделям
 */

module.exports = (sequelize, DataTypes) => {
  const PaymentCalendar = sequelize.define(
    'PaymentCalendar',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2026,
      },
      week_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      week_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      week_end: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      subcategory: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: '',
      },
      plan: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      fact: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'payment_calendar',
      underscored: true,
      timestamps: true,
    }
  );
  return PaymentCalendar;
};
