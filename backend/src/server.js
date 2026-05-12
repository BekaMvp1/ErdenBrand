/**
 * Точка входа сервера
 */

const http = require('http');
const { execSync } = require('child_process');
const db = require('./models');
const app = require('./app');

/** Одноразовое приведение таблицы материалов (ФИФО-поля) без отдельных миграций */
async function fixWarehouseMaterialsTable() {
  try {
    const { sequelize } = db;

    await sequelize.query(`
      ALTER TABLE warehouse_materials
      ADD COLUMN IF NOT EXISTS total_sum DECIMAL(12,2) DEFAULT 0;
    `);
    await sequelize.query(`
      ALTER TABLE warehouse_materials
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT NOW();
    `);
    await sequelize.query(`
      ALTER TABLE warehouse_materials
      ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
    `);
    await sequelize.query(`
      ALTER TABLE warehouse_materials
      ADD COLUMN IF NOT EXISTS procurement_id INTEGER;
    `);

    await sequelize.query(`
      UPDATE warehouse_materials
      SET total_sum = qty * price
      WHERE total_sum IS NULL OR total_sum = 0;
    `);

    await sequelize.query(`
      UPDATE warehouse_materials
      SET received_at = created_at
      WHERE received_at IS NULL;
    `);

    console.log('[DB] warehouse_materials таблица обновлена (ФИФО поля)');
  } catch (err) {
    console.error('[DB] Ошибка обновления warehouse_materials:', err.message);
  }
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

function killPortWindows(port) {
  let result = '';
  try {
    result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  } catch {
    return;
  }
  const lines = result.trim().split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== process.pid.toString() && /^\d+$/.test(pid)) {
      try {
        execSync(`taskkill /PID ${pid} /F`);
        console.log(`Завершён процесс PID ${pid}`);
      } catch (_) {}
    }
  });
}

function killPortUnix(port) {
  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
  } catch {
    // порт свободен или нет fuser
  }
}

function bindServer(port) {
  const server = http.createServer(app);
  // Railway/Docker: слушать все интерфейсы (иначе healthcheck и прокси могут не достучаться)
  const host = process.env.BIND_HOST || '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`Сервер запущен на http://${host}:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Порт ${port} занят. Завершаю старый процесс...`);
      try {
        if (process.platform === 'win32') {
          killPortWindows(port);
        } else {
          killPortUnix(port);
        }
        setTimeout(() => {
          bindServer(port);
        }, 1000);
      } catch (killErr) {
        console.error('Не удалось освободить порт:', killErr);
        process.exit(1);
      }
    } else {
      console.error('Ошибка сервера:', err);
      process.exit(1);
    }
  });
}

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Подключение к БД успешно');
    await fixWarehouseMaterialsTable();
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

  // Railway / прод: миграции при старте (в Variables задайте AUTO_MIGRATE=true)
  const autoMigrate =
    process.env.AUTO_MIGRATE === 'true' || process.env.AUTO_MIGRATE === '1';
  if (autoMigrate) {
    try {
      console.log('Запуск миграций (npx sequelize-cli db:migrate)...');
      execSync('npx sequelize-cli db:migrate', {
        stdio: 'inherit',
        cwd: __dirname + '/..',
      });
      console.log('Миграции выполнены');
    } catch (err) {
      console.error('Migration error:', err?.message || err);
      process.exit(1);
    }
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

  // Локально — как в .env.example / vite proxy (3001). На Render/Fly PORT задаётся средой.
  const PORT = Number(process.env.PORT) || 3001;
  bindServer(PORT);
}

start();

if (process.env.NODE_ENV === 'production' && process.env.RENDER_URL) {
  const https = require('https');
  setInterval(() => {
    https
      .get(`${process.env.RENDER_URL}/api/health`, (res) => {
        console.log('[Keep-alive] ping:', res.statusCode);
      })
      .on('error', (err) => {
        console.error('[Keep-alive] ошибка:', err.message);
      });
  }, 10 * 60 * 1000);
}
