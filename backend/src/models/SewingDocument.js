/** Задание на пошив из завершённого раскроя (план цеха). */

module.exports = (sequelize, DataTypes) => {
  const SewingDocument = sequelize.define(
    'SewingDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      cutting_document_id: { type: DataTypes.INTEGER, allowNull: true },
      chain_id: { type: DataTypes.INTEGER, allowNull: true },
      order_id: { type: DataTypes.INTEGER, allowNull: true },
      section_id: { type: DataTypes.STRING(50), allowNull: true },
      floor_id: { type: DataTypes.STRING(50), allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: true },
      actual_date: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'sewing_documents',
      timestamps: true,
      underscored: true,
    }
  );

  SewingDocument.associate = (models) => {
    SewingDocument.belongsTo(models.Order, { foreignKey: 'order_id' });
    SewingDocument.hasMany(models.SewingFactDetail, {
      foreignKey: 'sewing_document_id',
      as: 'sewing_facts',
    });
    SewingDocument.belongsTo(models.CuttingDocument, { foreignKey: 'cutting_document_id' });
  };

  return SewingDocument;
};
