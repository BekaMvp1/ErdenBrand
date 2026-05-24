/**
 * Точка входа сервера
 */

const http = require('http');
const https = require('https');
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

/** Длинные JSON в item_name (партии раскрой→пошив) — VARCHAR(255) ломает загрузку/проведение */
async function fixMovementTables() {
  const { sequelize } = db;
  const alters = [
    {
      label: 'movement_document_items.item_name → TEXT',
      sql: `
        ALTER TABLE movement_document_items
        ALTER COLUMN item_name TYPE TEXT USING item_name::text;
      `,
    },
    {
      label: 'warehouse_movements.item_name → TEXT',
      sql: `
        ALTER TABLE warehouse_movements
        ALTER COLUMN item_name TYPE TEXT USING item_name::text;
      `,
    },
  ];
  for (const { label, sql } of alters) {
    try {
      await sequelize.query(sql);
      console.log(`[DB] ${label}`);
    } catch (err) {
      const msg = err.parent?.message || err.message || '';
      if (/does not exist|Undefined table|relation.*does not exist/i.test(msg)) {
        console.log(`[DB] ${label} skip (таблица/колонка):`, msg);
      } else {
        console.log(`[DB] ${label} skip:`, msg);
      }
    }
  }
}

/** Старые строки с JSON в item_name — правка через прямой SQL при старте */
async function fixOldMovementItems() {
  try {
    const { sequelize } = db;

    const [rows] = await sequelize.query(`
      SELECT id, item_name
      FROM movement_document_items
      WHERE item_name LIKE 'CUT_SEW_BATCH_JSON:%'
         OR item_name LIKE 'SEW_OTK_JSON:%'
    `);

    console.log(`[fixItems] Найдено проблемных записей: ${rows.length}`);

    for (const row of rows) {
      let newName = '';
      try {
        let raw = row.item_name;
        if (raw.startsWith('CUT_SEW_BATCH_JSON:')) {
          raw = raw.replace('CUT_SEW_BATCH_JSON:', '');
          const json = JSON.parse(raw);
          newName = json.fabric_name || json.material_name || 'Ткань';
        } else if (raw.startsWith('SEW_OTK_JSON:')) {
          raw = raw.replace('SEW_OTK_JSON:', '');
          const json = JSON.parse(raw);
          newName = json.model_name || json.material_name || 'Изделие';
        }

        if (newName) {
          const safe = newName.replace(/'/g, "''");
          await sequelize.query(`
            UPDATE movement_document_items
            SET item_name = '${safe}'
            WHERE id = ${row.id}
          `);
          console.log(`[fixItems] ID ${row.id}: "${newName}"`);
        }
      } catch (parseErr) {
        console.error(`[fixItems] ID ${row.id} parse error:`, parseErr.message);
        await sequelize.query(`
          UPDATE movement_document_items
          SET item_name = 'Материал'
          WHERE id = ${row.id}
        `);
      }
    }

    console.log('[fixItems] Готово');
  } catch (err) {
    console.error('[fixItems] ОШИБКА:', err.message);
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

const SEWING_ACCESSORIES_WAREHOUSE_NAME = 'Склад фурнитуры пошива';

async function addModelsBaseIndexes() {
  try {
    const { sequelize } = db;
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_models_base_name
      ON models_base(name);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_models_base_code
      ON models_base(code);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_models_base_created
      ON models_base(created_at DESC);
    `);
    console.log('[DB] Индексы models_base проверены');
  } catch (e) {
    console.error('[addModelsBaseIndexes]:', e.message);
  }
}

async function createDefaultWarehouses() {
  try {
    const needed = [{ name: SEWING_ACCESSORIES_WAREHOUSE_NAME }];
    for (const w of needed) {
      const exists = await db.WarehouseRef.findOne({ where: { name: w.name } });
      if (!exists) {
        await db.WarehouseRef.create(w);
        console.log(`[DB] Создан склад: ${w.name}`);
      }
    }
  } catch (e) {
    console.error('[createWarehouses]:', e.message);
  }
}

// ═══ KEEPALIVE — не даём Railway засыпать ═══
function startKeepalive() {
  const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.BACKEND_URL || 'http://localhost:3001';

  setInterval(() => {
    try {
      const url = new URL(`${BACKEND_URL}/api/health`);
      const client = url.protocol === 'https:' ? https : http;
      client
        .get(url.toString(), (res) => {
          console.log(
            `[keepalive] ping ${res.statusCode} ` +
              new Date().toLocaleTimeString('ru-RU')
          );
        })
        .on('error', () => {});
    } catch {}
  }, 4 * 60 * 1000);
}
// ════════════════════════════════════════════

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Подключение к БД успешно');
    await fixOldMovementItems();
    await fixWarehouseMaterialsTable();
    await fixMovementTables();
    await createDefaultWarehouses();
    await addModelsBaseIndexes();
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
  startKeepalive();
}

start();
