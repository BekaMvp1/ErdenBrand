/**
 * Перенос данных из одной PostgreSQL (например Render) в другую (например Neon).
 *
 * DDL для TARGET строится из information_schema на SOURCE; одиночный PK integer/bigint
 * задаётся как SERIAL/BIGSERIAL (без ссылок на внешние sequence в DEFAULT).
 * Отдельно sequence не копируются. Данные — INSERT пакетами.
 *
 * Запуск (из каталога backend):
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." node scripts/migrate-to-neon.js
 */

'use strict';

const { Client } = require('pg');
const { parsePostgresUrl } = require('../src/utils/parseDatabaseUrl');

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function relclassToTableName(regclassText) {
  const s = String(regclassText || '').trim();
  const last = s.includes('.') ? s.split('.').pop() : s;
  return last.replace(/^"(.+)"$/, '$1');
}

function sslOption(connectionString) {
  const s = String(connectionString || '').toLowerCase();
  if (s.includes('localhost') || s.includes('127.0.0.1')) return undefined;
  return { rejectUnauthorized: false };
}

function newClient(connectionString) {
  return new Client({
    connectionString,
    ssl: sslOption(connectionString),
  });
}

async function ensureEnumTypes(source, target) {
  const { rows } = await source.query(`
    SELECT t.typname::text AS typname,
           array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
    GROUP BY t.typname
  `);
  for (const r of rows) {
    const labels = Array.isArray(r.labels)
      ? r.labels
      : r.labels
        ? Object.values(r.labels)
        : [];
    const literals = labels.map(
      (l) => `'${String(l).replace(/'/g, "''")}'`,
    );
    if (!literals.length) continue;
    const tq = quoteIdent(r.typname);
    const createSql = `CREATE TYPE public.${tq} AS ENUM (${literals.join(', ')});`;
    try {
      await target.query(createSql);
    } catch (e) {
      if (e.code !== '42710') {
        console.warn(`[migrate-to-neon] ENUM ${r.typname}: ${e.message}`);
      }
    }
  }
}

async function listPublicTables(client) {
  const { rows } = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return rows.map((x) => x.tablename);
}

async function listForeignKeyEdges(client, tableSet) {
  const { rows } = await client.query(`
    SELECT
      cl_parent.relname AS parent_table,
      cl_child.relname AS child_table
    FROM pg_constraint con
    JOIN pg_class cl_child ON con.conrelid = cl_child.oid
    JOIN pg_namespace ns_child ON cl_child.relnamespace = ns_child.oid
    JOIN pg_class cl_parent ON con.confrelid = cl_parent.oid
    JOIN pg_namespace ns_parent ON cl_parent.relnamespace = ns_parent.oid
    WHERE con.contype = 'f'
      AND ns_child.nspname = 'public'
      AND ns_parent.nspname = 'public'
  `);
  return rows.filter(
    (r) => tableSet.has(r.parent_table) && tableSet.has(r.child_table),
  );
}

function sortTablesForInsert(tables, edges) {
  const tableSet = new Set(tables);
  const adj = new Map();
  const indegree = new Map();
  for (const t of tables) {
    indegree.set(t, 0);
    adj.set(t, []);
  }
  for (const { parent_table: parent, child_table: child } of edges) {
    if (!tableSet.has(parent) || !tableSet.has(child)) continue;
    adj.get(parent).push(child);
    indegree.set(child, (indegree.get(child) || 0) + 1);
  }
  const queue = tables
    .filter((t) => indegree.get(t) === 0)
    .sort((a, b) => a.localeCompare(b));
  const result = [];
  while (queue.length) {
    const t = queue.shift();
    result.push(t);
    for (const child of adj.get(t) || []) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const seen = new Set(result);
  const cyclic = tables.filter((t) => !seen.has(t));
  if (cyclic.length) {
    console.warn(
      '[migrate-to-neon] Циклические/неразрешимые FK, порядок для:',
      cyclic.join(', '),
    );
    for (const t of cyclic) result.push(t);
  }
  return result;
}

/** Тип элемента массива по имени udt (например _int4 → integer). */
function arrayElementSqlType(udtName) {
  const u = String(udtName || '');
  const base = u.startsWith('_') ? u.slice(1) : u;
  const map = {
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    float4: 'real',
    float8: 'double precision',
    bool: 'boolean',
    text: 'text',
    varchar: 'character varying',
    varchar2: 'character varying',
    bpchar: 'character',
    timestamp: 'timestamp without time zone',
    timestamptz: 'timestamp with time zone',
    date: 'date',
    time: 'time without time zone',
    timetz: 'time with time zone',
    uuid: 'uuid',
    json: 'json',
    jsonb: 'jsonb',
    numeric: 'numeric',
  };
  return map[base] || base;
}

/**
 * SQL-тип колонки по строке information_schema.columns (без SERIAL — отдельно).
 */
function sqlDataTypeFromInformationSchema(col) {
  const dt = col.data_type;
  const udt = col.udt_name;
  const len = col.character_maximum_length;
  const prec = col.numeric_precision;
  const scale = col.numeric_scale;

  if (dt === 'USER-DEFINED') {
    return `public.${quoteIdent(udt)}`;
  }
  if (dt === 'ARRAY') {
    const el = arrayElementSqlType(udt);
    return `${el}[]`;
  }
  if (dt === 'character varying' && len != null) {
    return `character varying(${len})`;
  }
  if (dt === 'character varying') return 'character varying';
  if (dt === 'character' && len != null) return `character(${len})`;
  if (dt === 'numeric' && prec != null) {
    return scale != null ? `numeric(${prec},${scale})` : `numeric(${prec})`;
  }
  if (dt === 'double precision') return 'double precision';
  if (dt === 'timestamp without time zone') return 'timestamp without time zone';
  if (dt === 'timestamp with time zone') return 'timestamp with time zone';
  if (dt === 'time without time zone') return 'time without time zone';
  if (dt === 'time with time zone') return 'time with time zone';
  if (dt === 'interval') return 'interval';
  if (dt === 'bytea') return 'bytea';
  return dt;
}

async function getPrimaryKeyColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT kc.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kc
      ON tc.constraint_schema = kc.constraint_schema
      AND tc.constraint_name = kc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kc.ordinal_position
  `,
    [tableName],
  );
  return rows.map((r) => r.column_name);
}

async function getInformationSchemaColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT
      column_name,
      ordinal_position,
      data_type,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default,
      is_identity,
      identity_generation,
      is_generated,
      generation_expression
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [tableName],
  );
  return rows;
}

/** Ограничения p/u/c с SOURCE (FK отдельно). */
async function getNonFkConstraints(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT conname, contype, pg_get_constraintdef(oid, true) AS def
    FROM pg_constraint
    WHERE conrelid = ('public.' || quote_ident($1))::regclass
      AND contype IN ('p', 'u', 'c')
  `,
    [tableName],
  );
  return rows;
}

