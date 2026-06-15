/**
 * Документы печати штрихкодов (журнал)
 * Монтируется: /api/barcodes/barcode-print-docs
 */

const express = require('express');
const db = require('../models');

const BarcodePrintDocument = require('../models/BarcodePrintDocument')(
  db.sequelize,
  db.Sequelize.DataTypes
);
const BarcodePrintDocumentItem = require('../models/BarcodePrintDocumentItem')(
  db.sequelize,
  db.Sequelize.DataTypes
);

BarcodePrintDocument.hasMany(BarcodePrintDocumentItem, {
  foreignKey: 'document_id',
  as: 'Items',
});
BarcodePrintDocumentItem.belongsTo(BarcodePrintDocument, {
  foreignKey: 'document_id',
  as: 'Document',
});
BarcodePrintDocumentItem.belongsTo(db.BarcodeDoc, {
  foreignKey: 'barcode_id',
  as: 'BarcodeDoc',
});
BarcodePrintDocument.belongsTo(db.User, {
  foreignKey: 'created_by',
  as: 'Creator',
});

const router = express.Router();

function parseDocRows(doc) {
  if (!doc) return [];
  const rows = doc.rows;
  if (Array.isArray(rows)) return rows;
  try {
    return JSON.parse(rows || '[]');
  } catch {
    return [];
  }
}

function formatItem(it) {
  const plain = typeof it.get === 'function' ? it.get({ plain: true }) : it;
  const meta = plain.row_meta && typeof plain.row_meta === 'object' ? plain.row_meta : {};
  const src = plain.BarcodeDoc || {};
  return {
    id: plain.id,
    document_id: plain.document_id,
    barcode_id: plain.barcode_id,
    quantity: plain.quantity,
    article: meta.article || null,
    color: meta.color || null,
    size: meta.size || null,
    barcode: meta.barcode || null,
    tz: meta.tz || src.tz || null,
    row_index: meta.row_index ?? null,
    source_doc_name: src.name || null,
  };
}

function formatDocument(doc, { withItems = false } = {}) {
  const plain = typeof doc.get === 'function' ? doc.get({ plain: true }) : doc;
  const items = plain.Items || [];
  const totalQty = items.reduce((s, it) => s + (parseInt(it.quantity, 10) || 0), 0);
  const out = {
    id: plain.id,
    name: plain.name,
    printed_at: plain.printed_at,
    status: plain.status,
    created_by: plain.created_by,
    created_by_name: plain.Creator?.name || null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    items_count: items.length,
    total_quantity: totalQty,
  };
  if (withItems) {
    out.items = items.map(formatItem);
  }
  return out;
}

function sanitizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((it) => {
      const barcodeId = parseInt(it.barcode_id, 10);
      const qty = parseInt(it.quantity, 10);
      if (!Number.isFinite(barcodeId) || barcodeId <= 0) return null;
      if (!Number.isFinite(qty) || qty <= 0) return null;
      const meta =
        it.row_meta && typeof it.row_meta === 'object'
          ? it.row_meta
          : {
              article: it.article || '',
              color: it.color || '',
              size: it.size || '',
              barcode: it.barcode || '',
              tz: it.tz || '',
              row_index: it.row_index ?? null,
            };
      return {
        barcode_id: barcodeId,
        quantity: qty,
        row_meta: meta,
      };
    })
    .filter(Boolean);
}

async function loadDocument(id, withItems = true) {
  const include = withItems
    ? [
        {
          model: BarcodePrintDocumentItem,
          as: 'Items',
          include: [
            {
              model: db.BarcodeDoc,
              as: 'BarcodeDoc',
              attributes: ['id', 'tz', 'name', 'rows'],
            },
          ],
        },
        { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
      ]
    : [{ model: db.User, as: 'Creator', attributes: ['id', 'name'] }];

  return BarcodePrintDocument.findByPk(id, { include });
}

/** POST / — создать документ */
router.post('/', async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { name, printed_at, status, items: rawItems } = req.body || {};
    const docName = String(name || '').trim();
    if (!docName) {
      await t.rollback();
      return res.status(400).json({ error: 'Укажите название документа' });
    }
    const items = sanitizeItems(rawItems);
    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
    }

    const printDate = printed_at
      ? String(printed_at).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const st = status === 'printed' ? 'printed' : 'draft';

    const doc = await BarcodePrintDocument.create(
      {
        name: docName,
        printed_at: printDate,
        status: st,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    await BarcodePrintDocumentItem.bulkCreate(
      items.map((it) => ({ ...it, document_id: doc.id })),
      { transaction: t }
    );

    await t.commit();
    const full = await loadDocument(doc.id);
    res.status(201).json(formatDocument(full, { withItems: true }));
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

/** GET / — список документов */
router.get('/', async (req, res) => {
  try {
    const docs = await BarcodePrintDocument.findAll({
      include: [
        { model: BarcodePrintDocumentItem, as: 'Items', attributes: ['id', 'quantity'] },
        { model: db.User, as: 'Creator', attributes: ['id', 'name'] },
      ],
      order: [['printed_at', 'DESC'], ['id', 'DESC']],
      limit: 500,
    });
    res.json(docs.map((d) => formatDocument(d)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /:id — документ с позициями */
router.get('/:id', async (req, res) => {
  try {
    const doc = await loadDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });
    res.json(formatDocument(doc, { withItems: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /:id — обновить */
router.put('/:id', async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const doc = await BarcodePrintDocument.findByPk(req.params.id, { transaction: t });
    if (!doc) {
      await t.rollback();
      return res.status(404).json({ error: 'Документ не найден' });
    }

    const { name, printed_at, status, items: rawItems } = req.body || {};
    const updates = {};
    if (name != null && String(name).trim()) updates.name = String(name).trim();
    if (printed_at != null) updates.printed_at = String(printed_at).slice(0, 10);
    if (status === 'draft' || status === 'printed') updates.status = status;

    if (Object.keys(updates).length) {
      await doc.update(updates, { transaction: t });
    }

    if (Array.isArray(rawItems)) {
      const items = sanitizeItems(rawItems);
      if (!items.length) {
        await t.rollback();
        return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
      }
      await BarcodePrintDocumentItem.destroy({
        where: { document_id: doc.id },
        transaction: t,
      });
      await BarcodePrintDocumentItem.bulkCreate(
        items.map((it) => ({ ...it, document_id: doc.id })),
        { transaction: t }
      );
    }

    await t.commit();
    const full = await loadDocument(doc.id);
    res.json(formatDocument(full, { withItems: true }));
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /:id */
router.delete('/:id', async (req, res) => {
  try {
    const n = await BarcodePrintDocument.destroy({ where: { id: req.params.id } });
    if (!n) return res.status(404).json({ error: 'Документ не найден' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /:id/print — пометить напечатанным */
router.post('/:id/print', async (req, res) => {
  try {
    const doc = await BarcodePrintDocument.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });

    const now = new Date();
    await doc.update({
      status: 'printed',
      printed_at: now.toISOString().slice(0, 10),
    });

    const full = await loadDocument(doc.id);
    res.json(formatDocument(full, { withItems: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
