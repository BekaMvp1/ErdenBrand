/**
 * Чтение расходов из таблиц других модулей (только SELECT-логика)
 */

function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function toMoney(v) {
  return Math.round(toNum(v) * 100) / 100;
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

function qtyPerUnit(r) {
  return toNum(r?.qty_per_unit ?? r?.quantity_per ?? r?.norm ?? r?.qtyPerUnit ?? r?.qty);
}

function materialPrice(r) {
  return toNum(r?.price_per_unit ?? r?.price ?? r?.rateSom ?? r?.cost ?? r?.rate_som);
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

function orderMaterialsTotal(order) {
  const stored =
    toMoney(order.total_fabric_cost) + toMoney(order.total_accessories_cost);
  if (stored > 0) return stored;

  const qty = toNum(order.total_quantity ?? order.quantity);
  const materials = [
    ...flattenMaterialRows(order.fabric_data),
    ...flattenMaterialRows(order.fittings_data),
  ];
  return materials.reduce(
    (sum, m) => sum + qtyPerUnit(m) * materialPrice(m) * qty,
    0
  );
}

function opsFromOrder(order, stage) {
  const qty = toNum(order.total_quantity ?? order.quantity);
  const directKey =
    stage === 'sewing' ? 'sewing_ops' : stage === 'otk' ? 'otk_ops' : null;
  const direct = directKey ? flattenOpsJson(order[directKey]) : [];
  const ops = direct
    .map((op) => {
      const price = opUnitPrice(op);
      return {
        name: String(op?.name || op?.operation_name || op?.operation || '').trim(),
        lineTotal: price * qty,
      };
    })
    .filter((op) => op.name);

  const paySum = ops.reduce((s, op) => s + op.lineTotal, 0);
  if (paySum > 0) return paySum;

  const totalField =
    stage === 'sewing' ? order.total_sewing_cost : order.total_otk_cost;
  return toMoney(totalField);
}

const STAGE_CHAIN_WEEK = {
  procurement: 'purchase_week_start',
  sewing: 'sewing_week_start',
  otk: 'otk_week_start',
};

const STAGE_CHAIN_STATUS = {
  procurement: 'purchase_status',
  sewing: 'sewing_status',
  otk: 'otk_status',
};

function indexChainsByOrderId(chains) {
  const byOrder = {};
  for (const row of chains) {
    const oid = Number(row.order_id);
    if (!Number.isFinite(oid)) continue;
    if (!byOrder[oid]) byOrder[oid] = [];
    byOrder[oid].push(row);
  }
  return byOrder;
}

function primaryChainRowForOrder(chainRows, stage) {
  if (!Array.isArray(chainRows) || !chainRows.length) return null;
  const field = STAGE_CHAIN_WEEK[stage];
  if (!field) return chainRows[0];
  const withWeek = chainRows.filter((r) => chainDateIso(r[field]));
  const list = (withWeek.length ? withWeek : chainRows).slice();
  list.sort((a, b) => Number(a.id) - Number(b.id));
  return list[0] || null;
}

function planDateForOrder(order, chainRows, stage, procurementRequest) {
  const chain = primaryChainRowForOrder(chainRows, stage);
  const weekField = STAGE_CHAIN_WEEK[stage];
  const fromChain = weekField && chain ? chainDateIso(chain[weekField]) : '';
  if (fromChain) return fromChain;
  if (stage === 'procurement' && procurementRequest?.due_date) {
    return chainDateIso(procurementRequest.due_date);
  }
  return chainDateIso(order.deadline) || chainDateIso(order.receipt_date) || '';
}

function chainStatusLabel(status) {
  if (status === 'done' || status === 'completed') return 'Завершено';
  if (status === 'in_progress') return 'В процессе';
  return 'Запланировано';
}

function procurementStatusLabel(procRequest, chain) {
  if (procRequest?.status === 'received') return 'Закуплено';
  if (procRequest?.status === 'sent') return 'Отправлено';
  if (procRequest?.status === 'draft') return 'Черновик';
  const st = chain?.purchase_status;
  return chainStatusLabel(st);
}

function orderLabel(order) {
  const tz = String(order.tz_code || order.article || order.id).trim();
  const model = String(order.model_name || order.title || '').trim();
  return model ? `${tz} — ${model}` : tz;
}

function matchesDateRange(dateIso, dateFrom, dateTo) {
  if (!dateIso) return false;
  const d = chainDateIso(dateIso);
  if (!d) return false;
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

function buildStageExpenses(orders, chains, procurementByOrder, stage, dateFrom, dateTo) {
  const chainsByOrder = indexChainsByOrderId(chains);
  const prefix =
    stage === 'procurement' ? 'Закуп' : stage === 'sewing' ? 'Пошив' : 'ОТК';
  const rows = [];

  for (const order of orders) {
    const oid = Number(order.id);
    const chainRows = chainsByOrder[oid] || [];
    const procReq = procurementByOrder[oid] || null;
    const amount =
      stage === 'procurement'
        ? orderMaterialsTotal(order)
        : opsFromOrder(order, stage);
    if (amount <= 0) continue;

    const date = planDateForOrder(order, chainRows, stage, procReq);
    if (!matchesDateRange(date, dateFrom, dateTo)) continue;

    const chain = primaryChainRowForOrder(chainRows, stage);
    const statusField = STAGE_CHAIN_STATUS[stage];
    const status =
      stage === 'procurement'
        ? procurementStatusLabel(procReq, chain)
        : chainStatusLabel(chain?.[statusField]);

    rows.push({
      id: oid,
      name: `${prefix}: ${orderLabel(order)}`,
      amount,
      date,
      status,
    });
  }

  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  return rows;
}

function buildPlannedExpenses(expensePlans, dateFrom, dateTo) {
  const rows = [];
  for (const p of expensePlans) {
    const date = chainDateIso(p.plan_date);
    if (!matchesDateRange(date, dateFrom, dateTo)) continue;
    const amount = toMoney(p.amount);
    if (amount <= 0) continue;
    rows.push({
      id: p.id,
      name: String(p.article || '—').trim() || '—',
      amount,
      date,
      status: p.status === 'paid' ? 'Оплачено' : 'Запланировано',
    });
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  return rows;
}

function attachMarks(items, source, markMap) {
  return items.map((item) => {
    const mark = markMap.get(`${source}_${item.id}`);
    return {
      ...item,
      is_distributed: mark?.is_distributed ?? false,
      distributed_at: mark?.distributed_at ?? null,
    };
  });
}

module.exports = {
  toMoney,
  buildStageExpenses,
  buildPlannedExpenses,
  attachMarks,
};
