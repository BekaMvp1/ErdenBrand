/**
 * Остаток товаров — API (раздел Отгрузка)
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
    const items = await db.Stock.findAll({
      where,
      order: [['created_at', 'DESC']],
    });
    res.json(items.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[stock GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const item = await upsertShipmentStock(db, req.body);
    if (!item) {
      return res.status(400).json({ error: 'quantity обязателен' });
    }
    res.status(201).json(item.toJSON());
  } catch (err) {
    console.error('[stock POST]', err.message);
    next(err);
  }
});

router.put('/:id/reduce', async (req, res, next) => {
  try {
    const item = await db.Stock.findByPk(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Not found' });
    }
    const newQty =
      parseInt(item.quantity, 10) - parseInt(req.body.quantity, 10);
    await item.update({
      quantity: Math.max(0, newQty),
      status: newQty <= 0 ? 'empty' : 'ready',
    });
    res.json(item.toJSON());
  } catch (err) {
    console.error('[stock reduce]', err.message);
    next(err);
  }
});

module.exports = router;
