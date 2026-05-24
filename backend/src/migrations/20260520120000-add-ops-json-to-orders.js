'use strict';

/** Операции раскрой/пошив/ОТК в карточке заказа (как в базе моделей) */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cutting_ops JSONB DEFAULT '[]'::jsonb`
    );
    await q.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sewing_ops JSONB DEFAULT '[]'::jsonb`
    );
    await q.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS otk_ops JSONB DEFAULT '[]'::jsonb`
    );
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.query(`ALTER TABLE orders DROP COLUMN IF EXISTS cutting_ops`).catch(() => {});
    await q.query(`ALTER TABLE orders DROP COLUMN IF EXISTS sewing_ops`).catch(() => {});
    await q.query(`ALTER TABLE orders DROP COLUMN IF EXISTS otk_ops`).catch(() => {});
  },
};
