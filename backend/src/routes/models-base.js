/**
 * API: База моделей (models_base)
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();

const TABEL_SIZES = ['42', '44', '46', '48', '50', '52'];

function emptyTabelSizeFields(sizes) {
  return sizes.reduce((acc, s) => {
    acc[`s${s}`] = '';
    return acc;
  }, {});
}

function defaultTabelGroups(sizes) {
  return [
    {
      id: 1,
      title: 'Жакет',
      rows: [
        { id: 'r-len', name: 'Длина изделия', ...emptyTabelSizeFields(sizes) },
        { id: 'r-sh', name: 'Ширина плеч', ...emptyTabelSizeFields(sizes) },
        { id: 'r-ch', name: 'Обхват груди', ...emptyTabelSizeFields(sizes) },
      ],
    },
  ];
}

function normalizeTabelMerRow(r, rowIndex, groupIndex, sizes) {
  const id = r.id != null ? r.id : `${groupIndex}-row-${rowIndex}`;
  const name =
    r.name != null ? String(r.name) : r.label != null ? String(r.label) : '';
  const out = { id, name };
  for (const s of sizes) {
    const k = `s${s}`;
    out[k] =
      r[k] != null
        ? String(r[k])
        : r.values && r.values[s] != null
          ? String(r.values[s])
          : '';
  }
  return out;
}

function normalizeTabelMer(raw) {
  if (!raw || typeof raw !== 'object') {
    const sizes = [...TABEL_SIZES];
    return { sizes, groups: defaultTabelGroups(sizes) };
  }
  const sizes = Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes.map(String) : [...TABEL_SIZES];

  if (raw.rows && !raw.groups) {
    const oldRows = Array.isArray(raw.rows) ? raw.rows : [];
    const converted = oldRows.map((r, i) => normalizeTabelMerRow(r, i, 0, sizes));
    return {
      sizes,
      groups: [
        {
          id: 1,
          title: 'Основные мерки',
          rows: converted.length ? converted : defaultTabelGroups(sizes)[0].rows.map((row) => ({ ...row })),
        },
      ],
    };
  }

  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return { sizes, groups: defaultTabelGroups(sizes) };
  }

  return {
    sizes,
    groups: raw.groups.map((g, gi) => ({
      id: g.id != null ? g.id : gi + 1,
      title: g.title != null ? String(g.title) : '',
      rows: Array.isArray(g.rows)
        ? g.rows.map((r, ri) => normalizeTabelMerRow(r, ri, gi, sizes))
        : [],
    })),
  };
}

function defaultOpsRowsJson() {
  return [
    { id: 'op-0', name: '', cost: '', note: '' },
    { id: 'op-1', name: '', cost: '', note: '' },
    { id: 'op-2', name: '', cost: '', note: '' },
  ];
}

function normalizeOpsRowJson(r, i) {
  const cost =
    r.cost != null && String(r.cost).trim() !== ''
      ? String(r.cost).slice(0, 500)
      : r.qty != null
        ? String(r.qty).slice(0, 500)
        : '';
  return {
    id: r.id != null ? String(r.id).slice(0, 80) : `op-${i}`,
    name: r.name != null ? String(r.name).slice(0, 4000) : '',
    cost,
    note: r.note != null ? String(r.note).slice(0, 8000) : '',
  };
}

function defaultOpsGroupsJson(kind) {
  const title =
    kind === 'cutting' ? 'Раскрой' : kind === 'sewing' ? 'Пошив' : 'ОТК';
  return {
    groups: [{ id: 1, title, rows: defaultOpsRowsJson() }],
  };
}

function normalizeOpsJson(raw, kind) {
  if (!raw || typeof raw !== 'object') {
    return defaultOpsGroupsJson(kind);
  }
  if (raw.rows && !raw.groups) {
    const oldRows = Array.isArray(raw.rows) ? raw.rows : [];
    const converted = oldRows.map((r, i) => normalizeOpsRowJson(r, i));
    const title =
      kind === 'cutting' ? 'Раскрой' : kind === 'sewing' ? 'Пошив' : 'ОТК';
    return {
      groups: [
        {
          id: 1,
          title,
          rows: converted.length ? converted : defaultOpsRowsJson(),
        },
      ],
    };
  }
  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return defaultOpsGroupsJson(kind);
  }
  return {
    groups: raw.groups.map((g, gi) => ({
      id: g.id != null ? g.id : gi + 1,
      title: g.title != null ? String(g.title).slice(0, 500) : '',
      rows: Array.isArray(g.rows)
        ? g.rows.map((r, ri) => normalizeOpsRowJson(r, ri))
        : [],
    })),
  };
}

function defaultFabricFittingsRows() {
  return [
    { id: 'op-0', name: '', qty: '', unit: '', price_per_unit: '', reserve_qty: '', photo: null },
    { id: 'op-1', name: '', qty: '', unit: '', price_per_unit: '', reserve_qty: '', photo: null },
    { id: 'op-2', name: '', qty: '', unit: '', price_per_unit: '', reserve_qty: '', photo: null },
  ];
}

const FABRIC_PHOTO_MAX = 5000000;

function normalizeFabricFittingsRowJson(r, i) {
  const ppu =
    r.price_per_unit != null && String(r.price_per_unit).trim() !== ''
      ? String(r.price_per_unit).slice(0, 500)
      : r.price != null && String(r.price).trim() !== ''
        ? String(r.price).slice(0, 500)
        : '';
  return {
    id: r.id != null ? String(r.id).slice(0, 80) : `op-${i}`,
    name: r.name != null ? String(r.name).slice(0, 4000) : '',
    qty: r.qty != null ? String(r.qty).slice(0, 500) : '',
    unit: r.unit != null ? String(r.unit).slice(0, 100) : '',
    price_per_unit: ppu,
    reserve_qty: r.reserve_qty != null ? String(r.reserve_qty).slice(0, 500) : '',
    photo:
      r.photo != null && typeof r.photo === 'string'
        ? r.photo.slice(0, FABRIC_PHOTO_MAX)
        : null,
  };
}

function defaultFabricFittingsGroupsJson(kind) {
  const title = kind === 'fabric' ? 'Основная ткань' : 'Фурнитура';
  return {
    groups: [{ id: 1, title, rows: defaultFabricFittingsRows() }],
  };
}

function normalizeFabricFittingsJson(raw, kind) {
  if (!raw || typeof raw !== 'object') {
    return defaultFabricFittingsGroupsJson(kind);
  }
  if (raw.rows && !raw.groups) {
    const oldRows = Array.isArray(raw.rows) ? raw.rows : [];
    const converted = oldRows.map((r, i) => normalizeFabricFittingsRowJson(r, i));
    const title = kind === 'fabric' ? 'Основная ткань' : 'Фурнитура';
    return {
      groups: [
        {
          id: 1,
          title,
          rows: converted.length ? converted : defaultFabricFittingsRows(),
        },
      ],
    };
  }
  if (!Array.isArray(raw.groups) || raw.groups.length === 0) {
    return defaultFabricFittingsGroupsJson(kind);
  }
  return {
    groups: raw.groups.map((g, gi) => ({
      id: g.id != null ? g.id : gi + 1,
      title: g.title != null ? String(g.title).slice(0, 500) : '',
      rows: Array.isArray(g.rows)
        ? g.rows.map((r, ri) => normalizeFabricFittingsRowJson(r, ri))
        : [],
    })),
  };
}

function attachModelOpsFields(plain) {
  if (!plain || typeof plain !== 'object') return;
  plain.fabric_data = normalizeFabricFittingsJson(plain.fabric_data, 'fabric');
  plain.fittings_data = normalizeFabricFittingsJson(plain.fittings_data, 'fittings');
  plain.cutting_ops = normalizeOpsJson(plain.cutting_ops, 'cutting');
  plain.sewing_ops = normalizeOpsJson(plain.sewing_ops, 'sewing');
  plain.otk_ops = normalizeOpsJson(plain.otk_ops, 'otk');
}

/** Плоский массив для заказа / API из нормализованного fabric_data / fittings_data */
function fabricDataToFlatArray(normalized) {
  if (!normalized || typeof normalized !== 'object') return [];
  const groups = Array.isArray(normalized.groups) ? normalized.groups : [];
  const out = [];
  for (const g of groups) {
    for (const r of g.rows || []) {
      let q = null;
      if (r.qty != null && String(r.qty).trim() !== '') {
        const n = Number(String(r.qty).replace(',', '.'));
        q = Number.isFinite(n) ? n : null;
      }
      let ppu = null;
      if (r.price_per_unit != null && String(r.price_per_unit).trim() !== '') {
        const p = Number(String(r.price_per_unit).replace(',', '.'));
        ppu = Number.isFinite(p) ? p : null;
      } else if (r.price != null && String(r.price).trim() !== '') {
        const p = Number(String(r.price).replace(',', '.'));
        ppu = Number.isFinite(p) ? p : null;
      }
      out.push({
        name: r.name != null ? String(r.name).slice(0, 4000) : '',
        unit: r.unit != null ? String(r.unit).slice(0, 100) : '',
        qty_per_unit: q,
        price_per_unit: ppu,
      });
    }
  }
  return out;
}

