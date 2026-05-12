const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');

const router = express.Router();
const STAGES = ['purchase', 'cutting', 'sewing', 'otk', 'shipment'];
const VALID_STATUSES = ['draft', 'approved'];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIntOrNaN(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/** Сумма строки для API списка: явный total_sum или факт × цена */
function lineTotalSum(item) {
  const factQty = toNum(item?.fact_qty ?? item?.quantity);
  const price = toNum(item?.price ?? item?.price_per_unit);
  const explicit = toNum(item?.total_sum);
  return explicit || factQty * price;
}

async function nextDocNumber(stage, transaction) {
  const last = await db.StageReport.findOne({ order: [['id', 'DESC']], attributes: ['id'], transaction });
  const prefix = stage === 'purchase' ? 'ЗКП' : 'ОТЧ';
  return `${prefix}-${String((last?.id || 0) + 1).padStart(3, '0')}`;
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      name: String(it?.name || '').trim(),
      unit: String(it?.unit || '').trim() || null,
      material_type: it?.material_type === 'accessories' ? 'accessories' : (it?.material_type === 'fabric' ? 'fabric' : null),
      warehouse_id: it?.warehouse_id && !Number.isNaN(toIntOrNaN(it.warehouse_id)) ? toIntOrNaN(it.warehouse_id) : null,
      plan_qty: toNum(it?.plan_qty),
      fact_qty: toNum(it?.fact_qty),
      price: toNum(it?.price),
      supplier: String(it?.supplier || '').trim() || null,
      note: String(it?.note || '').trim() || null,
    }))
    .filter((it) => it.name);
}

