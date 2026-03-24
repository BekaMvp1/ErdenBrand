/**
 * Снимок матрицы планирования (недели × строки) для экрана «Планирование производства»
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningMatrixSnapshot = sequelize.define(
    'PlanningMatrixSnapshot',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      month: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },
      workshop_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      building_floor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      week_slice_start: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      rows_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      updated_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: 'planning_matrix_snapshots',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );
  return PlanningMatrixSnapshot;
};
