/**
 * Роуты справочника цехов
 * GET /api/workshops — список цехов
 * POST /api/workshops — добавить цех (admin/manager)
 * DELETE /api/workshops/:id — удалить/деактивировать цех
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

/**
 * GET /api/workshops
 * Список активных цехов
 */
router.get('/', async (req, res, next) => {
  try {
    const all = req.query.all === '1' && ['admin', 'manager'].includes(req.user?.role);
    const where = all ? {} : { is_active: true };
    const workshops = await db.Workshop.findAll({
      where,
      order: [['id']],
      attributes: ['id', 'name', 'floors_count', 'capacity', 'is_active'],
    });
    res.json(workshops);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/workshops
 * Добавить цех (admin/manager)
 */
router.post('/', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, floors_count } = req.body;
    const nameStr = name != null ? String(name).trim() : '';
    if (!nameStr) {
      return res.status(400).json({ error: 'Укажите название цеха' });
    }
    const fc = parseInt(floors_count, 10);
    const fcVal = (fc >= 1 && fc <= 10) ? fc : 1;
    const workshop = await db.Workshop.create({
      name: nameStr,
      floors_count: fcVal,
      is_active: true,
    });
    res.status(201).json(workshop);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Цех с таким названием уже существует' });
    }
    next(err);
  }
});

/**
 * DELETE /api/workshops/:id
 * Деактивировать цех (admin/manager). Нельзя удалить, если цех используется в заказах.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });
    const workshop = await db.Workshop.findByPk(id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });
    const used = await db.Order.count({ where: { workshop_id: id } });
    if (used > 0) {
      return res.status(400).json({ error: `Цех используется в ${used} заказах. Удаление невозможно.` });
    }
    await workshop.update({ is_active: false });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/workshops/:id/capacity
 * Обновить месячную мощность цеха (admin/manager)
 */
router.put('/:id/capacity', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Неверный ID' });

    const parsed = Number(req.body?.capacity);
    const capacity = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;

    const workshop = await db.Workshop.findByPk(id);
    if (!workshop) return res.status(404).json({ error: 'Цех не найден' });

    await workshop.update({ capacity });
    res.json({ ok: true, id, capacity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
