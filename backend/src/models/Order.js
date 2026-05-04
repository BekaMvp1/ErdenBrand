/**
 * Модель: Заказ
 */

module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tz_code: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: '',
    },
    model_name: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: '',
    },
    model_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Ссылка на справочник моделей (размерная сетка)',
    },
    article: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    total_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    deadline: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    receipt_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Дата поступления заказа (выбирается при создании)',
    },
    status_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    building_floor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    technologist_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    planned_month: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    size_in_numbers: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    size_in_letters: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    workshop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photos: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    order_height_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'PRESET',
    },
    order_height_value: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 170,
    },
    model_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'regular',
      comment: 'regular | set — Обычная | Комплект (двойка, тройка)',
    },
    /** Размеры сетки 38–56 (дублирует выбор в UI, не заменяет OrderVariant) */
    size_grid_numeric: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true,
    },
    size_grid_quantities: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    total_fabric_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    total_accessories_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    total_cutting_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    total_sewing_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    total_otk_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    total_cost: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    /** Строки ткани с формы создания заказа */
    fabric_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    /** Строки фурнитуры с формы создания заказа */
    fittings_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
  }, {
    tableName: 'orders',
    timestamps: true,
    underscored: true,
      indexes: [
        { fields: ['created_at'] },
        { fields: ['workshop_id'] },
      ],
  });
  return Order;
};
