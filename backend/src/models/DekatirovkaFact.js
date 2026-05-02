module.exports = (sequelize, DataTypes) => {
  const DekatirovkaFact = sequelize.define(
    'DekatirovkaFact',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.INTEGER, allowNull: false },
      month_key: { type: DataTypes.STRING(7), allowNull: false },
      actual_qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'not_started' },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'dekatirovka_facts',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['order_id'] }, { fields: ['month_key'] }],
    }
  );
  return DekatirovkaFact;
};
