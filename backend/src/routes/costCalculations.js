/**
 * Себестоимость по заказу
 */

const express = require('express');
const db = require('../models');

const router = express.Router();

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : NaN;
}

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

router.get('/order/:order_id', async (req, res, next) => {
  try {
    const orderId = toInt(req.params.order_id);
    if (Number.isNaN(orderId) || orderId < 1) {
      return res.status(400).json({ error: 'Некорректный order_id' });
    }
    const order = await db.Order.findByPk(orderId, { attributes: ['id'] });
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });

    let calc = await db.CostCalculation.findOne({
      where: { order_id: orderId },
      include: [{ model: db.CostCalculationItem, as: 'Items' }],
    });
    if (!calc) {
      calc = await db.CostCalculation.create({ order_id: orderId });
      calc.Items = [];
      const plain = calc.get({ plain: true });
      plain.Items = [];
      return res.json(plain);
    }
    res.json(calc.get({ plain: true }));
  } catch (err) {
    next(err);
  }
});

router.post('/order/:order_id', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const orderId = toInt(req.params.order_id);
    if (Number.isNaN(orderId) || orderId < 1) {
      await t.rollback();
      return res.status(400).json({ error: 'Некорректный order_id' });
    }
    const order = await db.Order.findByPk(orderId, { attributes: ['id'], transaction: t, lock: t.LOCK.UPDATE });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const {
      cutting_fabric_qty,
      cutting_fabric_sum,
      cutting_accessories_qty,
      cutting_accessories_sum,
      cutting_output_qty,
      cutting_op_cost_per_unit,
      sewing_accessories_qty,
      sewing_accessories_sum,
      sewing_output_qty,
      sewing_op_cost_per_unit,
      otk_accessories_qty,
      otk_accessories_sum,
      otk_output_qty,
      otk_op_cost_per_unit,
      items = [],
    } = req.body || {};

    const cutting_op_total = toMoney(
      num(cutting_output_qty, 0) * num(cutting_op_cost_per_unit, 0)
    );
    const cutting_cost_total = toMoney(
      num(cutting_fabric_sum, 0) + num(cutting_accessories_sum, 0) + cutting_op_total
    );

    const sewing_op_total = toMoney(num(sewing_output_qty, 0) * num(sewing_op_cost_per_unit, 0));
    const sewing_cost_total = toMoney(
      cutting_cost_total + num(sewing_accessories_sum, 0) + sewing_op_total
    );

    const otk_op_total = toMoney(num(otk_output_qty, 0) * num(otk_op_cost_per_unit, 0));
    const otk_cost_total = toMoney(sewing_cost_total + num(otk_accessories_sum, 0) + otk_op_total);

    const total_cost = otk_cost_total;
    const final_qty =
      Math.round(num(otk_output_qty, 0)) ||
      Math.round(num(sewing_output_qty, 0)) ||
      Math.round(num(cutting_output_qty, 0));
    const cost_per_unit = final_qty > 0 ? toMoney(total_cost / final_qty) : 0;

    let calc = await db.CostCalculation.findOne({
      where: { order_id: orderId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!calc) {
      calc = await db.CostCalculation.create(
        { order_id: orderId },
        { transaction: t }
      );
    }

    const data = {
      order_id: orderId,
      cutting_fabric_qty: toMoney(cutting_fabric_qty),
      cutting_fabric_sum: toMoney(cutting_fabric_sum),
      cutting_accessories_qty: toMoney(cutting_accessories_qty),
      cutting_accessories_sum: toMoney(cutting_accessories_sum),
      cutting_output_qty: Math.max(0, Math.round(num(cutting_output_qty, 0))),
      cutting_op_cost_per_unit: toMoney(cutting_op_cost_per_unit),
      cutting_op_total,
      cutting_cost_total,
      sewing_accessories_qty: toMoney(sewing_accessories_qty),
      sewing_accessories_sum: toMoney(sewing_accessories_sum),
      sewing_output_qty: Math.max(0, Math.round(num(sewing_output_qty, 0))),
      sewing_op_cost_per_unit: toMoney(sewing_op_cost_per_unit),
      sewing_op_total,
      sewing_cost_total,
      otk_accessories_qty: toMoney(otk_accessories_qty),
      otk_accessories_sum: toMoney(otk_accessories_sum),
      otk_output_qty: Math.max(0, Math.round(num(otk_output_qty, 0))),
      otk_op_cost_per_unit: toMoney(otk_op_cost_per_unit),
      otk_op_total,
      otk_cost_total,
      total_cost,
      cost_per_unit,
      status: 'calculated',
    };

    await calc.update(data, { transaction: t });

    await db.CostCalculationItem.destroy({
      where: { cost_calculation_id: calc.id },
      transaction: t,
    });

    const rows = Array.isArray(items) ? items : [];
    for (const item of rows) {
      const qty = num(item.qty, 0);
      const price = num(item.price, 0);
      await db.CostCalculationItem.create(
        {
          cost_calculation_id: calc.id,
          stage: item.stage != null ? String(item.stage).slice(0, 50) : null,
          material_type: item.material_type != null ? String(item.material_type).slice(0, 50) : null,
          material_name: item.material_name != null ? String(item.material_name) : null,
          qty: toMoney(qty),
          unit: item.unit != null ? String(item.unit).slice(0, 50) : null,
          price: toMoney(price),
          total_sum: toMoney(qty * price),
          note: item.note != null ? String(item.note) : null,
        },
        { transaction: t }
      );
    }

    await t.commit();

    const result = await db.CostCalculation.findByPk(calc.id, {
      include: [{ model: db.CostCalculationItem, as: 'Items' }],
    });
    res.json(result.get({ plain: true }));
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

module.exports = router;
