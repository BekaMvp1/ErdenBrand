/**
 * Документы отгрузки (цвет × размер)
 */

const express = require('express');
const db = require('../models');
const { reduceShipmentStockForShipment } = require('../utils/shipmentStock');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.order_id) {
      where.order_id = parseInt(req.query.order_id, 10);
    }
    const items = await db.ShipmentDocument.findAll({
      where,
      order: [['shipment_date', 'DESC'], ['created_at', 'DESC']],
    });
    res.json(items.map((r) => r.toJSON()));
  } catch (err) {
    console.error('[shipments GET]', err.message);
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const item = await db.ShipmentDocument.create(req.body);
    await reduceShipmentStockForShipment(db, req.body);
    res.status(201).json(item.toJSON());
  } catch (err) {
    console.error('[shipments POST]', err.message);
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db.ShipmentDocument.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[shipments DELETE]', err.message);
    next(err);
  }
});

module.exports = router;
