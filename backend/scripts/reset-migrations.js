/**
 * Очищает таблицу SequelizeMeta (история выполненных миграций).
 *
 * Запуск из корня репозитория:
 *   node backend/scripts/reset-migrations.js
 *
 * Из каталога backend:
 *   node scripts/reset-migrations.js
 *
 * Требуется DATABASE_URL в окружении или в backend/.env
 */

'use strict';

const path = require('path');
const { Client } = require('pg');
const { parsePostgresUrl } = require('../src/utils/parseDatabaseUrl');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

function sslOption(connectionString) {
  const s = String(connectionString || '').toLowerCase();
  if (s.includes('localhost') || s.includes('127.0.0.1')) return undefined;
  return { rejectUnauthorized: false };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).trim()) {
    console.error('Задайте DATABASE_URL в окружении или в backend/.env');
    process.exit(1);
  }

  try {
    parsePostgresUrl(url);
  } catch (e) {
    console.error('Некорректный DATABASE_URL:', e.message);
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: sslOption(url),
  });

  await client.connect();
  try {
    await client.query('DELETE FROM "SequelizeMeta"');
  } finally {
    await client.end();
  }

  console.log(
    'SequelizeMeta очищена, теперь запусти: npx sequelize-cli db:migrate',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
