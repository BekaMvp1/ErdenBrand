/**
 * Справочники для вкладок базы моделей (ткань, фурнитура, операции)
 */

const express = require('express');
const { QueryTypes } = require('sequelize');
const db = require('../models');

const router = express.Router();

function canMutate(req) {
  return ['admin', 'manager', 'technologist'].includes(req.user?.role);
}

const TABLES = {
  '/fabric-names': 'fabric_names',
  '/fabric-units': 'fabric_units',
  '/fittings-names': 'fittings_names',
  '/cutting-ops': 'cutting_operations',
  '/sewing-ops': 'sewing_operations',
  '/otk-ops': 'otk_operations',
};

function mountRoutes(basePath, table) {
  router.get(basePath, async (req, res, next) => {
    try {
      const rows = await db.sequelize.query(
        `SELECT id, name, created_at FROM "${table}" ORDER BY id ASC`,
        { type: QueryTypes.SELECT },
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(basePath, async (req, res, next) => {
    try {
      if (!canMutate(req)) return res.status(403).json({ error: 'Недостаточно прав' });
      const raw = req.body?.name;
      const name = raw != null ? String(raw).trim() : '';
      if (!name) return res.status(400).json({ error: 'Укажите наименование' });

      const [rows] = await db.sequelize.query(
        `INSERT INTO "${table}" (name, created_at) VALUES ($1, NOW()) RETURNING id, name, created_at`,
        { bind: [name] },
      );
      const row = rows && rows[0];
      if (!row) return res.status(500).json({ error: 'Не удалось сохранить' });
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });
}

for (const [path, table] of Object.entries(TABLES)) {
  mountRoutes(path, table);
}

/** Тип из URL → имя таблицы (DELETE /api/model-refs/:type/:id) */
const TYPE_TO_TABLE = {
  'fabric-names': 'fabric_names',
  'fabric-units': 'fabric_units',
  'fittings-names': 'fittings_names',
  'cutting-ops': 'cutting_operations',
  'sewing-ops': 'sewing_operations',
  'otk-ops': 'otk_operations',
};

router.delete('/:type/:id', async (req, res, next) => {
  try {
    if (!canMutate(req)) return res.status(403).json({ error: 'Недостаточно прав' });
    const { type, id } = req.params;
    const table = TYPE_TO_TABLE[type];
    if (!table) return res.status(404).json({ error: 'Not found' });
    const numId = parseInt(id, 10);
    if (!Number.isFinite(numId) || numId < 1) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const [rows] = await db.sequelize.query(
      `DELETE FROM "${table}" WHERE id = $1 RETURNING id`,
      { bind: [numId] },
    );
    const deleted = rows && rows[0];
    if (!deleted) return res.status(404).json({ error: 'Не найдено' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
