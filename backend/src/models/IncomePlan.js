/**
 * Плановое поступление денежных средств
 */

module.exports = (sequelize, DataTypes) => {
  const IncomePlan = sequelize.define(
    'IncomePlan',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      article: DataTypes.STRING,
      client: DataTypes.STRING,
      note: DataTypes.TEXT,
      total_amount: DataTypes.DECIMAL(12, 2),
      dates: DataTypes.JSONB,
      status: {
        type: DataTypes.STRING,
        defaultValue: 'planned',
      },
    },
    {
      tableName: 'income_plans',
      underscored: true,
      timestamps: true,
    }
  );
  return IncomePlan;
};
