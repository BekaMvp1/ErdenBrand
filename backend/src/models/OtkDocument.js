/** Документ ОТК по строке плана цеха (после факта пошива). */

module.exports = (sequelize, DataTypes) => {
  const OtkDocument = sequelize.define(
    'OtkDocument',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      sewing_document_id: { type: DataTypes.INTEGER, allowNull: true },
      cutting_document_id: { type: DataTypes.INTEGER, allowNull: true },
      order_id: { type: DataTypes.INTEGER, allowNull: true },
      chain_id: { type: DataTypes.INTEGER, allowNull: true },
      section_id: { type: DataTypes.STRING(50), allowNull: true },
      floor_id: { type: DataTypes.STRING(50), allowNull: true },
      week_start: { type: DataTypes.DATEONLY, allowNull: true },
      original_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      actual_week_start: { type: DataTypes.DATEONLY, allowNull: true },
      actual_date: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'otk_documents',
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
      timestamps: true,
    }
  );

  OtkDocument.associate = (models) => {
    OtkDocument.belongsTo(models.PlanningChain, { foreignKey: 'chain_id' });
    OtkDocument.belongsTo(models.Order, { foreignKey: 'order_id' });
    OtkDocument.hasMany(models.OtkFactDetail, {
      foreignKey: 'otk_document_id',
      as: 'otk_facts',
    });
    OtkDocument.belongsTo(models.SewingDocument, { foreignKey: 'sewing_document_id' });
    OtkDocument.belongsTo(models.CuttingDocument, { foreignKey: 'cutting_document_id' });
  };

  return OtkDocument;
};
