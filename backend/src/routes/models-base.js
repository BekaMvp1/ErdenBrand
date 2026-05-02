/**
 * API: База моделей (models_base)
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

const DEFAULT_TABEL_MER = {
  sizes: ['42', '44', '46', '48', '50', '52'],
  rows: [
    { id: 'r-len', label: 'Длина изделия', values: {} },
    { id: 'r-sh', label: 'Ширина плеч', values: {} },
    { id: 'r-ch', label: 'Обхват груди', values: {} },
  ],
};

function normalizeTabelMer(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TABEL_MER, rows: [...DEFAULT_TABEL_MER.rows] };
  const sizes = Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes.map(String) : [...DEFAULT_TABEL_MER.sizes];
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((r, i) => ({
        id: r.id || `row-${i}`,
        label: r.label != null ? String(r.label) : '',
        values: r.values && typeof r.values === 'object' ? r.values : {},
      }))
    : [...DEFAULT_TABEL_MER.rows];
  return { sizes, rows };
}

function canMutate(req) {
  return ['admin', 'manager', 'technologist'].includes(req.user?.role);
}

/**
 * GET /api/models-base?search=
 */
router.get('/', async (req, res, next) => {
  try {
    const q = req.query.search != null ? String(req.query.search).trim() : '';
    const where = q
      ? {
          [Op.or]: [
            { code: { [Op.iLike]: `%${q}%` } },
            { name: { [Op.iLike]: `%${q}%` } },
            { description: { [Op.iLike]: `%${q}%` } },
          ],
        }
      : {};
    const rows = await db.ModelsBase.findAll({
      where,
      order: [['updated_at', 'DESC']],
      limit: 500,
    });
    res.json(rows.map((r) => r.get({ plain: true })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/models-base/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Некорректный id' });
    const row = await db.ModelsBase.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const plain = row.get({ plain: true });
    plain.tabel_mer = normalizeTabelMer(plain.tabel_mer);
    res.json(plain);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/models-base
 */
router.post('/', async (req, res, next) => {
  try {
    if (!canMutate(req)) return res.status(403).json({ error: 'Недостаточно прав' });
    const body = req.body || {};
    const row = await db.ModelsBase.create({
      code: body.code != null ? String(body.code).slice(0, 80) : '',
      name: body.name != null ? String(body.name).slice(0, 255) : 'Новая модель',
      description: body.description != null ? String(body.description).slice(0, 20000) : null,
      technical_desc: body.technical_desc != null ? String(body.technical_desc).slice(0, 50000) : null,
      pamyatka: body.pamyatka != null ? String(body.pamyatka).slice(0, 50000) : null,
      photos: Array.isArray(body.photos) ? body.photos : [],
      lekala: Array.isArray(body.lekala) ? body.lekala : [],
      tabel_mer: normalizeTabelMer(body.tabel_mer),
    });
    res.status(201).json(row.get({ plain: true }));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/models-base/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!canMutate(req)) return res.status(403).json({ error: 'Недостаточно прав' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Некорректный id' });
    const row = await db.ModelsBase.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const body = req.body || {};
    const patch = {};
    if (body.code !== undefined) patch.code = String(body.code).slice(0, 80);
    if (body.name !== undefined) patch.name = String(body.name).slice(0, 255);
    if (body.description !== undefined) patch.description = body.description != null ? String(body.description).slice(0, 20000) : null;
    if (body.technical_desc !== undefined) {
      patch.technical_desc = body.technical_desc != null ? String(body.technical_desc).slice(0, 50000) : null;
    }
    if (body.pamyatka !== undefined) patch.pamyatka = body.pamyatka != null ? String(body.pamyatka).slice(0, 50000) : null;
    if (body.photos !== undefined) patch.photos = Array.isArray(body.photos) ? body.photos : [];
    if (body.lekala !== undefined) patch.lekala = Array.isArray(body.lekala) ? body.lekala : [];
    if (body.tabel_mer !== undefined) patch.tabel_mer = normalizeTabelMer(body.tabel_mer);
    await row.update(patch);
    const plain = row.get({ plain: true });
    plain.tabel_mer = normalizeTabelMer(plain.tabel_mer);
    res.json(plain);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/models-base/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!canMutate(req)) return res.status(403).json({ error: 'Недостаточно прав' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Некорректный id' });
    const row = await db.ModelsBase.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    await row.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
