/**
 * Цепочка этапов по заказу (из планирования месяца).
 */

module.exports = (sequelize, DataTypes) => {
  const PlanningChain = sequelize.define(
    'PlanningChain',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      section_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      purchase_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      cutting_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      sewing_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      otk_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      shipping_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      purchase_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      cutting_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      sewing_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      otk_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      shipping_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      dekatirovka_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      proverka_week_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      dekatirovka_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      proverka_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
    },
    {
      tableName: 'planning_chains',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['created_at'] },
      ],
    }
  );
  return PlanningChain;
};
