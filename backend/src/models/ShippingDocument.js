/** Документ отгрузки по строке плана цеха (planning_chains). */

module.exports = (sequelize, DataTypes) => {
  const ShippingDocument = sequelize.define(
    'ShippingDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      chain_id: { type: DataTypes.INTEGER, allowNull: false },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      section_id: { type: DataTypes.STRING(64), allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: false },
      original_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      actual_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'shipping_documents',
      timestamps: true,
      underscored: true,
    }
  );
  return ShippingDocument;
};
