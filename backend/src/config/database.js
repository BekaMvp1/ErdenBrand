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
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

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
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
