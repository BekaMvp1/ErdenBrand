/**
 * Дневные значения ячеек черновика планирования (Планирование неделя).
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningDraftCell = sequelize.define(
    'PlanningDraftCell',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      scope_key: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      row_id: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      section_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      subsection_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      cell_key: {
        type: DataTypes.STRING(2),
        allowNull: false,
      },
      cell_value: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '',
      },
    },
    {
      tableName: 'planning_draft_cells',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['created_at'] },
      ],
    }
  );
  return PlanningDraftCell;
};
