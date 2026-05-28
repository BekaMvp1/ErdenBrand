/**
 * Приёмка товаров — API
 */

const express = require('express');
const db = require('../models');
const { upsertShipmentStock } = require('../utils/shipmentStock');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.order_id) {
      where.order_id = parseInt(req.query.order_id, 10);
    }
    const items = await db.Reception.findAll({
      where,
      order: [['reception_date', 'DESC'], ['created_at', 'DESC']],
    });
    res.json(items.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[receptions GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const total = parseInt(req.body.total_received, 10) || 0;
    const defects = parseInt(req.body.defect_count, 10) || 0;
    const accepted =
      req.body.accepted_count != null
        ? parseInt(req.body.accepted_count, 10)
        : Math.max(0, total - defects);

    const item = await db.Reception.create({
      ...req.body,
      total_received: total,
      defect_count: defects,
      accepted_count: accepted,
    });

    if (accepted > 0 && req.body.order_id) {
      await upsertShipmentStock(db, {
        order_id: req.body.order_id,
        order_number: req.body.order_number,
        order_name: req.body.order_name,
        client: req.body.client || '',
        color: req.body.color || null,
        size: req.body.size || null,
        quantity: accepted,
        source: 'reception',
      });
    }

    res.status(201).json(item.toJSON());
  } catch (err) {
    console.error('[receptions POST]', err.message);
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db.Reception.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[receptions DELETE]', err.message);
    next(err);
  }
});

module.exports = router;
