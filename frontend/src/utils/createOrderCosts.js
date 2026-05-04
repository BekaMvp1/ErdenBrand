/**
 * Калькуляция расходов на странице «Создать заказ».
 * Ткань/фурнитура: сумма строки = (кол-во на ед. × totalQty) × расценка за ед. изм.
 * Операции: сумма строки = расценка × totalQty
 */

export function parseCostNum(s) {
  if (s === undefined || s === null || s === '') return 0;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function fabricRowSumSom(qtyPerUnitStr, rateSomStr, totalQty, qtyTotalOverride) {
  const q = parseCostNum(qtyPerUnitStr);
  const r = parseCostNum(rateSomStr);
  const override = parseCostNum(qtyTotalOverride);
  const tq = override > 0 ? override : Number.isFinite(totalQty) && totalQty > 0 ? totalQty : 0;
  return q * tq * r;
}

export function opsRowSumSom(rateSomStr, totalQty) {
  const r = parseCostNum(rateSomStr);
  const tq = Number.isFinite(totalQty) && totalQty > 0 ? totalQty : 0;
  return r * tq;
}

export function sumFabricOrAccessories(rows, totalQty) {
  return rows.reduce(
    (acc, row) => acc + fabricRowSumSom(row.qtyPerUnit, row.rateSom, totalQty, row.qtyTotal),
    0,
  );
}

export function sumOps(rows, totalQty) {
  return rows.reduce((acc, row) => acc + opsRowSumSom(row.rateSom, totalQty), 0);
}

/** Для отображения и сохранения в БД */
export function roundCost2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatSom(n) {
  const x = roundCost2(n);
  if (x === 0) return '0';
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
}
