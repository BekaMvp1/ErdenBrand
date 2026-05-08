/**
 * Роуты склада
 * MVP: остатки, приход/расход, привязка расхода к заказу
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { logAudit } = require('../utils/audit');

const router = express.Router();

const VALID_UNITS = ['РУЛОН', 'КГ', 'ТОННА', 'ШТ'];
const VALID_MOVEMENT_TYPES = ['ПРИХОД', 'РАСХОД'];
const VALID_MATERIAL_TYPES = ['fabric', 'accessories'];

function toMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function toIntOrNaN(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

async function nextMovementDocNumber(transaction) {
  const last = await db.MovementDocument.findOne({
    order: [['id', 'DESC']],
    attributes: ['id'],
    transaction,
  });
  const nextId = (last?.id || 0) + 1;
  return `ПМ-${String(nextId).padStart(3, '0')}`;
}

function sanitizeDocItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => ({
      item_id: it?.item_id != null && !Number.isNaN(toIntOrNaN(it.item_id)) ? toIntOrNaN(it.item_id) : null,
      item_name: String(it?.item_name || '').trim(),
      unit: String(it?.unit || '').trim() || null,
      qty: toMoney(it?.qty),
      price: toMoney(it?.price),
    }))
    .filter((it) => it.item_name && it.qty > 0);
}

/**
 * GET /api/warehouse/items
 * Список складских позиций с остатками
 */