/**
 * CREATE TABLE IF NOT EXISTS из information_schema + SERIAL/BIGSERIAL для одиночного PK integer/bigint.
 */
async function buildCreateTableFromInformationSchema(client, tableName) {
  const pkCols = await getPrimaryKeyColumns(client, tableName);
  const cols = await getInformationSchemaColumns(client, tableName);
  const constraints = await getNonFkConstraints(client, tableName);

  const singlePkSerial =
    pkCols.length === 1 &&
    cols.some(
      (c) =>
        c.column_name === pkCols[0] &&
        (c.data_type === 'integer' || c.udt_name === 'int4'),
    );
  const singlePkBigserial =
    pkCols.length === 1 &&
    cols.some(
      (c) =>
        c.column_name === pkCols[0] &&
        (c.data_type === 'bigint' || c.udt_name === 'int8'),
    );

  const lines = [];
  const qi = quoteIdent;

  for (const c of cols) {
    const cn = c.column_name;
    const gen = String(c.is_generated || 'NEVER');
    const genExpr = c.generation_expression;

    if (gen === 'ALWAYS' && genExpr) {
      const base = sqlDataTypeFromInformationSchema(c);
      let line = `${qi(cn)} ${base} GENERATED ALWAYS AS (${genExpr}) STORED`;
      if (c.is_nullable === 'NO') line += ' NOT NULL';
      lines.push(line);
      continue;
    }

    if (singlePkSerial && cn === pkCols[0]) {
      lines.push(`${qi(cn)} SERIAL PRIMARY KEY`);
      continue;
    }
    if (singlePkBigserial && cn === pkCols[0]) {
      lines.push(`${qi(cn)} BIGSERIAL PRIMARY KEY`);
      continue;
    }

    let line = `${qi(cn)} ${sqlDataTypeFromInformationSchema(c)}`;

    if (c.is_identity === 'YES') {
      const ig = String(c.identity_generation || 'BY DEFAULT').toUpperCase();
      line +=
        ig === 'ALWAYS'
          ? ' GENERATED ALWAYS AS IDENTITY'
          : ' GENERATED BY DEFAULT AS IDENTITY';
    } else {
      const def = c.column_default;
      const isNextval =
        def && typeof def === 'string' && /nextval\s*\(/i.test(def);
      if (def && String(def).trim() && !isNextval) {
        line += ` DEFAULT ${def}`;
      }
    }
    if (c.is_nullable === 'NO') line += ' NOT NULL';

    lines.push(line);
  }

  for (const con of constraints) {
    if (con.contype === 'p') {
      if (singlePkSerial || singlePkBigserial) continue;
      lines.push(`CONSTRAINT ${qi(con.conname)} ${con.def}`);
    } else if (con.contype === 'u' || con.contype === 'c') {
      lines.push(`CONSTRAINT ${qi(con.conname)} ${con.def}`);
    }
  }

  const tq = qi(tableName);
  return `CREATE TABLE IF NOT EXISTS public.${tq} (\n  ${lines.join(',\n  ')}\n);`;
}

async function listForeignKeyAlterSql(client) {
  const { rows } = await client.query(`
    SELECT
      con.conname,
      con.conrelid::regclass::text AS child_q,
      pg_get_constraintdef(con.oid, true) AS def
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON cl.relnamespace = ns.oid
    WHERE con.contype = 'f' AND ns.nspname = 'public'
  `);
  return rows.map((r) => ({
    relname: r.child_q,
    name: r.conname,
    sql: `ALTER TABLE IF EXISTS ${r.child_q} ADD CONSTRAINT ${quoteIdent(r.conname)} ${r.def};`,
  }));
}

async function foreignKeyExists(target, childRegclassText, conname) {
  const { rows } = await target.query(
    `
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = $2 AND cl.oid = $1::regclass
    LIMIT 1
  `,
    [childRegclassText, conname],
  );
  return rows.length > 0;
}

async function applyForeignKeys(target, statements) {
  for (const { name, relname, sql } of statements) {
    if (await foreignKeyExists(target, relname, name)) continue;
    try {
      await target.query(sql);
    } catch (e) {
      console.warn(`[migrate-to-neon] FK ${name}: ${e.message}`);
    }
  }
}

async function tableHasIdentityColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 AND is_identity = 'YES'
    LIMIT 1
  `,
    [tableName],
  );
  return rows.length > 0;
}

async function getInsertableColumnNames(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
      AND COALESCE(is_generated, 'NEVER') = 'NEVER'
    ORDER BY ordinal_position
  `,
    [tableName],
  );
  return rows.map((r) => r.column_name);
}

