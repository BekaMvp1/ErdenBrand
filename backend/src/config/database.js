/**
 * Конфигурация подключения к PostgreSQL
 */

require('dotenv').config();

if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
  try {
    const { parsePostgresUrl } = require('../utils/parseDatabaseUrl');
    const c = parsePostgresUrl(process.env.DATABASE_URL);
    console.log(
      'PRODUCTION DB target:',
      `${c.username}@${c.host}:${c.port}/${c.database}`
    );
  } catch {
    console.log('PRODUCTION: DATABASE_URL задан, но не удалось разобрать (проверьте формат)');
  }
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

module.exports = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    logging: false,
    ...(productionSsl && {
      dialectOptions: {
        ssl: productionSsl,
      },
    }),
  },
};
