/**
 * Копирует все строки orders: Render (SOURCE) → Neon (TARGET).
 * ON CONFLICT (id) DO NOTHING — уже существующие id не перезаписываются.
 *
 * Переменные окружения:
 *   SOURCE_DATABASE_URL — PostgreSQL на Render
 *   TARGET_DATABASE_URL — PostgreSQL на Neon
 *
 * Запуск из каталога backend:
 *   node scripts/migrate-orders.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Client } = require('pg');

const BATCH_SIZE = 200;

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`Задайте переменную окружения ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

function buildBatchInsert(columns, rows) {
  const colList = columns.map(quoteIdent).join(', ');
  const values = [];
  const tuples = [];
  let p = 1;
  for (const row of rows) {
    const ph = columns.map(() => `$${p++}`).join(', ');
    tuples.push(`(${ph})`);
    for (const c of columns) {
      values.push(row[c]);
    }
  }
  const text = `INSERT INTO orders (${colList}) VALUES ${tuples.join(', ')} ON CONFLICT (id) DO NOTHING`;
  return { text, values };
}

async function main() {
  const sourceUrl = requireEnv('SOURCE_DATABASE_URL');
  const targetUrl = requireEnv('TARGET_DATABASE_URL');

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  await source.connect();
  await target.connect();

  try {
    const { rows } = await source.query(
      'SELECT * FROM orders ORDER BY id ASC',
    );

    if (rows.length === 0) {
      console.log('В источнике нет строк в orders. Скопировано: 0');
      return;
    }

    const columns = Object.keys(rows[0]);
    if (!columns.includes('id')) {
      console.error('В результате SELECT * нет колонки id');
      process.exit(1);
    }

    let insertedTotal = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { text, values } = buildBatchInsert(columns, batch);
      const res = await target.query(text, values);
      insertedTotal += res.rowCount;
    }

    console.log(
      `Прочитано из источника: ${rows.length}. Вставлено новых строк (без конфликтов по id): ${insertedTotal}`,
    );
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
