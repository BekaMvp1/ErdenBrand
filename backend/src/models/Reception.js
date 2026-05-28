/**
 * Приёмка товаров (брак)
 */

module.exports = (sequelize, DataTypes) => {
  const Reception = sequelize.define(
    'Reception',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: DataTypes.INTEGER,
      order_number: DataTypes.STRING,
      order_name: DataTypes.STRING,
      reception_date: DataTypes.DATEONLY,
      total_received: DataTypes.INTEGER,
      defect_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      defect_type: DataTypes.STRING,
      defect_note: DataTypes.TEXT,
      photos: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      accepted_count: DataTypes.INTEGER,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'accepted',
      },
    },
    {
      tableName: 'receptions',
      underscored: true,
      timestamps: true,
    }
  );
  return Reception;
};
