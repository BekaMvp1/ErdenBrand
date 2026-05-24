/**
 * Задачи и решения — API
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models');

const router = express.Router();

const TASK_STATUSES = new Set(['new', 'in_progress', 'resolved', 'closed']);

const uploadsDir = path.join(__dirname, '../../uploads/tasks');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname || '.jpg')}`);
  },
});
const upload = multer({ storage });

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

router.post('/', (req, res, next) => {
  upload.single('photo')(req, res, (multerErr) => {
    if (multerErr) {
      console.error('[tasks POST multer]', multerErr.message);
      return res.status(400).json({ error: multerErr.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('[tasks POST] body:', req.body);
    console.log('[tasks POST] file:', req.file);

    const photo_url = req.file ? `/uploads/tasks/${req.file.filename}` : null;
    const task = await db.Task.create({
      order_id: parseOptionalInt(req.body.order_id),
      order_number: req.body.order_number ? String(req.body.order_number).trim() : null,
      from_stage: req.body.from_stage ? String(req.body.from_stage).trim() : null,
      to_stage: req.body.to_stage ? String(req.body.to_stage).trim() : null,
      date_start: normalizeDate(req.body.date_start),
      date_end: normalizeDate(req.body.date_end),
      description: req.body.description ? String(req.body.description).trim() : null,
      photo_url,
      status: TASK_STATUSES.has(req.body.status) ? req.body.status : 'new',
    });
    res.status(201).json(task.toJSON());
  } catch (err) {
    console.error('[tasks POST error]:', err);
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
