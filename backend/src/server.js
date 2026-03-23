/**
 * Точка входа сервера
 */

const { execSync } = require('child_process');
const app = require('./app');
const db = require('./models');

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Подключение к БД успешно');
  } catch (err) {
    const pg = err.parent || err.original;
    const pgMsg = String(pg?.message || err.message || '');
    const code = pg?.code || err.parent?.code;
    console.error('Ошибка подключения к БД:', err.message);
    if (pg?.message && pg.message !== err.message) {
      console.error('PostgreSQL:', pg.message);
    }
    if (code) {
      console.error('Код:', code, code === '28P01' ? '(неверный пароль / пользователь)' : '');
    }

    const isAuth =
      code === '28P01' ||
      /password authentication failed/i.test(pgMsg) ||
      /не прошёл проверку подлинности/i.test(pgMsg) ||
      /authentication failed/i.test(pgMsg);

    if (isAuth) {
      console.error(`
>>> Не подходит логин/пароль в DATABASE_URL (PostgreSQL отклонил вход).
    Откройте backend/.env и укажите пароль пользователя postgres — тот же, что в pgAdmin или при установке PostgreSQL.
    Формат:
      DATABASE_URL=postgresql://postgres:ПАРОЛЬ@localhost:5432/sewing_production
    Если в пароле есть символы @ : / ? # & % + — закодируйте пароль (например в Node: encodeURIComponent('ваш_пароль')) и подставьте в URL.
`);
    } else {
      console.error(
        'Проверьте: служба PostgreSQL запущена, порт 5432, база sewing_production создана, в backend/.env верный DATABASE_URL.'
      );
    }
    process.exit(1);
  }

  // Автоматический запуск сидеров при первом запуске (если нет админа)
  if (process.env.AUTO_SEED !== 'false') {
    try {
      const [rows] = await db.sequelize.query(
        "SELECT COUNT(*) as count FROM users WHERE email = 'admin@factory.local'"
      );
      const count = rows?.[0]?.count ?? 0;
      if (parseInt(count, 10) === 0) {
        console.log('Запуск сидеров...');
        execSync('npx sequelize-cli db:seed:all', {
          stdio: 'inherit',
          cwd: __dirname + '/..',
        });
        console.log('Сидеры выполнены');
      }
    } catch (err) {
      console.warn('Сидеры:', err.message);
    }
  }

  if (process.env.SYNC_TO_CLOUD === 'true' && process.env.CLOUD_DATABASE_URL) {
    const { startSyncWorker } = require('./services/cloudSync');
    startSyncWorker();
  }

  const PORT = process.env.PORT || 10000;

  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

start();
