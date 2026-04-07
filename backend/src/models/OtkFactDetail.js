/** Детализация ОТК по цвету/размеру (план из пошива). */

module.exports = (sequelize, DataTypes) => {
  const OtkFactDetail = sequelize.define(
    'OtkFactDetail',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      otk_document_id: { type: DataTypes.INTEGER, allowNull: false },
      color: { type: DataTypes.STRING(100), allowNull: true },
      size: { type: DataTypes.STRING(50), allowNull: true },
      sewing_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      otk_passed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      otk_rejected: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      reject_reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'otk_fact_details',
      underscored: true,
      timestamps: true,
    }
  );

  OtkFactDetail.associate = (models) => {
    OtkFactDetail.belongsTo(models.OtkDocument, { foreignKey: 'otk_document_id' });
  };

  return OtkFactDetail;
};
