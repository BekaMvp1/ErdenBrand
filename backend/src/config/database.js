/**
 * Конфигурация подключения к PostgreSQL
 */

const path = require('path');
// При запуске из корня репозитория или Docker (cwd=/app) dotenv по умолчанию ищет .env в cwd, а не в backend/
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();

/** Собрать DATABASE_URL из DB_* (Railway/Neon без одной строки в UI) */
function ensureDatabaseUrlFromParts() {
  const existing = String(process.env.DATABASE_URL || '').trim();
  if (existing) return;
  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  if (!host || !name || user == null || user === '') return;
  const pass = process.env.DB_PASS || '';
  const port = process.env.DB_PORT || 5432;
  process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

ensureDatabaseUrlFromParts();

/** Некоторые платформы отдают URL под другим именем переменной */
function ensureDatabaseUrlFromAliases() {
  if (String(process.env.DATABASE_URL || '').trim()) return;
  const aliases = [
    'POSTGRES_URL',
    'RAILWAY_DATABASE_URL',
    'DATABASE_PRIVATE_URL',
    'SUPABASE_DB_URL',
  ];
  for (const key of aliases) {
    const v = String(process.env[key] || '').trim();
    if (v) {
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

ensureDatabaseUrlFromAliases();

/** Лог цели подключения (пароль не выводим — только факт наличия) */
function logDatabaseUrlTarget(label) {
  if (!process.env.DATABASE_URL) return;
  try {
    const { parsePostgresUrl } = require('../utils/parseDatabaseUrl');
    const c = parsePostgresUrl(process.env.DATABASE_URL);
    const pwd =
      c.password != null && String(c.password).length > 0 ? '(password set)' : '(password empty)';
    console.log(
      label,
      `host=${c.host} port=${c.port} database=${c.database} username=${c.username} ${pwd}`
    );
  } catch (e) {
    console.warn(`${label} DATABASE_URL не разобран:`, e.message);
  }
}

if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
  logDatabaseUrlTarget('PRODUCTION DB target:');
} else if (process.env.DATABASE_URL) {
  logDatabaseUrlTarget('DATABASE_URL (non-production):');
}

const dbUrl = process.env.DATABASE_URL || '';
const isLocalhost =
  dbUrl.includes('localhost') ||
  dbUrl.includes('127.0.0.1') ||
  /\.local(:\d+)?(\/|$)/i.test(dbUrl);

/** Явно отключить SSL (удобно для удалённого Postgres без TLS) */
const sslExplicitOff =
  String(process.env.DATABASE_SSL || process.env.DB_SSL || '')
    .toLowerCase()
    .trim() === 'false' ||
  String(process.env.DATABASE_SSL || process.env.DB_SSL || '')
    .toLowerCase()
    .trim() === '0';

const productionSsl =
  !isLocalhost &&
  !sslExplicitOff && {
    require: true,
    rejectUnauthorized: false,
  };

const poolDefaults = {
  max: parseInt(process.env.DB_POOL_MAX || '5', 10) || 5,
  min: parseInt(process.env.DB_POOL_MIN || '0', 10) || 0,
  acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10) || 30000,
  idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10) || 10000,
};

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    pool: poolDefaults,
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    pool: poolDefaults,
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    pool: poolDefaults,
    ...(productionSsl && {
      dialectOptions: {
        ssl: productionSsl,
      },
    }),
  },
};
