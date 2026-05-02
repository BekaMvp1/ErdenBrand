/**
 * Проверка: быстрый GET без запросов к planning_month_facts (см. setupStageFactsRoutes).
 * POST / PUT — общая реализация в dekatirovkaProverkaShared.js.
 */

const express = require('express');
const db = require('../models');
const { setupStageFactsRoutes } = require('./dekatirovkaProverkaShared');

const router = express.Router();
setupStageFactsRoutes(router, db.ProverkaFact, 'Proverka');

module.exports = router;
