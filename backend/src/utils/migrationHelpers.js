'use strict';

function isAlreadyExistsError(e) {
  const msg = String(e?.message || '');
  const code = e?.parent?.code ?? e?.original?.code;
  return (
    msg.includes('already exists') ||
    code === '42P07' ||
    code === '42710'
  );
}

async function safeAddIndex(queryInterface, tableName, attributes, options) {
  try {
    const addIdx = queryInterface.addIndex.bind(queryInterface);
    if (options !== undefined) {
      await addIdx(tableName, attributes, options);
    } else {
      await addIdx(tableName, attributes);
    }
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
}

async function safeCreateIndexQuery(queryInterface, sql) {
  try {
    await queryInterface.sequelize.query(sql);
  } catch (e) {
    if (!isAlreadyExistsError(e)) throw e;
  }
}

async function addColumnIfMissing(queryInterface, tableName, columnName, attributes, options) {
  const cols = await queryInterface.describeTable(tableName, options);
  if (!cols[columnName]) {
    await queryInterface.addColumn(tableName, columnName, attributes, options);
  }
}

async function safeAddConstraint(queryInterface, tableName, attributes, options) {
  try {
    await queryInterface.addConstraint(tableName, attributes, options);
  } catch (e) {
    if (!isAlreadyExistsError(e) && !String(e?.message || '').includes('duplicate')) throw e;
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Выполняет bulkInsert только если в таблице 0 строк (COUNT(*)=0).
 * Для сидов «один раз»; не подходит для частичных вставок — тогда обходите вручную.
 */
async function bulkInsertIfCountZero(queryInterface, tableName, rows, options) {
  const [[row]] = await queryInterface.sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ${quoteIdent(tableName)}`
  );
  const c = row?.c ?? 0;
  if (c > 0) return;
  await queryInterface.bulkInsert(tableName, rows, options);
}

module.exports = {
  isAlreadyExistsError,
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
};
