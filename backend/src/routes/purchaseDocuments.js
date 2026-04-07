/**
 * Документы закупа из плана цеха: /api/purchase/documents
 */

const express = require('express');
const db = require('../models');
const { syncDocumentsForChainIds } = require('../services/chainDocumentsSync');
const { logAudit } = require('../utils/audit');
const { getWeekStart } = require('../utils/planningUtils');

const router = express.Router();
const DOC_STATUSES = new Set(['pending', 'in_progress', 'done']);
const WORKSHOP_VALUES = new Set(['floor_4', 'floor_3', 'floor_2', 'aksy', 'outsource']);

function normalizeIsoDate(v) {
  const s = String(v || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

router.use((req, res, next) => {
  if (req.user?.role === 'operator' && req.method !== 'GET') {
    return res.status(403).json({ error: 'Оператор может только просматривать' });
  }
  next();
});

router.get('/documents', async (req, res, next) => {
  try {
    const rows = await db.PurchaseDocument.findAll({
      order: [
        ['week_start', 'ASC'],
        ['id', 'ASC'],
      ],
      include: [
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
          ],
          include: [{ model: db.Client, attributes: ['id', 'name'] }],
        },
        {
          model: db.PlanningChain,
          attributes: ['id', 'section_id', 'purchase_week_start', 'cutting_week_start', 'sewing_week_start'],
        },
      ],
    });
    res.json(rows.map((r) => r.toJSON()));
  } catch (err) {
    next(err);
  }
});

router.post('/documents/from-chain', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Только admin/manager' });
    }
    const chainIds = Array.isArray(req.body?.chain_ids) ? req.body.chain_ids : [];
    await syncDocumentsForChainIds(chainIds);
    await logAudit(req.user.id, 'SYNC', 'purchase_documents_from_chain', chainIds.length);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/documents/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Неверный id' });
    const row = await db.PurchaseDocument.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const patch = {};
    if (req.body.week_start !== undefined) {
      const raw = normalizeIsoDate(req.body.week_start);
      if (!raw) return res.status(400).json({ error: 'Некорректная week_start' });
      patch.week_start = getWeekStart(raw);
    }
    if (req.body.actual_week_start !== undefined) {
      const d = normalizeIsoDate(req.body.actual_week_start);
      if (!d) return res.status(400).json({ error: 'Некорректная actual_week_start' });
      patch.actual_week_start = getWeekStart(d);
    }
    if (req.body.section_id !== undefined) {
      if (req.body.section_id == null || req.body.section_id === '') {
        patch.section_id = null;
      } else {
        patch.section_id = String(req.body.section_id).trim().slice(0, 64) || null;
      }
    }
    if (req.body.actual_date !== undefined) {
      if (req.body.actual_date == null || req.body.actual_date === '') {
        patch.actual_date = null;
      } else {
        const ad = normalizeIsoDate(req.body.actual_date);
        if (!ad) return res.status(400).json({ error: 'Некорректная actual_date' });
        patch.actual_date = ad;
      }
    }
    if (req.body.status !== undefined) {
      const v = String(req.body.status).trim();
      if (!DOC_STATUSES.has(v)) return res.status(400).json({ error: 'Недопустимый status' });
      patch.status = v;
    }
    if (req.body.comment !== undefined) {
      patch.comment = req.body.comment == null ? null : String(req.body.comment).slice(0, 5000);
    }
    if (req.body.workshop !== undefined) {
      const raw = req.body.workshop;
      if (raw == null || raw === '') {
        patch.workshop = null;
      } else {
        const w = String(raw).trim();
        if (!WORKSHOP_VALUES.has(w)) {
          return res.status(400).json({ error: 'Недопустимый workshop' });
        }
        patch.workshop = w;
      }
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    await row.update(patch);
    await logAudit(req.user.id, 'UPDATE', 'purchase_document', id);
    const full = await db.PurchaseDocument.findByPk(id, {
      include: [
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
          ],
          include: [{ model: db.Client, attributes: ['id', 'name'] }],
        },
        {
          model: db.PlanningChain,
          attributes: ['id', 'section_id', 'purchase_week_start', 'cutting_week_start', 'sewing_week_start'],
        },
      ],
    });
    res.json(full.toJSON());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
