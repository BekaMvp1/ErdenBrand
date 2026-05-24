/**
 * Связь этапа планирования расходов с полем недели в planning_chains.
 */

import { getMonday } from './cycleWeekLabels';

export const STAGE_CHAIN_WEEK_FIELD = {
  procurement: 'purchase_week_start',
  purchase: 'purchase_week_start',
  cutting: 'cutting_week_start',
  sewing: 'sewing_week_start',
  otk: 'otk_week_start',
};

export function chainWeekFieldForStage(stage) {
  return STAGE_CHAIN_WEEK_FIELD[stage] || null;
}

export function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

/** Понедельник недели этапа из строки planning_chains. */
export function planMondayFromChainRow(row, stage) {
  const field = chainWeekFieldForStage(stage);
  if (!field || !row) return '';
  return chainDateIso(row[field]);
}

export function mondayIsoFromPlanDate(planIso) {
  const iso = chainDateIso(planIso);
  if (!iso) return '';
  return getMonday(iso);
}

/** order_id → массив строк planning_chains */
export function indexChainsByOrderId(chains) {
  const byOrder = {};
  if (!Array.isArray(chains)) return byOrder;
  for (const row of chains) {
    const oid = row?.order_id;
    if (oid == null) continue;
    if (!byOrder[oid]) byOrder[oid] = [];
    byOrder[oid].push(row);
  }
  return byOrder;
}
