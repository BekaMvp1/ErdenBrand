/**
 * Агрегат прогресса заказов по цепочке: закуп → раскрой → пошив → ОТК → склад → отгрузка.
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const {
  Order,
  PurchaseDocument,
  CuttingDocument,
  CuttingFactDetail,
  SewingDocument,
  SewingFactDetail,
  OtkDocument,
  OtkFactDetail,
  OtkWarehouseItem,
  Client,
  OrderStatus,
} = db;

const router = express.Router();

function purchaseProgressFromStatuses(statuses) {
  const list = (statuses || []).filter(Boolean);
  if (list.some((s) => s === 'done')) return 100;
  if (list.some((s) => s === 'in_progress')) return 50;
  return 0;
}

router.get('/orders-progress', async (req, res) => {
  try {
    const orders = await Order.findAll({
      attributes: [
        'id',
        'title',
        'article',
        'model_name',
        'photos',
        'quantity',
        'total_quantity',
        'status_id',
        'created_at',
      ],
      include: [
        { model: Client, attributes: ['name'], required: false },
        { model: OrderStatus, attributes: ['name'], required: false },
      ],
      order: [['created_at', 'DESC']],
    });

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) {
      return res.json([]);
    }

    const [purchaseRows, cuttingDocs, sewingDocs, otkDocs, whRows] = await Promise.all([
      PurchaseDocument.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        attributes: ['order_id', 'status'],
      }),
      CuttingDocument.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        attributes: ['id', 'order_id', 'status'],
      }),
      SewingDocument.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        attributes: ['id', 'order_id', 'status'],
      }),
      OtkDocument.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        attributes: ['id', 'order_id', 'status'],
      }),
      OtkWarehouseItem.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        attributes: ['order_id', 'quantity', 'shipped_qty'],
      }),
    ]);

    const purchasesByOrder = {};
    for (const p of purchaseRows) {
      const oid = p.order_id;
      if (!purchasesByOrder[oid]) purchasesByOrder[oid] = [];
      purchasesByOrder[oid].push(p.status);
    }

    const cuttingDocIds = cuttingDocs.map((d) => d.id);
    const docIdToOrder = {};
    for (const d of cuttingDocs) {
      docIdToOrder[d.id] = d.order_id;
    }

    const cuttingStatusesByOrder = {};
    for (const d of cuttingDocs) {
      if (!cuttingStatusesByOrder[d.order_id]) cuttingStatusesByOrder[d.order_id] = [];
      cuttingStatusesByOrder[d.order_id].push(d.status);
    }

    const sewingDocIds = sewingDocs.map((d) => d.id);
    const sewingDocIdToOrder = {};
    for (const d of sewingDocs) {
      sewingDocIdToOrder[d.id] = d.order_id;
    }

    const sewingStatusesByOrder = {};
    for (const d of sewingDocs) {
      if (!sewingStatusesByOrder[d.order_id]) sewingStatusesByOrder[d.order_id] = [];
      sewingStatusesByOrder[d.order_id].push(d.status);
    }

    const otkDocIds = otkDocs.map((d) => d.id);
    const otkDocIdToOrder = {};
    for (const d of otkDocs) {
      otkDocIdToOrder[d.id] = d.order_id;
    }

    const otkStatusesByOrder = {};
    for (const d of otkDocs) {
      if (!otkStatusesByOrder[d.order_id]) otkStatusesByOrder[d.order_id] = [];
      otkStatusesByOrder[d.order_id].push(d.status);
    }

    const cuttingSums = {};
    if (cuttingDocIds.length > 0) {
      const facts = await CuttingFactDetail.findAll({
        where: { cutting_document_id: { [Op.in]: cuttingDocIds } },
        attributes: ['cutting_document_id', 'quantity'],
      });
      for (const f of facts) {
        const oid = docIdToOrder[f.cutting_document_id];
        if (oid == null) continue;
        cuttingSums[oid] = (cuttingSums[oid] || 0) + (Number(f.quantity) || 0);
      }
    }

    const sewingSums = {};
    if (sewingDocIds.length > 0) {
      const facts = await SewingFactDetail.findAll({
        where: { sewing_document_id: { [Op.in]: sewingDocIds } },
        attributes: ['sewing_document_id', 'sewing_quantity'],
      });
      for (const f of facts) {
        const oid = sewingDocIdToOrder[f.sewing_document_id];
        if (oid == null) continue;
        sewingSums[oid] = (sewingSums[oid] || 0) + (Number(f.sewing_quantity) || 0);
      }
    }

    const otkPassedByOrder = {};
    const otkRejectedByOrder = {};
    if (otkDocIds.length > 0) {
      const facts = await OtkFactDetail.findAll({
        where: { otk_document_id: { [Op.in]: otkDocIds } },
        attributes: ['otk_document_id', 'otk_passed', 'otk_rejected'],
      });
      for (const f of facts) {
        const oid = otkDocIdToOrder[f.otk_document_id];
        if (oid == null) continue;
        otkPassedByOrder[oid] = (otkPassedByOrder[oid] || 0) + (Number(f.otk_passed) || 0);
        otkRejectedByOrder[oid] = (otkRejectedByOrder[oid] || 0) + (Number(f.otk_rejected) || 0);
      }
    }

    const warehouseQtyByOrder = {};
    const shippedQtyByOrder = {};
    for (const w of whRows) {
      const oid = w.order_id;
      if (oid == null) continue;
      warehouseQtyByOrder[oid] = (warehouseQtyByOrder[oid] || 0) + (Number(w.quantity) || 0);
      shippedQtyByOrder[oid] = (shippedQtyByOrder[oid] || 0) + (Number(w.shipped_qty) || 0);
    }

    const result = orders.map((order) => {
      const orderId = order.id;
      const planQty =
        Number(order.total_quantity) || Number(order.quantity) || 0;

      const purchaseProg = purchaseProgressFromStatuses(purchasesByOrder[orderId]);
      const cuttingFact = cuttingSums[orderId] || 0;
      const sewingFact = sewingSums[orderId] || 0;
      const otkPassed = otkPassedByOrder[orderId] || 0;
      const otkRejected = otkRejectedByOrder[orderId] || 0;
      const warehouseQty = warehouseQtyByOrder[orderId] || 0;
      const shippedQty = shippedQtyByOrder[orderId] || 0;

      const progress = {
        purchase: purchaseProg,
        cutting:
          planQty > 0 ? Math.min(100, Math.round((cuttingFact / planQty) * 100)) : 0,
        sewing:
          planQty > 0 ? Math.min(100, Math.round((sewingFact / planQty) * 100)) : 0,
        otk: planQty > 0 ? Math.min(100, Math.round((otkPassed / planQty) * 100)) : 0,
        warehouse:
          planQty > 0 ? Math.min(100, Math.round((warehouseQty / planQty) * 100)) : 0,
        shipping:
          planQty > 0 ? Math.min(100, Math.round((shippedQty / planQty) * 100)) : 0,
      };

      const stages = Object.values(progress);
      const totalProgress = Math.round(
        stages.reduce((s, v) => s + v, 0) / stages.length
      );

      const currentStage =
        shippedQty >= planQty && planQty > 0
          ? 'shipped'
          : warehouseQty > 0
            ? 'warehouse'
            : otkPassed > 0
              ? 'otk'
              : sewingFact > 0
                ? 'sewing'
                : cuttingFact > 0
                  ? 'cutting'
                  : purchasesByOrder[orderId]?.length
                    ? 'purchase'
                    : 'new';

      const pickStageStatus = (statuses) => {
        const s = statuses || [];
        if (s.includes('done')) return 'done';
        if (s.includes('in_progress')) return 'in_progress';
        return s[0] || null;
      };

      return {
        id: order.id,
        article: order.article,
        name: order.title || order.model_name,
        photo: Array.isArray(order.photos) ? order.photos[0] : null,
        client: order.Client?.name || null,
        plan_qty: planQty,
        status: order.OrderStatus?.name || null,
        current_stage: currentStage,
        total_progress: totalProgress,
        quantities: {
          cutting: cuttingFact,
          sewing: sewingFact,
          otk_passed: otkPassed,
          otk_rejected: otkRejected,
          warehouse: warehouseQty,
          shipped: shippedQty,
        },
        progress,
        stages: {
          purchase: pickStageStatus(purchasesByOrder[orderId]),
          cutting: pickStageStatus(cuttingStatusesByOrder[orderId]),
          sewing: pickStageStatus(sewingStatusesByOrder[orderId]),
          otk: pickStageStatus(otkStatusesByOrder[orderId]),
        },
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[orders-progress]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard-stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, activeOrders] = await Promise.all([
      Order.count(),
      Order.count({
        include: [
          {
            model: OrderStatus,
            required: true,
            where: { name: { [Op.in]: ['Принят', 'В работе'] } },
          },
        ],
      }),
    ]);

    const cuttingDocsToday = await CuttingDocument.findAll({
      where: { updated_at: { [Op.gte]: today } },
      attributes: ['id'],
    });
    const cuttingIds = cuttingDocsToday.map((d) => d.id);
    let todayCutting = 0;
    if (cuttingIds.length > 0) {
      const cutFacts = await CuttingFactDetail.findAll({
        where: { cutting_document_id: { [Op.in]: cuttingIds } },
        attributes: ['quantity'],
      });
      todayCutting = cutFacts.reduce((s, f) => s + (Number(f.quantity) || 0), 0);
    }

    const sewingDocsToday = await SewingDocument.findAll({
      where: { updated_at: { [Op.gte]: today } },
      attributes: ['id'],
    });
    const sewingIds = sewingDocsToday.map((d) => d.id);
    let todaySewing = 0;
    if (sewingIds.length > 0) {
      const sewFacts = await SewingFactDetail.findAll({
        where: { sewing_document_id: { [Op.in]: sewingIds } },
        attributes: ['sewing_quantity'],
      });
      todaySewing = sewFacts.reduce((s, f) => s + (Number(f.sewing_quantity) || 0), 0);
    }

    // Готовая продукция: otk_warehouse_items (не warehouse_items — сырьё)
    const allWarehouse = await OtkWarehouseItem.findAll({
      attributes: ['quantity', 'shipped_qty', 'updated_at'],
    });
    const warehouseTotal = allWarehouse.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const todayShipped = allWarehouse
      .filter((i) => i.updated_at && new Date(i.updated_at) >= today)
      .reduce((s, i) => s + (Number(i.shipped_qty) || 0), 0);

    res.json({
      total_orders: totalOrders || 0,
      active_orders: activeOrders || 0,
      today_cutting: todayCutting,
      today_sewing: todaySewing,
      warehouse_total: warehouseTotal,
      today_shipped: todayShipped,
    });
  } catch (err) {
    console.error('[dashboard-stats]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
