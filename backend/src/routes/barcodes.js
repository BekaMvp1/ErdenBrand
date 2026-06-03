/**
 * Документы штрихкодов — API
 */

const express = require('express');
const { BarcodeDoc } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const docs = await BarcodeDoc.findAll({
      order: [['created_at', 'DESC']],
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const doc = await BarcodeDoc.create(req.body);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await BarcodeDoc.destroy({
      where: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