async function copyTableData(source, target, tableName, batchSize = 300) {
  const tq = quoteIdent(tableName);
  const insertable = await getInsertableColumnNames(source, tableName);
  const { rows } = await source.query(`SELECT * FROM public.${tq}`);
  if (!rows.length) return 0;

  const cols = insertable.filter((c) =>
    Object.prototype.hasOwnProperty.call(rows[0], c),
  );
  if (!cols.length) return 0;

  const colList = cols.map(quoteIdent).join(', ');
  const overriding = (await tableHasIdentityColumns(source, tableName))
    ? ' OVERRIDING SYSTEM VALUE'
    : '';

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders = [];
    const flat = [];
    let p = 1;
    for (const row of chunk) {
      placeholders.push(`(${cols.map(() => `$${p++}`).join(', ')})`);
      for (const c of cols) flat.push(row[c]);
    }
    const sql = `INSERT INTO public.${tq} (${colList})${overriding} VALUES ${placeholders.join(', ')}`;
    await target.query(sql, flat);
    inserted += chunk.length;
  }
  return inserted;
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceUrl || !String(sourceUrl).trim()) {
    console.error('Задайте SOURCE_DATABASE_URL.');
    process.exit(1);
  }
  if (!targetUrl || !String(targetUrl).trim()) {
    console.error('Задайте TARGET_DATABASE_URL.');
    process.exit(1);
  }

  try {
    parsePostgresUrl(sourceUrl);
    parsePostgresUrl(targetUrl);
  } catch (e) {
    console.error('Некорректный URL:', e.message);
    process.exit(1);
  }

  const source = newClient(sourceUrl);
  const target = newClient(targetUrl);

  await source.connect();
  await target.connect();
  console.log('Подключено к SOURCE и TARGET.');

  const tables = await listPublicTables(source);
  if (!tables.length) {
    console.log('В public нет таблиц.');
    await source.end();
    await target.end();
    return;
  }

  const tableSet = new Set(tables);
  const fkEdges = await listForeignKeyEdges(source, tableSet);
  const insertOrder = sortTablesForInsert(tables, fkEdges);

  await ensureEnumTypes(source, target);

  const skippedTables = new Set();
  let tablesCreated = 0;

  for (const t of tables) {
    process.stdout.write(`Создание таблицы ${t}...\n`);
    try {
      const ddl = await buildCreateTableFromInformationSchema(source, t);
      await target.query(ddl);
      tablesCreated += 1;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/does not exist/i.test(msg)) {
        skippedTables.add(t);
        console.warn(`WARN: пропущена таблица ${t} - ${msg}`);
        continue;
      }
      throw e;
    }
  }

  const fkStatements = (await listForeignKeyAlterSql(source)).filter(
    (st) => !skippedTables.has(relclassToTableName(st.relname)),
  );
  await applyForeignKeys(target, fkStatements);

  let totalRows = 0;
  let tablesCopied = 0;

  for (const t of insertOrder) {
    if (skippedTables.has(t)) {
      console.warn(
        `WARN: пропущена таблица ${t} - копирование данных не выполнено (таблица не создана на TARGET)`,
      );
      continue;
    }
    const n = await copyTableData(source, target, t);
    totalRows += n;
    tablesCopied += 1;
    console.log(`Копирование таблицы ${t}... ${n} строк перенесено`);
  }

  await source.end();
  await target.end();

  console.log('');
  console.log('Итог:');
  console.log(`  Таблиц создано (DDL): ${tablesCreated}`);
  if (skippedTables.size) {
    console.log(`  Пропущено таблиц (ошибка DDL): ${skippedTables.size}`);
    console.log(`    → ${[...skippedTables].sort().join(', ')}`);
  }
  console.log(`  Таблиц с копированием данных: ${tablesCopied}`);
  console.log(`  Строк перенесено всего: ${totalRows}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
