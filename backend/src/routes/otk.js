/**
 * ОТК — план цеха (документы из фактов пошива).
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { getWeekStart } = require('../utils/planningUtils');

const router = express.Router();

function deriveOtkWarehouseStatus(qty, shippedQty) {
  const q = Math.max(0, parseInt(qty, 10) || 0);
  const s = Math.max(0, parseInt(shippedQty, 10) || 0);
  if (q <= 0) return 'in_stock';
  if (s >= q) return 'shipped';
  if (s > 0) return 'partial';
  return 'in_stock';
}

/**
 * Синхронизация принятого ОТК → склад (otk_warehouse_items).
 */
async function syncOtkFactToWarehouse(otkFactRow) {
  try {
    const otkDoc = await db.OtkDocument.findByPk(otkFactRow.otk_document_id);
    if (!otkDoc) return;

    const passed = Math.max(0, parseInt(otkFactRow.otk_passed, 10) || 0);
    const today = new Date().toISOString().slice(0, 10);

    const existingRow = await db.OtkWarehouseItem.findOne({
      where: {
        otk_document_id: otkDoc.id,
        color: otkFactRow.color,
        size: otkFactRow.size,
      },
    });
    if (passed === 0) {
      if (existingRow) {
        await existingRow.update({
          quantity: 0,
          shipped_qty: 0,
          status: deriveOtkWarehouseStatus(0, 0),
        });
      }
      return;
    }

    const [whItem, created] = await db.OtkWarehouseItem.findOrCreate({
      where: {
        otk_document_id: otkDoc.id,
        color: otkFactRow.color,
        size: otkFactRow.size,
      },
      defaults: {
        order_id: otkDoc.order_id,
        section_id: otkDoc.section_id,
        quantity: passed,
        shipped_qty: 0,
        status: deriveOtkWarehouseStatus(passed, 0),
        received_at: passed > 0 ? today : null,
      },
    });

    if (!created) {
      let shipped = Math.max(0, parseInt(whItem.shipped_qty, 10) || 0);
      shipped = Math.min(shipped, passed);
      await whItem.update({
        quantity: passed,
        order_id: otkDoc.order_id,
        section_id: otkDoc.section_id,
        shipped_qty: shipped,
        received_at: passed > 0 ? (whItem.received_at || today) : whItem.received_at,
        status: deriveOtkWarehouseStatus(passed, shipped),
      });
    }

    console.log('[otk→warehouse] синхронизировано:', otkFactRow.color, otkFactRow.size, 'принято:', passed);
  } catch (err) {
    console.error('[otk→warehouse] ошибка:', err.message);
  }
}

const OTK_CHAIN_DOC_STATUSES = new Set(['pending', 'in_progress', 'done']);

