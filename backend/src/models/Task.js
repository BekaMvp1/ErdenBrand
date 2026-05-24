/**
 * Задачи и решения между отделами
 */

module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define(
    'Task',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      order_number: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      from_stage: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      to_stage: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      date_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      date_end: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      photo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'new',
      },
    },
    {
      tableName: 'tasks',
      timestamps: true,
      underscored: true,
    }
  );
  return Task;
};
