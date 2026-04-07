/**
 * GET /api/production/daily-load — загрузка по дням (7 дней с сегодня)
 * GET /api/production/tasks-today — задачи по этапам на сегодня
 */

const express = require('express');
const pd = require('../services/productionDashboardData');

const router = express.Router();

router.get('/daily-load', async (req, res, next) => {
  try {
    const data = await pd.getDailyCapacityFromToday(7);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/tasks-today', async (req, res, next) => {
  try {
    const data = await pd.getTodayTasks();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
