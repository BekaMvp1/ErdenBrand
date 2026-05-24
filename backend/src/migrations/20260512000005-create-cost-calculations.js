'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cost_calculations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: Sequelize.INTEGER, allowNull: false },
      cutting_fabric_qty: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_fabric_sum: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_accessories_qty: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_accessories_sum: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_output_qty: { type: Sequelize.INTEGER, defaultValue: 0 },
      cutting_op_cost_per_unit: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_op_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cutting_cost_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      sewing_accessories_qty: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      sewing_accessories_sum: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      sewing_output_qty: { type: Sequelize.INTEGER, defaultValue: 0 },
      sewing_op_cost_per_unit: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      sewing_op_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      sewing_cost_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      otk_accessories_qty: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      otk_accessories_sum: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      otk_output_qty: { type: Sequelize.INTEGER, defaultValue: 0 },
      otk_op_cost_per_unit: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      otk_op_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      otk_cost_total: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      total_cost: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      cost_per_unit: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      status: { type: Sequelize.STRING(50), defaultValue: 'draft' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('cost_calculations', {
      fields: ['order_id'],
      type: 'foreign key',
      name: 'cost_calculations_order_id_fk',
      references: { table: 'orders', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('cost_calculations', ['order_id'], {
      unique: true,
      name: 'cost_calculations_order_id_unique',
    });

    await queryInterface.createTable('cost_calculation_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      cost_calculation_id: { type: Sequelize.INTEGER, allowNull: false },
      stage: { type: Sequelize.STRING(50), allowNull: true },
      material_type: { type: Sequelize.STRING(50), allowNull: true },
      material_name: { type: Sequelize.TEXT, allowNull: true },
      qty: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      unit: { type: Sequelize.STRING(50), allowNull: true },
      price: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      total_sum: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      note: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addConstraint('cost_calculation_items', {
      fields: ['cost_calculation_id'],
      type: 'foreign key',
      name: 'cost_calculation_items_calc_id_fk',
      references: { table: 'cost_calculations', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await queryInterface.addIndex('cost_calculation_items', ['cost_calculation_id'], {
      name: 'cost_calculation_items_calc_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cost_calculation_items');
    await queryInterface.dropTable('cost_calculations');
  },
};