function opsGroupsToFlatExport(opsNormalized) {
  if (!opsNormalized || typeof opsNormalized !== 'object') return [];
  const groups = Array.isArray(opsNormalized.groups) ? opsNormalized.groups : [];
  const out = [];
  for (const g of groups) {
    for (const r of g.rows || []) {
      let price = null;
      let timeNorm = null;
      if (r.cost != null && String(r.cost).trim() !== '') {
        const p = Number(String(r.cost).replace(',', '.'));
        price = Number.isFinite(p) ? p : null;
      }
      const note = r.note != null ? String(r.note).trim() : '';
      if (note && /^[\d.,]+$/.test(note.replace(',', '.'))) {
        const t = Number(note.replace(',', '.'));
        timeNorm = Number.isFinite(t) ? t : null;
      }
      out.push({
        name: r.name != null ? String(r.name).slice(0, 4000) : '',
        time_norm: timeNorm,
        price,
      });
    }
  }
  return out;
}

/** Поля model.fabric / model.accessories + плоские операции для формы заказа */
function attachFabricAccessoriesExport(plain) {
  if (!plain || typeof plain !== 'object') return;
  const derivedFabric = fabricDataToFlatArray(plain.fabric_data);
  const fabDb = Array.isArray(plain.fabric) ? plain.fabric : [];
  plain.fabric = fabDb.length ? fabDb : derivedFabric;

  const derivedAcc = fabricDataToFlatArray(plain.fittings_data);
  const accDb = Array.isArray(plain.accessories) ? plain.accessories : [];
  plain.accessories = accDb.length ? accDb : derivedAcc;

  plain.cutting_ops_flat = opsGroupsToFlatExport(plain.cutting_ops);
  plain.sewing_ops_flat = opsGroupsToFlatExport(plain.sewing_ops);
  plain.otk_ops_flat = opsGroupsToFlatExport(plain.otk_ops);
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
    attachModelOpsFields(plain);
    attachFabricAccessoriesExport(plain);
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
    const fabricDataNorm = normalizeFabricFittingsJson(body.fabric_data, 'fabric');
    const fittingsDataNorm = normalizeFabricFittingsJson(body.fittings_data, 'fittings');
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
      fabric_data: fabricDataNorm,
      fittings_data: fittingsDataNorm,
      fabric: fabricDataToFlatArray(fabricDataNorm),
      accessories: fabricDataToFlatArray(fittingsDataNorm),
      cutting_ops: normalizeOpsJson(body.cutting_ops, 'cutting'),
      sewing_ops: normalizeOpsJson(body.sewing_ops, 'sewing'),
      otk_ops: normalizeOpsJson(body.otk_ops, 'otk'),
    });
    const created = row.get({ plain: true });
    created.pamyatka = parsePamyatka(created.pamyatka);
    attachModelOpsFields(created);
    attachFabricAccessoriesExport(created);
    res.status(201).json(created);
  } catch (err) {
    console.error('models-base POST error:', err);
    const msg = err?.message || String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      next(err);
    }
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
    if (body.fabric_data !== undefined) patch.fabric_data = normalizeFabricFittingsJson(body.fabric_data, 'fabric');
    if (body.fittings_data !== undefined) patch.fittings_data = normalizeFabricFittingsJson(body.fittings_data, 'fittings');
    if (body.cutting_ops !== undefined) patch.cutting_ops = normalizeOpsJson(body.cutting_ops, 'cutting');
    if (body.sewing_ops !== undefined) patch.sewing_ops = normalizeOpsJson(body.sewing_ops, 'sewing');
    if (body.otk_ops !== undefined) patch.otk_ops = normalizeOpsJson(body.otk_ops, 'otk');
    if (body.fabric_data !== undefined) {
      patch.fabric = fabricDataToFlatArray(patch.fabric_data);
    }
    if (body.fittings_data !== undefined) {
      patch.accessories = fabricDataToFlatArray(patch.fittings_data);
    }
    if (Array.isArray(body.fabric) && body.fabric_data === undefined) {
      patch.fabric = body.fabric;
    }
    if (Array.isArray(body.accessories) && body.fittings_data === undefined) {
      patch.accessories = body.accessories;
    }
    await row.update(patch);
    const plain = row.get({ plain: true });
    plain.tabel_mer = normalizeTabelMer(plain.tabel_mer);
    plain.pamyatka = parsePamyatka(plain.pamyatka);
    attachModelOpsFields(plain);
    attachFabricAccessoriesExport(plain);
    res.json(plain);
  } catch (err) {
    console.error('models-base PUT error:', err);
    const msg = err?.message || String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    } else {
      next(err);
    }
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
