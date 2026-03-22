/**
 * Разбор DATABASE_URL для Sequelize / pg.
 * pg (SCRAM) требует, чтобы password был строкой; при разборе URI иногда приходит undefined —
 * отсюда ошибка: SASL: ... client password must be a string
 */

function parsePostgresUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('DATABASE_URL должен быть непустой строкой');
  }
  const trimmed = urlString.trim();
  // Node URL надёжнее парсит http(s); Render/Heroku часто дают postgres:// или postgresql://
  const forParser = trimmed.replace(/^postgres(ql)?:\/\//i, 'http://');
  let u;
  try {
    u = new URL(forParser);
  } catch (e) {
    throw new Error(`Некорректный DATABASE_URL: ${e.message}`);
  }

  const pathPart = (u.pathname || '').replace(/^\//, '');
  const database = (pathPart.split('/')[0] || '').split('?')[0];

  let password = u.password;
  if (password === undefined || password === null) {
    password = '';
  } else {
    try {
      password = decodeURIComponent(password);
    } catch {
      password = String(password);
    }
  }

  let username = u.username;
  if (username === undefined || username === null) {
    username = '';
  } else {
    try {
      username = decodeURIComponent(username);
    } catch {
      username = String(username);
    }
  }

  const port = u.port ? parseInt(u.port, 10) : 5432;

  return {
    host: u.hostname || 'localhost',
    port: Number.isFinite(port) ? port : 5432,
    database,
    username,
    password: String(password),
  };
}

module.exports = { parsePostgresUrl };
