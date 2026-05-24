/**
 * Задачи и решения — API (фото в БД как base64)
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

const TASK_STATUSES = new Set(['new', 'in_progress', 'resolved', 'closed']);

function parseOptionalInt(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizePhotoData(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s.startsWith('data:image/')) return null;
  return s;
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.Task.findAll({
      order: [['created_at', 'DESC']],
    });
    res.json(rows.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[tasks GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      order_id,
      order_number,
      from_stage,
      to_stage,
      date_start,
      date_end,
      description,
      status,
      photo_data,
    } = req.body;

    const task = await db.Task.create({
      order_id: parseOptionalInt(order_id),
      order_number: order_number ? String(order_number).trim() : null,
      from_stage: from_stage ? String(from_stage).trim() : null,
      to_stage: to_stage ? String(to_stage).trim() : null,
      date_start: normalizeDate(date_start),
      date_end: normalizeDate(date_end),
      description: description ? String(description).trim() : null,
      status: TASK_STATUSES.has(status) ? status : 'new',
      photo_data: normalizePhotoData(photo_data),
      photo_url: null,
    });
    res.status(201).json(task.toJSON());
  } catch (err) {
    console.error('[tasks POST]:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.Task.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });

    const patch = {};
    if (req.body.status != null) {
      const st = String(req.body.status).trim();
      if (!TASK_STATUSES.has(st)) {
        return res.status(400).json({ error: 'Недопустимый статус' });
      }
      patch.status = st;
    }
    if (req.body.description !== undefined) {
      patch.description = req.body.description ? String(req.body.description).trim() : null;
    }
    if (req.body.date_end !== undefined) {
      patch.date_end = normalizeDate(req.body.date_end);
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    await row.update(patch);
    res.json(row.toJSON());
  } catch (err) {
    console.error('[tasks PUT]', err.message);
    next(err);
  }
});

module.exports = router;
