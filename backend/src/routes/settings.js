/**
 * Роуты настроек
 */

const express = require('express');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

/**
 * POST /api/settings/delete-all-orders
 * Удаление всех заказов (только admin)
 */
router.post('/delete-all-orders', async (req, res, next) => {
  let t;
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может удалять все заказы' });
    }

    t = await db.sequelize.transaction();

    const orders = await db.Order.findAll({ attributes: ['id'], transaction: t });
    const orderIds = orders.map((o) => o.id);

    for (const id of orderIds) {
      await db.OrderOperation.destroy({ where: { order_id: id }, transaction: t });
      await db.OrderFinanceLink.destroy({ where: { order_id: id }, transaction: t });
      await db.OrderFloorDistribution.destroy({ where: { order_id: id }, transaction: t });
    }
    await db.FinanceFact.update({ order_id: null }, { where: { order_id: orderIds }, transaction: t });
    await db.Order.destroy({ where: {}, transaction: t });

    await t.commit();
    await logAudit(req.user.id, 'DELETE_ALL', 'orders', orderIds.length);

    res.json({ ok: true, message: `Удалено заказов: ${orderIds.length}` });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    next(err);
  }
});

/**
 * GET /api/settings/production-cycle
 * Настройки опережения цикла (admin, manager).
 */
router.get('/production-cycle', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const row = await db.ProductionCycleSettings.findOne({ order: [['id', 'ASC']] });
    if (!row) {
      return res.json({
        purchaseLeadWeeks: 3,
        cuttingLeadWeeks: 2,
        otkLeadWeeks: 1,
        shippingLeadWeeks: 0,
      });
    }
    res.json({
      purchaseLeadWeeks: row.purchase_lead_weeks,
      cuttingLeadWeeks: row.cutting_lead_weeks,
      otkLeadWeeks: row.otk_lead_weeks ?? 1,
      shippingLeadWeeks: row.shipping_lead_weeks ?? 0,
    });
  } catch (err) {
    console.error('[settings/production-cycle GET]', err.message);
    next(err);
  }
});

/**
 * POST /api/settings/production-cycle
 * body: { purchaseLeadWeeks, cuttingLeadWeeks, otkLeadWeeks?, shippingLeadWeeks? }
 */
router.post('/production-cycle', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    const p = Math.min(8, Math.max(1, parseInt(req.body?.purchaseLeadWeeks, 10) || 3));
    const c = Math.min(6, Math.max(1, parseInt(req.body?.cuttingLeadWeeks, 10) || 2));
    const otkRaw = parseInt(req.body?.otkLeadWeeks, 10);
    const shipRaw = parseInt(req.body?.shippingLeadWeeks, 10);
    const o = Math.min(4, Math.max(0, Number.isFinite(otkRaw) ? otkRaw : 1));
    const s = Math.min(4, Math.max(0, Number.isFinite(shipRaw) ? shipRaw : 0));
    let row = await db.ProductionCycleSettings.findByPk(1);
    if (!row) {
      row = await db.ProductionCycleSettings.create({
        purchase_lead_weeks: p,
        cutting_lead_weeks: c,
        otk_lead_weeks: o,
        shipping_lead_weeks: s,
        updated_by: req.user.id,
      });
    } else {
      await row.update({
        purchase_lead_weeks: p,
        cutting_lead_weeks: c,
        otk_lead_weeks: o,
        shipping_lead_weeks: s,
        updated_by: req.user.id,
      });
    }
    await row.reload();
    await logAudit(req.user.id, 'UPDATE', 'production_cycle_settings', row.id);
    res.json({
      purchaseLeadWeeks: row.purchase_lead_weeks,
      cuttingLeadWeeks: row.cutting_lead_weeks,
      otkLeadWeeks: row.otk_lead_weeks ?? 1,
      shippingLeadWeeks: row.shipping_lead_weeks ?? 0,
    });
  } catch (err) {
    console.error('[settings/production-cycle POST]', err.message);
    next(err);
  }
});

module.exports = router;
