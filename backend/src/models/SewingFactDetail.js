/** Факт пошива по цвету/размеру (раскроено = план, пошито = факт). */

module.exports = (sequelize, DataTypes) => {
  const SewingFactDetail = sequelize.define(
    'SewingFactDetail',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sewing_document_id: { type: DataTypes.INTEGER, allowNull: false },
      color: { type: DataTypes.STRING(100), allowNull: true },
      size: { type: DataTypes.STRING(50), allowNull: true },
      cutting_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sewing_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'sewing_fact_details',
      timestamps: true,
      underscored: true,
    }
  );

  SewingFactDetail.associate = (models) => {
    SewingFactDetail.belongsTo(models.SewingDocument, { foreignKey: 'sewing_document_id' });
  };

  return SewingFactDetail;
};
