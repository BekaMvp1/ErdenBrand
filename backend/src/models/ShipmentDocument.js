/**
 * Документ отгрузки (цвет × размер) — отдельно от warehouse Shipment
 */

module.exports = (sequelize, DataTypes) => {
  const ShipmentDocument = sequelize.define(
    'ShipmentDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: DataTypes.INTEGER,
      order_number: DataTypes.STRING,
      order_name: DataTypes.STRING,
      client: DataTypes.STRING,
      shipment_date: DataTypes.DATEONLY,
      destination: DataTypes.STRING,
      carrier: DataTypes.STRING,
      tracking: DataTypes.STRING,
      note: DataTypes.TEXT,
      shipment_type: {
        type: DataTypes.STRING,
        defaultValue: 'goods',
      },
      defect_type: DataTypes.STRING,
      defect_reason: DataTypes.TEXT,
      defect_destination: DataTypes.STRING,
      rows: DataTypes.JSONB,
      total_quantity: DataTypes.INTEGER,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'shipped',
      },
    },
    {
      tableName: 'shipments_new',
      underscored: true,
      timestamps: true,
    }
  );
  return ShipmentDocument;
};
