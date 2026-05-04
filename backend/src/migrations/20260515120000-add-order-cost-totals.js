'use strict';

/** Итоги калькуляции расходов при создании заказа */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const cols = [
      'total_fabric_cost',
      'total_accessories_cost',
      'total_cutting_cost',
      'total_sewing_cost',
      'total_otk_cost',
      'total_cost',
    ];
    for (const col of cols) {
      await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${col} NUMERIC(14, 2)`);
    }
  },

  async down(queryInterface) {
    const cols = [
      'total_fabric_cost',
      'total_accessories_cost',
      'total_cutting_cost',
      'total_sewing_cost',
      'total_otk_cost',
      'total_cost',
    ];
    for (const col of cols) {
      await queryInterface.removeColumn('orders', col).catch(() => {});
    }
  },
};
