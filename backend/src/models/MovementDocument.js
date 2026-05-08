module.exports = (sequelize, DataTypes) => {
  const MovementDocument = sequelize.define(
    'MovementDocument',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      doc_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      doc_date: { type: DataTypes.DATEONLY, allowNull: false },
      move_type: { type: DataTypes.ENUM('goods', 'materials', 'wip'), allowNull: false },
      from_warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
      to_warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
      comment: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('draft', 'posted'), allowNull: false, defaultValue: 'draft' },
      created_by: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'movement_documents',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );
  return MovementDocument;
};