router.get('/meta/users', async (req, res, next) => {
  try {
    const users = await db.User.findAll({ attributes: ['id', 'name', 'role'], order: [['name', 'ASC']] });
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    const stage = req.query.stage;
    const status = req.query.status;
    const orderId = parseInt(req.query.order_id, 10);
    const dateFrom = req.query.date_from;
    const dateTo = req.query.date_to;

    if (stage && stage !== 'undefined' && stage !== 'null' && STAGES.includes(String(stage))) {
      where.stage = String(stage);
    }
    if (status && VALID_STATUSES.includes(String(status))) {
      where.status = String(status);
    }
    if (!Number.isNaN(orderId) && orderId > 0) {
      where.order_id = orderId;
    }
    if (
      dateFrom &&
      dateFrom !== 'undefined' &&
      dateFrom !== 'Invalid date' &&
      !Number.isNaN(new Date(dateFrom).getTime())
    ) {
      where.created_at = {
        ...where.created_at,
        [Op.gte]: new Date(dateFrom),
      };
    }
    if (
      dateTo &&
      dateTo !== 'undefined' &&
      dateTo !== 'Invalid date' &&
      !Number.isNaN(new Date(dateTo).getTime())
    ) {
      where.created_at = {
        ...where.created_at,
        [Op.lte]: new Date(dateTo),
      };
    }
    const rows = await db.StageReport.findAll({
      where,
      include: [
        { model: db.Order, as: 'Order', attributes: ['id', 'tz_code', 'model_name', 'total_quantity'] },
        { model: db.User, as: 'User', attributes: ['id', 'name'] },
        { model: db.Workshop, as: 'Workshop', attributes: ['id', 'name'] },
        {
          model: db.StageReportItem,
          as: 'Items',
          attributes: ['id', 'name', 'unit', 'material_type', 'warehouse_id', 'plan_qty', 'fact_qty', 'price', 'supplier', 'note'],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    res.json(
      rows.map((r) => {
        const plain = r.get({ plain: true });
        const rawItems = plain.Items || [];
        const items = rawItems.map((it) => ({
          ...it,
          total_sum: lineTotalSum(it),
        }));
        const docSum = items.reduce((acc, i) => acc + toNum(i.total_sum), 0);
        const totalPlan = rawItems.reduce((s, it) => s + toNum(it.plan_qty), 0);
        const totalFact = rawItems.reduce((s, it) => s + toNum(it.fact_qty), 0);
        return {
          ...plain,
          Items: items,
          total_sum: docSum,
          plan_total: totalPlan,
          fact_total: totalFact,
          progress_percent: totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0,
        };
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const body = req.body || {};
    if (!STAGES.includes(String(body.stage || ''))) {
      await t.rollback();
      return res.status(400).json({ error: 'Некорректный этап' });
    }
    const orderId = toIntOrNaN(body.order_id);
    if (Number.isNaN(orderId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const userId = body.user_id ? toIntOrNaN(body.user_id) : null;
    if (body.user_id && Number.isNaN(userId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const workshopId = body.workshop_id ? toIntOrNaN(body.workshop_id) : null;
    if (body.workshop_id && Number.isNaN(workshopId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const safeStatus = VALID_STATUSES.includes(String(body.status)) ? String(body.status) : 'draft';
    const items = normalizeItems(body.items);
    const row = await db.StageReport.create({
        doc_number: await nextDocNumber(body.stage, t),
      stage: body.stage,
      order_id: orderId,
      user_id: userId,
      workshop_id: workshopId,
      period_start: body.period_start || null,
      period_end: body.period_end || null,
      status: safeStatus,
      comment: body.comment ? String(body.comment).trim() : null,
    }, { transaction: t });
    if (items.length) {
      await db.StageReportItem.bulkCreate(items.map((it) => ({ ...it, report_id: row.id })), { transaction: t });
    }
    await t.commit();
    res.status(201).json(row);
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const row = await db.StageReport.findByPk(id, {
      include: [
        { model: db.Order, as: 'Order', attributes: ['id', 'tz_code', 'model_name', 'total_quantity'] },
        { model: db.User, as: 'User', attributes: ['id', 'name'] },
        { model: db.Workshop, as: 'Workshop', attributes: ['id', 'name'] },
        { model: db.StageReportItem, as: 'Items' },
      ],
    });
    if (!row) return res.status(404).json({ error: 'Отчет не найден' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const row = await db.StageReport.findByPk(id, { transaction: t });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ error: 'Отчет не найден' });
    }
    const body = req.body || {};
    if (row.status === 'approved') {
      const canEditApprovedPurchase =
        row.stage === 'purchase' &&
        body.allow_edit_approved === true &&
        ['admin', 'manager'].includes(req.user?.role);
      if (!canEditApprovedPurchase) {
        await t.rollback();
        return res.status(400).json({ error: 'Утвержденный отчет нельзя изменять' });
      }
    }
    const nextOrderId = body.order_id ? toIntOrNaN(body.order_id) : row.order_id;
    if (body.order_id && Number.isNaN(nextOrderId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const nextUserId = body.user_id ? toIntOrNaN(body.user_id) : null;
    if (body.user_id && Number.isNaN(nextUserId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const nextWorkshopId = body.workshop_id ? toIntOrNaN(body.workshop_id) : null;
    if (body.workshop_id && Number.isNaN(nextWorkshopId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    await row.update({
      order_id: nextOrderId,
      user_id: nextUserId,
      workshop_id: nextWorkshopId,
      period_start: body.period_start || null,
      period_end: body.period_end || null,
      comment: body.comment != null ? String(body.comment).trim() || null : row.comment,
    }, { transaction: t });
    const items = normalizeItems(body.items);
    await db.StageReportItem.destroy({ where: { report_id: row.id }, transaction: t });
    if (items.length) {
      await db.StageReportItem.bulkCreate(items.map((it) => ({ ...it, report_id: row.id })), { transaction: t });
    }
    await t.commit();
    res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const row = await db.StageReport.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ error: 'Отчет не найден' });
    }
    if (row.status === 'approved') {
      await t.rollback();
      return res.json({ ok: true });
    }
    if (row.stage === 'purchase') {
      const items = await db.StageReportItem.findAll({ where: { report_id: row.id }, transaction: t });
      for (const it of items) {
        const fact = toNum(it.fact_qty);
        const warehouseId = Number(it.warehouse_id || 0);
        if (!(fact > 0) || !warehouseId) continue;
        const type = it.material_type === 'accessories' ? 'accessories' : 'fabric';
        const [mat] = await db.WarehouseMaterial.findOrCreate({
          where: {
            name: it.name,
            type,
            unit: it.unit || 'шт',
            warehouse_id: warehouseId,
          },
          defaults: {
            name: it.name,
            type,
            unit: it.unit || 'шт',
            warehouse_id: warehouseId,
            qty: 0,
            price: toNum(it.price),
            received_at: new Date().toISOString().slice(0, 10),
          },
          transaction: t,
        });
        await mat.update(
          {
            qty: toNum(mat.qty) + fact,
            price: toNum(it.price) || toNum(mat.price),
          },
          { transaction: t }
        );
      }
    }
    await row.update({ status: 'approved' }, { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

module.exports = router;
