/**
 * Документы штрихкодов — API + журнал печати
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const BarcodePrintLog = require('../models/BarcodePrintLog')(
  db.sequelize,
  db.Sequelize.DataTypes
);

BarcodePrintLog.belongsTo(db.BarcodeDoc, {
  foreignKey: 'barcode_id',
  as: 'BarcodeDoc',
});
BarcodePrintLog.belongsTo(db.User, {
  foreignKey: 'printed_by',
  as: 'User',
});

const router = express.Router();

function parseRowMeta(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { text: String(notes) };
  }
}

function formatPrintLogRow(log) {
  const plain = typeof log.get === 'function' ? log.get({ plain: true }) : log;
  const meta = parseRowMeta(plain.notes);
  const doc = plain.BarcodeDoc || {};
  return {
    id: plain.id,
    barcode_id: plain.barcode_id,
    document_id: plain.document_id,
    quantity: plain.quantity,
    printed_at: plain.printed_at,
    printed_by: plain.printed_by,
    printed_by_name: plain.User?.name || null,
    notes: plain.notes,
    article: meta.article || null,
    color: meta.color || null,
    size: meta.size || null,
    barcode: meta.barcode || null,
    doc_tz: doc.tz || null,
    doc_name: doc.name || null,
  };
}

function parseDocRowsField(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.rows)) return doc.rows;
  try {
    return JSON.parse(doc.rows || '[]');
  } catch {
    return [];
  }
}

function buildDateRangeWhere(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return null;
  const range = {};
  if (dateFrom) {
    range[Op.gte] = new Date(String(dateFrom).slice(0, 10));
  }
  if (dateTo) {
    const end = new Date(String(dateTo).slice(0, 10));
    end.setHours(23, 59, 59, 999);
    range[Op.lte] = end;
  }
  return range;
}

router.get('/', async (req, res) => {
  try {
    const docs = await db.BarcodeDoc.findAll({
      order: [['created_at', 'DESC']],
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /print-log/summary — сводка по дням */
router.get('/print-log/summary', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const where = {};
    const printedAt = buildDateRangeWhere(date_from, date_to);
    if (printedAt) where.printed_at = printedAt;

    const rows = await BarcodePrintLog.findAll({
      where,
      attributes: [
        [db.sequelize.fn('DATE', db.sequelize.col('printed_at')), 'date'],
        [db.sequelize.fn('SUM', db.sequelize.col('quantity')), 'total_quantity'],
        [
          db.sequelize.fn(
            'COUNT',
            db.sequelize.fn('DISTINCT', db.sequelize.col('document_id'))
          ),
          'total_documents',
        ],
      ],
      group: [db.sequelize.fn('DATE', db.sequelize.col('printed_at'))],
      order: [[db.sequelize.fn('DATE', db.sequelize.col('printed_at')), 'DESC']],
      raw: true,
    });

    res.json(
      rows.map((r) => ({
        date: r.date,
        total_quantity: parseInt(r.total_quantity, 10) || 0,
        total_documents: parseInt(r.total_documents, 10) || 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /print-log — история печати */
router.get('/print-log', async (req, res) => {
  try {
    const { barcode_id, document_id, date_from, date_to, article } = req.query;
    const where = {};

    if (barcode_id != null && String(barcode_id).trim() !== '') {
      where.barcode_id = parseInt(barcode_id, 10);
    }
    if (document_id != null && String(document_id).trim() !== '') {
      where.document_id = parseInt(document_id, 10);
    }
    const printedAt = buildDateRangeWhere(date_from, date_to);
    if (printedAt) where.printed_at = printedAt;
    if (article != null && String(article).trim() !== '') {
      where.notes = { [Op.iLike]: `%${String(article).trim()}%` };
    }

    const logs = await BarcodePrintLog.findAll({
      where,
      include: [
        {
          model: db.BarcodeDoc,
          as: 'BarcodeDoc',
          attributes: ['id', 'tz', 'name', 'rows'],
        },
        {
          model: db.User,
          as: 'User',
          attributes: ['id', 'name'],
        },
      ],
      order: [['printed_at', 'DESC']],
      limit: 500,
    });

    res.json(logs.map(formatPrintLogRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/print-log', async (req, res) => {
  try {
    const { barcode_id, quantity, document_id, notes } = req.body || {};
    const bid = parseInt(barcode_id, 10);
    const qty = parseInt(quantity, 10);

    if (!Number.isFinite(bid) || bid <= 0) {
      return res.status(400).json({ error: 'barcode_id required' });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity must be > 0' });
    }

    const doc = await db.BarcodeDoc.findByPk(bid);
    if (!doc) {
      return res.status(404).json({ error: 'Документ штрихкода не найден' });
    }

    let docId = null;
    if (document_id != null && String(document_id).trim() !== '') {
      docId = parseInt(document_id, 10);
      if (!Number.isFinite(docId)) docId = bid;
    } else {
      docId = bid;
    }

    const row = await BarcodePrintLog.create({
      barcode_id: bid,
      quantity: qty,
      printed_at: new Date(),
      printed_by: req.user?.id || null,
      document_id: docId,
      notes: notes != null ? String(notes) : null,
    });

    const full = await BarcodePrintLog.findByPk(row.id, {
      include: [
        { model: db.BarcodeDoc, as: 'BarcodeDoc', attributes: ['id', 'tz', 'name'] },
        { model: db.User, as: 'User', attributes: ['id', 'name'] },
      ],
    });

    res.status(201).json(formatPrintLogRow(full));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /catalog — справочник строк штрихкодов для выбора в документе печати */
router.get('/catalog', async (req, res) => {
  try {
    const { q } = req.query;
    const search = q != null ? String(q).trim().toLowerCase() : '';
    const docs = await db.BarcodeDoc.findAll({
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    const catalog = [];
    for (const doc of docs) {
      const plain = doc.get({ plain: true });
      const rows = parseDocRowsField(plain);
      rows.forEach((row, rowIndex) => {
        const entry = {
          key: `${plain.id}:${rowIndex}`,
          barcode_id: plain.id,
          row_index: rowIndex,
          tz: plain.tz || '',
          article: String(row.article || '').trim(),
          color: String(row.color || '').trim(),
          size: String(row.size || '').trim(),
          barcode: String(row.barcode || '').trim(),
        };
        if (!search) {
          catalog.push(entry);
          return;
        }
        const hay = [
          entry.tz,
          entry.article,
          entry.color,
          entry.size,
          entry.barcode,
          plain.name,
        ]
          .join(' ')
          .toLowerCase();
        if (hay.includes(search)) catalog.push(entry);
      });
    }
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const printDocsRouter = require('./barcode-print-docs');
router.use('/barcode-print-docs', printDocsRouter);

/** GET /documents/:id — документ штрихкодов с позициями для заполнения печати */
router.get('/documents/:id', async (req, res) => {
  try {
    const doc = await db.BarcodeDoc.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });

    const plain = doc.get({ plain: true });
    const rows = parseDocRowsField(plain);
    const items = rows.map((row, rowIndex) => ({
      row_index: rowIndex,
      article: String(row.article || '').trim(),
      color: String(row.color || '').trim(),
      size: String(row.size || '').trim(),
      barcode: String(row.barcode || '').trim(),
      quantity: parseInt(row.qty ?? row.quantity ?? 1, 10) || 1,
    }));

    res.json({
      id: plain.id,
      tz: plain.tz || '',
      name: plain.name || '',
      note: plain.note || '',
      items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const doc = await db.BarcodeDoc.create(req.body);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.BarcodeDoc.destroy({
      where: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
