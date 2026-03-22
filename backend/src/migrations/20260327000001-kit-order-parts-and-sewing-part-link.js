'use strict';

/**
 * Комплекты: план по частям, статус части; связь партии пошива с частью заказа.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('order_parts', 'planned_quantity', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'План по части; для комплекта = кол-во комплектов (как у заказа)',
    });
    await queryInterface.addColumn('order_parts', 'status', {
      type: Sequelize.STRING(32),
      allowNull: true,
      defaultValue: 'planned',
      comment: 'planned | in_progress | done',
    });

    await queryInterface.addColumn('sewing_batches', 'order_part_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'order_parts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('sewing_batches', ['order_part_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sewing_batches', 'order_part_id');
    await queryInterface.removeColumn('order_parts', 'status');
    await queryInterface.removeColumn('order_parts', 'planned_quantity');
  },
};
