'use strict';

const db = require('../src/models');

async function main() {
  const q = db.sequelize;
  await q.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cutting_ops JSONB DEFAULT '[]'::jsonb`
  );
  await q.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS sewing_ops JSONB DEFAULT '[]'::jsonb`
  );
  await q.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS otk_ops JSONB DEFAULT '[]'::jsonb`);
  console.log('OK: orders.cutting_ops, sewing_ops, otk_ops');
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => db.sequelize.close());
