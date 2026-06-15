/**
 * Отчёты раскроя — API
 */

const express = require('express');
const { CuttingReport } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const items = await CuttingReport.findAll({
      order: [['date', 'DESC']],
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = await CuttingReport.create(req.body);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await CuttingReport.destroy({
      where: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
