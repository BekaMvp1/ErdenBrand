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

const DEFAULT_PAMYATKA = {
  rows: [
    { id: 'pm-0', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
    { id: 'pm-1', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
    { id: 'pm-2', razdel: '', kak_dolzhno: '', ne_dopuskaetsya: '' },
  ],
  photos: [],
};

const PAMYATKA_JSON_MAX = 5000000;

function normalizePamyatkaRows(rowsIn) {
  if (!Array.isArray(rowsIn) || rowsIn.length === 0) {
    return DEFAULT_PAMYATKA.rows.map((r) => ({ ...r }));
  }
  return rowsIn.map((r, i) => ({
    id: r.id != null ? String(r.id).slice(0, 80) : `pm-${i}`,
    razdel: r.razdel != null ? String(r.razdel).slice(0, 4000) : '',
    kak_dolzhno: r.kak_dolzhno != null ? String(r.kak_dolzhno).slice(0, 12000) : '',
    ne_dopuskaetsya: r.ne_dopuskaetsya != null ? String(r.ne_dopuskaetsya).slice(0, 12000) : '',
  }));
}

/** Объект для API из значения в БД или теле запроса */
function parsePamyatka(raw) {
  if (raw == null || raw === '') {
    return {
      rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })),
      photos: [],
    };
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    if (Array.isArray(raw.rows)) {
      return {
        rows: normalizePamyatkaRows(raw.rows),
        photos: Array.isArray(raw.photos) ? raw.photos : [],
      };
    }
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const o = JSON.parse(t);
        return parsePamyatka(o);
      } catch {
        return { rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })), photos: [] };
      }
    }
    return {
      rows: [
        { id: 'pm-0', razdel: '', kak_dolzhno: t.slice(0, 12000), ne_dopuskaetsya: '' },
        ...DEFAULT_PAMYATKA.rows.slice(1).map((r, i) => ({
          ...r,
          id: `pm-${i + 1}`,
        })),
      ],
      photos: [],
    };
  }
  return { rows: DEFAULT_PAMYATKA.rows.map((r) => ({ ...r })), photos: [] };
}

function stringifyPamyatkaForDb(bodyVal) {
  const parsed = parsePamyatka(bodyVal);
  const photoArr = Array.isArray(parsed.photos) ? parsed.photos : [];
  return JSON.stringify({ rows: parsed.rows, photos: photoArr }).slice(0, PAMYATKA_JSON_MAX);
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
    res.json(
      rows.map((r) => {
        const plain = r.get({ plain: true });
        plain.pamyatka = parsePamyatka(plain.pamyatka);
        return plain;
      })
    );
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
    plain.pamyatka = parsePamyatka(plain.pamyatka);
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
      pamyatka: stringifyPamyatkaForDb(
        body.pamyatka !== undefined && body.pamyatka !== null ? body.pamyatka : DEFAULT_PAMYATKA
      ),
      photos: Array.isArray(body.photos) ? body.photos : [],
      lekala: Array.isArray(body.lekala) ? body.lekala : [],
      tabel_mer: normalizeTabelMer(body.tabel_mer),
      konfek_logo: body.konfek_logo != null ? String(body.konfek_logo).slice(0, 5000000) : null,
      konfek_model: body.konfek_model != null ? String(body.konfek_model).slice(0, 10000) : null,
      konfek_name: body.konfek_name != null ? String(body.konfek_name).slice(0, 10000) : null,
      konfek_sizes: body.konfek_sizes != null ? String(body.konfek_sizes).slice(0, 10000) : null,
      konfek_collection: body.konfek_collection != null ? String(body.konfek_collection).slice(0, 10000) : null,
      konfek_fabric: body.konfek_fabric != null ? String(body.konfek_fabric).slice(0, 10000) : null,
      konfek_fittings: body.konfek_fittings != null ? String(body.konfek_fittings).slice(0, 10000) : null,
      konfek_note: body.konfek_note != null ? String(body.konfek_note).slice(0, 20000) : null,
    });
    const created = row.get({ plain: true });
    created.pamyatka = parsePamyatka(created.pamyatka);
    res.status(201).json(created);
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
    if (body.pamyatka !== undefined) {
      patch.pamyatka = body.pamyatka == null ? null : stringifyPamyatkaForDb(body.pamyatka);
    }
    if (body.photos !== undefined) patch.photos = Array.isArray(body.photos) ? body.photos : [];
    if (body.lekala !== undefined) patch.lekala = Array.isArray(body.lekala) ? body.lekala : [];
    if (body.tabel_mer !== undefined) patch.tabel_mer = normalizeTabelMer(body.tabel_mer);
    if (body.konfek_logo !== undefined) {
      patch.konfek_logo = body.konfek_logo != null ? String(body.konfek_logo).slice(0, 5000000) : null;
    }
    if (body.konfek_model !== undefined) {
      patch.konfek_model = body.konfek_model != null ? String(body.konfek_model).slice(0, 10000) : null;
    }
    if (body.konfek_name !== undefined) {
      patch.konfek_name = body.konfek_name != null ? String(body.konfek_name).slice(0, 10000) : null;
    }
    if (body.konfek_sizes !== undefined) {
      patch.konfek_sizes = body.konfek_sizes != null ? String(body.konfek_sizes).slice(0, 10000) : null;
    }
    if (body.konfek_collection !== undefined) {
      patch.konfek_collection = body.konfek_collection != null ? String(body.konfek_collection).slice(0, 10000) : null;
    }
    if (body.konfek_fabric !== undefined) {
      patch.konfek_fabric = body.konfek_fabric != null ? String(body.konfek_fabric).slice(0, 10000) : null;
    }
    if (body.konfek_fittings !== undefined) {
      patch.konfek_fittings = body.konfek_fittings != null ? String(body.konfek_fittings).slice(0, 10000) : null;
    }
    if (body.konfek_note !== undefined) {
      patch.konfek_note = body.konfek_note != null ? String(body.konfek_note).slice(0, 20000) : null;
    }
    await row.update(patch);
    const plain = row.get({ plain: true });
    plain.tabel_mer = normalizeTabelMer(plain.tabel_mer);
    plain.pamyatka = parsePamyatka(plain.pamyatka);
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