function normalizeOtkDateOnly(v) {
  const s = String(v || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseOtkChainDocIdParam(req) {
  const id = parseInt(req.params.id, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const otkChainDocumentInclude = [
  {
    model: db.Order,
    attributes: [
      'id',
      'title',
      'tz_code',
      'model_name',
      'article',
      'client_id',
      'photos',
      'quantity',
      'total_quantity',
      'size_grid_numeric',
      'size_grid_quantities',
    ],
    include: [{ model: db.Client, attributes: ['id', 'name'] }],
  },
  {
    model: db.OtkFactDetail,
    as: 'otk_facts',
    required: false,
    attributes: [
      'id',
      'color',
      'size',
      'sewing_quantity',
      'otk_passed',
      'otk_rejected',
      'reject_reason',
    ],
  },
  {
    model: db.SewingDocument,
    attributes: ['id', 'status'],
    required: false,
  },
];

/**
 * GET /api/otk/documents
 */
router.get('/documents', async (req, res, next) => {
  try {
    const docs = await db.OtkDocument.findAll({
      include: otkChainDocumentInclude,
      order: [
        ['week_start', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    res.json(docs.map((d) => d.toJSON()));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/otk/documents/:id/facts
 */
router.get('/documents/:id/facts', async (req, res, next) => {
  try {
    const docId = parseOtkChainDocIdParam(req);
    if (!docId) return res.status(400).json({ error: 'Неверный id' });
    const doc = await db.OtkDocument.findByPk(docId);
    if (!doc) return res.status(404).json({ error: 'Не найдено' });
    const facts = await db.OtkFactDetail.findAll({
      where: { otk_document_id: docId },
      order: [['id', 'ASC']],
      attributes: [
        'id',
        'color',
        'size',
        'sewing_quantity',
        'otk_passed',
        'otk_rejected',
        'reject_reason',
      ],
    });
    res.json(facts.map((f) => f.toJSON()));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/otk/documents/:id
 */
router.patch('/documents/:id', async (req, res, next) => {
  try {
    const id = parseOtkChainDocIdParam(req);
    if (!id) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.OtkDocument.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const patch = {};
    if (req.body.status !== undefined) {
      const v = String(req.body.status).trim();
      if (!OTK_CHAIN_DOC_STATUSES.has(v)) {
        return res.status(400).json({ error: 'Недопустимый status' });
      }
      patch.status = v;
    }
    if (req.body.actual_date !== undefined) {
      if (req.body.actual_date == null || req.body.actual_date === '') {
        patch.actual_date = null;
      } else {
        const d = normalizeOtkDateOnly(req.body.actual_date);
        if (!d) return res.status(400).json({ error: 'Некорректная actual_date' });
        patch.actual_date = d;
      }
    }
    if (req.body.comment !== undefined) {
      patch.comment = req.body.comment == null ? null : String(req.body.comment).slice(0, 5000);
    }
    if (req.body.floor_id !== undefined) {
      if (req.body.floor_id == null || req.body.floor_id === '') {
        patch.floor_id = null;
      } else {
        patch.floor_id = String(req.body.floor_id).trim().slice(0, 50) || null;
      }
    }
    if (req.body.week_start !== undefined) {
      const raw = normalizeOtkDateOnly(req.body.week_start);
      if (!raw) return res.status(400).json({ error: 'Некорректная week_start' });
      patch.week_start = getWeekStart(raw);
    }
    if (req.body.actual_week_start !== undefined) {
      if (req.body.actual_week_start == null || req.body.actual_week_start === '') {
        patch.actual_week_start = null;
      } else {
        const aw = normalizeOtkDateOnly(req.body.actual_week_start);
        if (!aw) return res.status(400).json({ error: 'Некорректная actual_week_start' });
        patch.actual_week_start = getWeekStart(aw);
      }
    }
    if (req.body.section_id !== undefined) {
      if (req.body.section_id == null || req.body.section_id === '') {
        patch.section_id = null;
      } else {
        patch.section_id = String(req.body.section_id).trim().slice(0, 50) || null;
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    await row.update(patch);
    const full = await db.OtkDocument.findByPk(id, { include: otkChainDocumentInclude });
    res.json(full.toJSON());
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/otk/facts/:factId
 */
router.patch('/facts/:factId', async (req, res, next) => {
  try {
    const factId = parseInt(req.params.factId, 10);
    if (!factId) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.OtkFactDetail.findByPk(factId);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const patch = {};
    if (req.body.otk_passed !== undefined) {
      patch.otk_passed = Math.max(0, parseInt(req.body.otk_passed, 10) || 0);
    }
    if (req.body.otk_rejected !== undefined) {
      patch.otk_rejected = Math.max(0, parseInt(req.body.otk_rejected, 10) || 0);
    }
    if (req.body.reject_reason !== undefined) {
      patch.reject_reason =
        req.body.reject_reason == null ? null : String(req.body.reject_reason).slice(0, 5000);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    await row.update(patch);
    await row.reload();
    await syncOtkFactToWarehouse(row);
    res.json(row.toJSON());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/otk/sync-to-warehouse
 */
router.post('/sync-to-warehouse', async (req, res, next) => {
  try {
    const allFacts = await db.OtkFactDetail.findAll({
      where: { otk_passed: { [Op.gt]: 0 } },
    });
    let synced = 0;
    for (const fact of allFacts) {
      await syncOtkFactToWarehouse(fact);
      synced += 1;
    }
    console.log('[sync-to-warehouse] синхронизировано:', synced);
    res.json({ synced, total: allFacts.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