router.get('/items', async (req, res, next) => {
  try {
    const items = await db.WarehouseItem.findAll({
      order: [['name']],
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse/items
 * Создать позицию (admin/manager)
 */
router.post('/items', async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { name, unit } = req.body;
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Укажите наименование' });
    }
    if (!unit || !VALID_UNITS.includes(unit)) {
      return res.status(400).json({ error: 'Единица: РУЛОН, КГ, ТОННА или ШТ' });
    }
    const item = await db.WarehouseItem.create({
      name: String(name).trim(),
      unit,
      stock_quantity: 0,
    });
    await logAudit(req.user.id, 'CREATE', 'warehouse_item', item.id);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/warehouse/movements
 * Приход или расход
 * body: { item_id, type: 'ПРИХОД'|'РАСХОД', quantity, order_id?, comment? }
 */
router.post('/movements', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    if (!['admin', 'manager'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    const { item_id, type, quantity, order_id, comment, movement_kind, ref_id, from_warehouse_id, to_warehouse_id, moved_at, item_name } = req.body;

    // New transfer mode: goods/materials/wip
    if (movement_kind) {
      if (!['goods', 'materials', 'wip'].includes(String(movement_kind))) {
        await t.rollback();
        return res.status(400).json({ error: 'Тип перемещения: goods/materials/wip' });
      }
      const fromId = toIntOrNaN(from_warehouse_id);
      const toId = toIntOrNaN(to_warehouse_id);
      const qty = Number(quantity ?? req.body.qty);
      if (Number.isNaN(fromId) || Number.isNaN(toId) || !fromId || !toId || fromId === toId) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid ID' });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        await t.rollback();
        return res.status(400).json({ error: 'Количество должно быть больше 0' });
      }

      let name = String(item_name || '').trim();
      if (movement_kind === 'goods') {
        const refId = toIntOrNaN(ref_id);
        if (Number.isNaN(refId)) {
          await t.rollback();
          return res.status(400).json({ error: 'Invalid ID' });
        }
        const source = await db.WarehouseGood.findByPk(refId, { transaction: t });
        if (!source) {
          await t.rollback();
          return res.status(404).json({ error: 'Товар не найден' });
        }
        if (Number(source.warehouse_id) !== fromId) {
          await t.rollback();
          return res.status(400).json({ error: 'Товар не принадлежит складу "Откуда"' });
        }
        const srcQty = Number(source.qty) || 0;
        if (srcQty < qty) {
          await t.rollback();
          return res.status(400).json({ error: `Недостаточно остатка. Доступно: ${srcQty}` });
        }
        name = source.name;
        await source.update({ qty: srcQty - qty }, { transaction: t });
        const [dest] = await db.WarehouseGood.findOrCreate({
          where: {
            name: source.name,
            article: source.article || null,
            warehouse_id: toId,
          },
          defaults: {
            name: source.name,
            article: source.article,
            photo: source.photo,
            warehouse_id: toId,
            qty: 0,
            price: source.price || 0,
            received_at: moved_at || source.received_at || null,
          },
          transaction: t,
        });
        await dest.update({ qty: (Number(dest.qty) || 0) + qty }, { transaction: t });
      } else if (movement_kind === 'materials') {
        const refId = toIntOrNaN(ref_id);
        if (Number.isNaN(refId)) {
          await t.rollback();
          return res.status(400).json({ error: 'Invalid ID' });
        }
        const source = await db.WarehouseMaterial.findByPk(refId, { transaction: t });
        if (!source) {
          await t.rollback();
          return res.status(404).json({ error: 'Материал не найден' });
        }
        if (Number(source.warehouse_id) !== fromId) {
          await t.rollback();
          return res.status(400).json({ error: 'Материал не принадлежит складу "Откуда"' });
        }
        const srcQty = Number(source.qty) || 0;
        if (srcQty < qty) {
          await t.rollback();
          return res.status(400).json({ error: `Недостаточно остатка. Доступно: ${srcQty}` });
        }
        name = source.name;
        await source.update({ qty: srcQty - qty }, { transaction: t });
        const [dest] = await db.WarehouseMaterial.findOrCreate({
          where: {
            name: source.name,
            type: source.type,
            unit: source.unit,
            warehouse_id: toId,
          },
          defaults: {
            name: source.name,
            type: source.type,
            unit: source.unit,
            warehouse_id: toId,
            qty: 0,
            price: source.price || 0,
            received_at: moved_at || source.received_at || null,
          },
          transaction: t,
        });
        await dest.update({ qty: (Number(dest.qty) || 0) + qty }, { transaction: t });
      } else {
        if (!name) {
          await t.rollback();
          return res.status(400).json({ error: 'Укажите наименование НЗП' });
        }
      }

      const moved = await db.WarehouseMovement.create({
        movement_kind,
        ref_id: toIntOrNaN(ref_id) || null,
        item_name: name || null,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        qty,
        moved_at: moved_at || new Date().toISOString().slice(0, 10),
        user_id: req.user?.id || null,
        comment: comment ? String(comment).trim() : null,
        // legacy columns kept for compatibility:
        type: 'РАСХОД',
        quantity: qty,
        item_id: null,
        order_id: null,
      }, { transaction: t });

      await t.commit();
      return res.status(201).json(moved);
    }

    const itemId = toIntOrNaN(item_id);
    if (Number.isNaN(itemId) || !itemId) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    if (!type || !VALID_MOVEMENT_TYPES.includes(type)) {
      await t.rollback();
      return res.status(400).json({ error: 'Тип: ПРИХОД или РАСХОД' });
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Количество должно быть больше 0' });
    }

    const item = await db.WarehouseItem.findByPk(itemId, { transaction: t });
    if (!item) {
      await t.rollback();
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    const currentStock = parseFloat(item.stock_quantity) || 0;
    let newStock;
    if (type === 'ПРИХОД') {
      newStock = currentStock + qty;
    } else {
      if (currentStock < qty) {
        await t.rollback();
        return res.status(400).json({ error: `Недостаточно остатка. На складе: ${currentStock}` });
      }
      newStock = currentStock - qty;
    }

    await db.WarehouseMovement.create({
      item_id: itemId,
      type,
      quantity: qty,
      order_id: order_id || null,
      comment: comment ? String(comment).trim() : null,
    }, { transaction: t });

    await item.update({ stock_quantity: newStock }, { transaction: t });
    await t.commit();

    await logAudit(req.user.id, 'CREATE', 'warehouse_movement', itemId);
    const updated = await db.WarehouseItem.findByPk(itemId);
    res.status(201).json(updated);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

/**
 * GET /api/warehouse/movements
 * История движений (опционально по item_id, order_id)
 */
router.get('/movements', async (req, res, next) => {
  try {
    const { item_id, order_id, movement_kind, from_warehouse_id, to_warehouse_id, date_from, date_to } = req.query;
    const where = {};
    if (item_id) where.item_id = item_id;
    if (order_id) where.order_id = order_id;
    if (movement_kind) where.movement_kind = movement_kind;
    if (from_warehouse_id) {
      const fromId = toIntOrNaN(from_warehouse_id);
      if (Number.isNaN(fromId)) return res.status(400).json({ error: 'Invalid ID' });
      where.from_warehouse_id = fromId;
    }
    if (to_warehouse_id) {
      const toId = toIntOrNaN(to_warehouse_id);
      if (Number.isNaN(toId)) return res.status(400).json({ error: 'Invalid ID' });
      where.to_warehouse_id = toId;
    }
    if (date_from || date_to) {
      where.moved_at = {};
      if (date_from) where.moved_at[Op.gte] = String(date_from).slice(0, 10);
      if (date_to) where.moved_at[Op.lte] = String(date_to).slice(0, 10);
    }

    const movements = await db.WarehouseMovement.findAll({
      where,
      include: [
        { model: db.WarehouseItem, as: 'WarehouseItem' },
        { model: db.Order, as: 'Order', include: [{ model: db.Client, as: 'Client' }] },
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.User, as: 'User', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 500,
    });
    res.json(movements);
  } catch (err) {
    next(err);
  }
});

// ---------- NEW WAREHOUSE LEDGER API ----------

router.get('/warehouses', async (req, res, next) => {
  try {
    const list = await db.WarehouseRef.findAll({ order: [['id', 'ASC']] });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

router.post('/warehouses', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название склада' });
    const row = await db.WarehouseRef.create({ name: name.slice(0, 120) });
    res.status(201).json(row);
  } catch (err) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Склад с таким названием уже существует' });
    }
    next(err);
  }
});

router.delete('/warehouses/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id) || !id) return res.status(400).json({ error: 'Invalid ID' });

    const row = await db.WarehouseRef.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Склад не найден' });

    const [goodsCount, materialsCount] = await Promise.all([
      db.WarehouseGood.count({ where: { warehouse_id: id } }),
      db.WarehouseMaterial.count({ where: { warehouse_id: id } }),
    ]);
    if (goodsCount > 0 || materialsCount > 0) {
      return res.status(400).json({ error: 'Нельзя удалить склад с остатками/позициями' });
    }

    await row.destroy();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/goods', async (req, res, next) => {
  try {
    const { warehouse_id, q } = req.query;
    const where = {};
    if (warehouse_id) {
      const warehouseId = toIntOrNaN(warehouse_id);
      if (Number.isNaN(warehouseId)) return res.status(400).json({ error: 'Invalid ID' });
      where.warehouse_id = warehouseId;
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where[Op.or] = [{ name: { [Op.iLike]: term } }, { article: { [Op.iLike]: term } }];
    }
    const rows = await db.WarehouseGood.findAll({
      where,
      include: [{ model: db.WarehouseRef, as: 'Warehouse', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/goods', async (req, res, next) => {
  try {
    const body = req.body || {};
    const payload = {
      name: String(body.name || '').trim(),
      article: String(body.article || '').trim() || null,
      photo: String(body.photo || '').trim() || null,
      warehouse_id: toIntOrNaN(body.warehouse_id),
      qty: toMoney(body.qty),
      price: toMoney(body.price),
      received_at: body.received_at || null,
    };
    if (!payload.name) return res.status(400).json({ error: 'Укажите наименование' });
    if (!payload.warehouse_id) return res.status(400).json({ error: 'Укажите склад' });
    const row = await db.WarehouseGood.create(payload);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/goods/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const row = await db.WarehouseGood.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Товар не найден' });
    const body = req.body || {};
    if (body.warehouse_id != null && Number.isNaN(toIntOrNaN(body.warehouse_id))) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    await row.update({
      name: body.name != null ? String(body.name).trim() : row.name,
      article: body.article != null ? String(body.article).trim() || null : row.article,
      photo: body.photo != null ? String(body.photo).trim() || null : row.photo,
      warehouse_id: body.warehouse_id != null ? toIntOrNaN(body.warehouse_id) : row.warehouse_id,
      qty: body.qty != null ? toMoney(body.qty) : row.qty,
      price: body.price != null ? toMoney(body.price) : row.price,
      received_at: body.received_at != null ? (body.received_at || null) : row.received_at,
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/goods/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const deleted = await db.WarehouseGood.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'Товар не найден' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/materials', async (req, res, next) => {
  try {
    const { warehouse_id, type, q } = req.query;
    const where = {};
    if (warehouse_id) {
      const warehouseId = toIntOrNaN(warehouse_id);
      if (Number.isNaN(warehouseId)) return res.status(400).json({ error: 'Invalid ID' });
      where.warehouse_id = warehouseId;
    }
    if (type && VALID_MATERIAL_TYPES.includes(String(type))) where.type = String(type);
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where.name = { [Op.iLike]: term };
    }
    const rows = await db.WarehouseMaterial.findAll({
      where,
      include: [{ model: db.WarehouseRef, as: 'Warehouse', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/materials', async (req, res, next) => {
  try {
    const body = req.body || {};
    const type = String(body.type || '');
    if (!VALID_MATERIAL_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Тип должен быть fabric или accessories' });
    }
    const payload = {
      name: String(body.name || '').trim(),
      type,
      unit: String(body.unit || 'шт').trim() || 'шт',
      warehouse_id: toIntOrNaN(body.warehouse_id),
      qty: toMoney(body.qty),
      price: toMoney(body.price),
      received_at: body.received_at || null,
    };
    if (!payload.name) return res.status(400).json({ error: 'Укажите наименование' });
    if (!payload.warehouse_id) return res.status(400).json({ error: 'Укажите склад' });
    const row = await db.WarehouseMaterial.create(payload);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/materials/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const row = await db.WarehouseMaterial.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Материал не найден' });
    const body = req.body || {};
    if (body.warehouse_id != null && Number.isNaN(toIntOrNaN(body.warehouse_id))) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const nextType = body.type != null ? String(body.type) : row.type;
    if (!VALID_MATERIAL_TYPES.includes(nextType)) {
      return res.status(400).json({ error: 'Тип должен быть fabric или accessories' });
    }
    await row.update({
      name: body.name != null ? String(body.name).trim() : row.name,
      type: nextType,
      unit: body.unit != null ? String(body.unit).trim() || 'шт' : row.unit,
      warehouse_id: body.warehouse_id != null ? toIntOrNaN(body.warehouse_id) : row.warehouse_id,
      qty: body.qty != null ? toMoney(body.qty) : row.qty,
      price: body.price != null ? toMoney(body.price) : row.price,
      received_at: body.received_at != null ? (body.received_at || null) : row.received_at,
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/materials/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const deleted = await db.WarehouseMaterial.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'Материал не найден' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/movement-docs', async (req, res, next) => {
  try {
    const { date_from, date_to, move_type, status } = req.query;
    const where = {};
    if (move_type) where.move_type = String(move_type);
    if (status) where.status = String(status);
    if (date_from || date_to) {
      where.doc_date = {};
      if (date_from) where.doc_date[Op.gte] = String(date_from).slice(0, 10);
      if (date_to) where.doc_date[Op.lte] = String(date_to).slice(0, 10);
    }

    const rows = await db.MovementDocument.findAll({
      where,
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items', attributes: ['id', 'qty', 'price'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    res.json(
      rows.map((d) => {
        const items = d.Items || [];
        const total_qty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
        const total_sum = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
        return {
          ...d.toJSON(),
          items_count: items.length,
          total_qty: toMoney(total_qty),
          total_sum: toMoney(total_sum),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

router.post('/movement-docs', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const body = req.body || {};
    const move_type = String(body.move_type || '');
    const from_warehouse_id = toIntOrNaN(body.from_warehouse_id);
    const to_warehouse_id = toIntOrNaN(body.to_warehouse_id);
    const status = body.status === 'posted' ? 'posted' : 'draft';
    const items = sanitizeDocItems(body.items);
    if (!['goods', 'materials', 'wip'].includes(move_type)) {
      await t.rollback();
      return res.status(400).json({ error: 'move_type: goods/materials/wip' });
    }
    if (!from_warehouse_id || !to_warehouse_id || from_warehouse_id === to_warehouse_id) {
      await t.rollback();
      return res.status(400).json({ error: 'Укажите корректные склады Откуда/Куда' });
    }
    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
    }

    const row = await db.MovementDocument.create(
      {
        doc_number: await nextMovementDocNumber(t),
        doc_date: body.doc_date || new Date().toISOString().slice(0, 10),
        move_type,
        from_warehouse_id,
        to_warehouse_id,
        comment: body.comment ? String(body.comment).trim() : null,
        status,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );
    await db.MovementDocumentItem.bulkCreate(items.map((it) => ({ ...it, document_id: row.id })), { transaction: t });
    await t.commit();
    const created = await db.MovementDocument.findByPk(row.id, { include: [{ model: db.MovementDocumentItem, as: 'Items' }] });
    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

router.get('/movement-docs/:id', async (req, res, next) => {
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const row = await db.MovementDocument.findByPk(id, {
      include: [
        { model: db.WarehouseRef, as: 'FromWarehouse', attributes: ['id', 'name'] },
        { model: db.WarehouseRef, as: 'ToWarehouse', attributes: ['id', 'name'] },
        { model: db.MovementDocumentItem, as: 'Items' },
      ],
    });
    if (!row) return res.status(404).json({ error: 'Документ не найден' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.put('/movement-docs/:id', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const row = await db.MovementDocument.findByPk(id, { transaction: t });
    if (!row) {
      await t.rollback();
      return res.status(404).json({ error: 'Документ не найден' });
    }
    if (row.status === 'posted') {
      await t.rollback();
      return res.status(400).json({ error: 'Проведенный документ нельзя изменять' });
    }

    const body = req.body || {};
    const items = sanitizeDocItems(body.items);
    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Добавьте хотя бы одну позицию' });
    }

    const nextFromWarehouseId = toIntOrNaN(body.from_warehouse_id || row.from_warehouse_id);
    const nextToWarehouseId = toIntOrNaN(body.to_warehouse_id || row.to_warehouse_id);
    if (Number.isNaN(nextFromWarehouseId) || Number.isNaN(nextToWarehouseId)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }

    await row.update(
      {
        doc_date: body.doc_date || row.doc_date,
        move_type: body.move_type || row.move_type,
        from_warehouse_id: nextFromWarehouseId,
        to_warehouse_id: nextToWarehouseId,
        comment: body.comment != null ? String(body.comment).trim() || null : row.comment,
      },
      { transaction: t }
    );
    await db.MovementDocumentItem.destroy({ where: { document_id: row.id }, transaction: t });
    await db.MovementDocumentItem.bulkCreate(items.map((it) => ({ ...it, document_id: row.id })), { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

router.post('/movement-docs/:id/post', async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const id = toIntOrNaN(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      return res.status(400).json({ error: 'Invalid ID' });
    }
    const doc = await db.MovementDocument.findByPk(id, {
      include: [{ model: db.MovementDocumentItem, as: 'Items' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!doc) {
      await t.rollback();
      return res.status(404).json({ error: 'Документ не найден' });
    }
    if (doc.status === 'posted') {
      await t.rollback();
      return res.status(400).json({ error: 'Документ уже проведен' });
    }

    const fromId = Number(doc.from_warehouse_id);
    const toId = Number(doc.to_warehouse_id);
    for (const it of doc.Items || []) {
      const qty = Number(it.qty || 0);
      if (!(qty > 0)) continue;
      if (doc.move_type === 'goods') {
        const source = await db.WarehouseGood.findByPk(it.item_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!source || Number(source.warehouse_id) !== fromId) {
          await t.rollback();
          return res.status(400).json({ error: `Товар "${it.item_name}" не найден на складе отправителя` });
        }
        if (Number(source.qty || 0) < qty) {
          await t.rollback();
          return res.status(400).json({ error: `Недостаточно остатка для "${it.item_name}"` });
        }
        await source.update({ qty: toMoney(Number(source.qty || 0) - qty) }, { transaction: t });
        const [dest] = await db.WarehouseGood.findOrCreate({
          where: { name: source.name, article: source.article || null, warehouse_id: toId },
          defaults: {
            name: source.name,
            article: source.article,
            photo: source.photo,
            warehouse_id: toId,
            qty: 0,
            price: source.price || it.price || 0,
            received_at: doc.doc_date,
          },
          transaction: t,
        });
        await dest.update({ qty: toMoney(Number(dest.qty || 0) + qty) }, { transaction: t });
      } else if (doc.move_type === 'materials') {
        const source = await db.WarehouseMaterial.findByPk(it.item_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!source || Number(source.warehouse_id) !== fromId) {
          await t.rollback();
          return res.status(400).json({ error: `Материал "${it.item_name}" не найден на складе отправителя` });
        }
        if (Number(source.qty || 0) < qty) {
          await t.rollback();
          return res.status(400).json({ error: `Недостаточно остатка для "${it.item_name}"` });
        }
        await source.update({ qty: toMoney(Number(source.qty || 0) - qty) }, { transaction: t });
        const [dest] = await db.WarehouseMaterial.findOrCreate({
          where: { name: source.name, type: source.type, unit: source.unit, warehouse_id: toId },
          defaults: {
            name: source.name,
            type: source.type,
            unit: source.unit,
            warehouse_id: toId,
            qty: 0,
            price: source.price || it.price || 0,
            received_at: doc.doc_date,
          },
          transaction: t,
        });
        await dest.update({ qty: toMoney(Number(dest.qty || 0) + qty) }, { transaction: t });
      }

      await db.WarehouseMovement.create(
        {
          movement_kind: doc.move_type,
          ref_id: it.item_id || null,
          item_name: it.item_name,
          from_warehouse_id: fromId,
          to_warehouse_id: toId,
          qty,
          moved_at: doc.doc_date,
          user_id: req.user?.id || null,
          comment: `Документ ${doc.doc_number}`,
          type: 'РАСХОД',
          quantity: qty,
          item_id: null,
          order_id: null,
        },
        { transaction: t }
      );
    }

    await doc.update({ status: 'posted' }, { transaction: t });
    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    next(err);
  }
});

module.exports = router;
