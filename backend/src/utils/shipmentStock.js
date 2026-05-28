/**
 * Остаток товаров для раздела «Отгрузка» (таблица stock)
 */

const { Op } = require('sequelize');

const COMPLETED_STATUS_KEYWORDS = ['готов', 'completed', 'done', 'otk_done', 'ready'];

function parseFabricData(order) {
  const raw = order?.fabric_data;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function orderPhoto(order) {
  const photos = order?.photos;
  if (Array.isArray(photos) && photos[0]) return photos[0];
  return order?.photo || null;
}

async function upsertShipmentStock(db, payload) {
  const orderId = parseInt(payload.order_id, 10);
  if (!orderId) return null;

  const color = payload.color != null ? String(payload.color) : null;
  const size = payload.size != null ? String(payload.size) : null;
  const source = String(payload.source || 'otk');
  const addQty = Math.max(0, parseInt(payload.quantity, 10) || 0);
  if (addQty <= 0) return null;

  const where = {
    order_id: orderId,
    source,
    color: color || { [Op.or]: [null, ''] },
    size: size || { [Op.or]: [null, ''] },
  };

  if (color) where.color = color;
  if (size) where.size = size;

  let row = await db.Stock.findOne({ where });

  if (row) {
    const nextQty = parseInt(row.quantity, 10) + addQty;
    await row.update({
      quantity: nextQty,
      status: nextQty > 0 ? 'ready' : 'empty',
      order_number: payload.order_number || row.order_number,
      order_name: payload.order_name || row.order_name,
      client: payload.client ?? row.client,
      photo: payload.photo ?? row.photo,
    });
    return row;
  }

  return db.Stock.create({
    order_id: orderId,
    order_number: payload.order_number || '',
    order_name: payload.order_name || '',
    client: payload.client || '',
    photo: payload.photo || null,
    color,
    size,
    quantity: addQty,
    source,
    status: 'ready',
  });
}

async function addOrderToShipmentStockOnComplete(db, order) {
  const orderId = order.id;
  const qty = parseInt(order.quantity || order.total_quantity || 0, 10);
  if (!qty) return;

  const variants = await db.OrderVariant.findAll({
    where: { order_id: orderId },
    include: [{ model: db.Size, as: 'Size' }],
  });

  if (variants.length > 0) {
    const clientName = order.Client?.name || order.client_name || '';
    for (const v of variants) {
      const vQty = parseInt(v.quantity, 10) || 0;
      if (vQty <= 0) continue;
      await upsertShipmentStock(db, {
        order_id: orderId,
        order_number: order.tz_code || order.number || String(orderId),
        order_name: order.model_name || order.title || '',
        client: clientName,
        photo: orderPhoto(order),
        color: v.color || 'Основной',
        size: v.Size?.name || null,
        quantity: vQty,
        source: 'otk',
      });
    }
    console.log(`[stock] Заказ ${order.tz_code || orderId} на склад (варианты)`);
    return;
  }

  const fabricData = parseFabricData(order);
  const colors = [];
  fabricData.forEach((f) => {
    if (f.color && !colors.includes(f.color)) colors.push(f.color);
  });
  if (colors.length === 0) colors.push('Основной');

  const clientName = order.Client?.name || order.client_name || '';
  const perColor = Math.floor(qty / colors.length) || qty;

  for (const color of colors) {
    const existing = await db.Stock.findOne({
      where: { order_id: orderId, color, source: 'otk', size: { [Op.or]: [null, ''] } },
    });
    if (!existing) {
      await db.Stock.create({
        order_id: orderId,
        order_number: order.tz_code || order.number || String(orderId),
        order_name: order.model_name || order.title || '',
        client: clientName,
        photo: orderPhoto(order),
        color,
        size: null,
        quantity: perColor,
        source: 'otk',
        status: 'ready',
      });
    }
  }
  console.log(`[stock] Заказ ${order.tz_code || orderId} добавлен на склад (${qty} шт)`);
}

async function syncOtkFactToShipmentStock(db, otkFactRow, otkDoc) {
  const passed = Math.max(0, parseInt(otkFactRow.otk_passed, 10) || 0);
  if (passed <= 0 || !otkDoc?.order_id) return;

  const order = await db.Order.findByPk(otkDoc.order_id, {
    include: [{ model: db.Client, as: 'Client' }],
  });
  if (!order) return;

  await upsertShipmentStock(db, {
    order_id: order.id,
    order_number: order.tz_code || order.number || String(order.id),
    order_name: order.model_name || order.title || '',
    client: order.Client?.name || '',
    photo: orderPhoto(order),
    color: otkFactRow.color || 'Основной',
    size: otkFactRow.size || null,
    quantity: passed,
    source: 'otk',
  });
}

async function reduceShipmentStockForShipment(db, shipmentBody) {
  const orderId = parseInt(shipmentBody.order_id, 10);
  let remaining = parseInt(shipmentBody.total_quantity, 10) || 0;
  if (!orderId || remaining <= 0) return;

  const rows = Array.isArray(shipmentBody.rows) ? shipmentBody.rows : [];

  if (rows.length > 0) {
    for (const row of rows) {
      for (const sz of row.sizes || []) {
        const need = parseInt(sz.quantity, 10) || 0;
        if (need <= 0) continue;
        remaining -= await reduceOne(db, orderId, row.color, sz.size, need);
      }
    }
  }

  if (remaining > 0) {
    const stockItems = await db.Stock.findAll({
      where: {
        order_id: orderId,
        quantity: { [Op.gt]: 0 },
      },
      order: [['id', 'ASC']],
    });
    for (const si of stockItems) {
      if (remaining <= 0) break;
      const cur = parseInt(si.quantity, 10) || 0;
      const reduce = Math.min(cur, remaining);
      const newQty = cur - reduce;
      await si.update({
        quantity: newQty,
        status: newQty <= 0 ? 'empty' : 'ready',
      });
      remaining -= reduce;
    }
  }
}

async function reduceOne(db, orderId, color, size, need) {
  let left = need;
  const candidates = await db.Stock.findAll({
    where: {
      order_id: orderId,
      quantity: { [Op.gt]: 0 },
      ...(color ? { color } : {}),
      ...(size ? { size } : {}),
    },
    order: [['id', 'ASC']],
  });

  for (const si of candidates) {
    if (left <= 0) break;
    const cur = parseInt(si.quantity, 10) || 0;
    const reduce = Math.min(cur, left);
    const newQty = cur - reduce;
    await si.update({
      quantity: newQty,
      status: newQty <= 0 ? 'empty' : 'ready',
    });
    left -= reduce;
  }
  return need - left;
}

function isOrderStatusReady(statusName) {
  const n = String(statusName || '').toLowerCase();
  return COMPLETED_STATUS_KEYWORDS.some((k) => n.includes(k));
}

module.exports = {
  upsertShipmentStock,
  addOrderToShipmentStockOnComplete,
  syncOtkFactToShipmentStock,
  reduceShipmentStockForShipment,
  isOrderStatusReady,
};
