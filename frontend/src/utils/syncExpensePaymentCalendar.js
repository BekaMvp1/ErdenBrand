/**
 * Фоновая синхронизация планирования расходов → платёжный календарь.
 */

import { api } from '../api';
import { weekNumberForDate } from './paymentCalendarWeeks';

function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function flattenMaterialRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object');
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g?.rows || []) {
        if (r && typeof r === 'object') out.push(r);
      }
    }
    return out;
  }
  return [];
}

function qtyPerUnit(r) {
  return toNum(r?.qty_per_unit ?? r?.quantity_per ?? r?.norm ?? r?.qtyPerUnit ?? r?.qty);
}

function materialPrice(r) {
  return toNum(r?.price_per_unit ?? r?.price ?? r?.rateSom ?? r?.cost ?? r?.rate_som);
}

function flattenOpsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object');
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g?.rows || []) {
        if (r && typeof r === 'object') out.push(r);
      }
    }
    return out;
  }
  return [];
}

function opUnitPrice(op) {
  return toNum(
    op?.price ??
      op?.cost ??
      op?.operation_cost ??
      op?.rateSom ??
      op?.rate_som ??
      op?.price_per_unit
  );
}

function opsFromOrder(order, stage) {
  const qty = toNum(order?.total_quantity ?? order?.quantity);
  const directKey =
    stage === 'cutting' ? 'cutting_ops' : stage === 'sewing' ? 'sewing_ops' : 'otk_ops';
  const direct = flattenOpsJson(order?.[directKey]);
  const ops = direct
    .map((op) => {
      const price = opUnitPrice(op);
      return {
        name: String(op?.name || op?.operation_name || op?.operation || '').trim(),
        price,
        lineTotal: price * qty,
      };
    })
    .filter((op) => op.name);

  const paySum = ops.reduce((s, op) => s + op.lineTotal, 0);
  if (paySum > 0) return ops;

  const totalField =
    stage === 'cutting'
      ? order?.total_cutting_cost
      : stage === 'sewing'
        ? order?.total_sewing_cost
        : order?.total_otk_cost;
  const total = toNum(totalField);
  if (total > 0) {
    return [{ name: '—', price: qty > 0 ? total / qty : total, lineTotal: total }];
  }
  return ops;
}

function opsPayTotal(ops, qty) {
  return ops.reduce((sum, op) => sum + (op.lineTotal ?? op.price * qty), 0);
}

function orderMaterialsTotal(order) {
  const qty = toNum(order?.total_quantity ?? order?.quantity);
  const materials = [
    ...flattenMaterialRows(order?.fabric_data),
    ...flattenMaterialRows(order?.fittings_data),
  ];
  return materials.reduce((sum, m) => sum + qtyPerUnit(m) * materialPrice(m) * qty, 0);
}

function orderAmountForStage(order, stage) {
  const qty = toNum(order?.total_quantity ?? order?.quantity);
  if (stage === 'cutting' || stage === 'sewing' || stage === 'otk') {
    return opsPayTotal(opsFromOrder(order, stage), qty);
  }
  if (stage === 'procurement' || stage === 'purchase') {
    return orderMaterialsTotal(order);
  }
  return 0;
}

export function apiStageForExpenseStage(stage) {
  if (stage === 'procurement') return 'purchase';
  return stage;
}

export { orderAmountForStage };

/** Перенос одного заказа в платёжный календарь на неделю plan_date (с удалением старых недель). */
export async function moveOrderToPaymentCalendar(order, stage, planIso) {
  const apiStage = apiStageForExpenseStage(stage);
  const amount = Math.round(orderAmountForStage(order, stage));
  if (amount <= 0 || !planIso) return null;

  const weekNumber = weekNumberForDate(planIso);
  const orderLabel =
    String(order.tz_code || order.article || order.number || order.id).trim() || order.id;
  const orderName = String(order.model_name || order.product_name || order.title || '').trim();
  const client = order.client_name || order.Client?.name || '';

  return api.paymentCalendar.updateOrderWeek({
    order_id: order.id,
    stage: apiStage,
    week_number: weekNumber,
    year: 2026,
    amount,
    order_number: orderLabel,
    order_name: orderName,
    client,
    plan_date: planIso,
  });
}

/**
 * @param {object[]} orders
 * @param {string} stage — cutting | sewing | otk | procurement
 * @param {Record<string, { plan_date?: string }>} dateDrafts
 */
export function syncExpenseOrdersToPaymentCalendar(orders, stage, dateDrafts = {}) {
  const apiStage = apiStageForExpenseStage(stage);
  const supported = ['cutting', 'sewing', 'otk', 'purchase', 'procurement'].includes(stage);
  if (!supported || !Array.isArray(orders) || orders.length === 0) return;

  const year = 2026;

  for (const order of orders) {
    const amount = Math.round(orderAmountForStage(order, stage));
    if (amount <= 0) continue;

    const drafts = dateDrafts[order.id] || {};
    const planIso =
      chainDateIso(drafts.plan_date) ||
      chainDateIso(order.plan_date) ||
      chainDateIso(order.deadline) ||
      '';
    if (!planIso) continue;

    const weekNumber = weekNumberForDate(planIso);
    const orderLabel =
      String(order.tz_code || order.article || order.number || order.id).trim() || order.id;
    const orderName = String(order.model_name || order.product_name || order.title || '').trim();
    const client = order.client_name || order.Client?.name || '';

    api.paymentCalendar
      .writeToRow({
        stage: apiStage,
        week_number: weekNumber,
        year,
        amount,
        order_id: order.id,
        order_number: orderLabel,
        order_name: orderName,
        client,
        plan_date: planIso,
      })
      .catch(() => {});
  }
}
