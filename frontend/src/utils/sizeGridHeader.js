/**
 * Двухстрочная шапка матрицы цвет × размер (число + буква), подсветка размеров из заказа.
 */

import { SIZE_GRID_MAP } from '../components/SizeGrid';

const GRID_NUM_SET = new Set(SIZE_GRID_MAP.map((r) => r.num));

export const SIZE_MAP = SIZE_GRID_MAP;

export function getSizeLetter(size) {
  const raw = String(size ?? '').trim();
  if (!raw) return '';
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && String(n) === raw) {
    return SIZE_GRID_MAP.find((s) => s.num === n)?.letter ?? raw;
  }
  const u = raw.toUpperCase();
  if (u === '3XL') return SIZE_GRID_MAP.find((s) => s.num === 52)?.letter ?? 'XXXL';
  const row = SIZE_GRID_MAP.find((s) => s.letter.toUpperCase() === u);
  return row ? row.letter : raw;
}

/** Номера сетки 38–56, которые считаются «выбранными в заказе» */
export function getOrderHighlightGridNums(order) {
  const set = new Set();
  if (!order || typeof order !== 'object') return set;
  const sg = order.size_grid?.numeric ?? order.size_grid_numeric;
  if (Array.isArray(sg)) {
    sg.forEach((x) => {
      const n = parseInt(x, 10);
      if (Number.isFinite(n) && GRID_NUM_SET.has(n)) set.add(n);
    });
  }
  const sizes = order.sizes;
  if (Array.isArray(sizes)) {
    sizes.forEach((raw) => {
      const t = String(raw ?? '').trim();
      if (!t) return;
      const n = parseInt(t, 10);
      if (!Number.isNaN(n) && String(n) === t && GRID_NUM_SET.has(n)) set.add(n);
      const row = SIZE_GRID_MAP.find((s) => s.letter.toUpperCase() === t.toUpperCase());
      if (row) set.add(row.num);
      if (t.toUpperCase() === '3XL') set.add(52);
    });
  }
  return set;
}

export function isGridColumnHighlighted(sizeStr, highlightNums) {
  if (!highlightNums || highlightNums.size === 0) return false;
  const raw = String(sizeStr ?? '').trim();
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && String(n) === raw && GRID_NUM_SET.has(n)) {
    return highlightNums.has(n);
  }
  const row = SIZE_GRID_MAP.find((s) => s.letter.toUpperCase() === raw.toUpperCase());
  if (row) return highlightNums.has(row.num);
  if (raw.toUpperCase() === '3XL') return highlightNums.has(52);
  return false;
}

export function factMatrixHeadNumStyle(sizeStr, order) {
  const hi = isGridColumnHighlighted(sizeStr, getOrderHighlightGridNums(order));
  return {
    textAlign: 'center',
    padding: '8px 10px',
    fontSize: 13,
    fontWeight: 700,
    minWidth: 56,
    border: '1px solid rgba(13, 21, 100, 0.55)',
    background: hi ? '#F59E0B' : 'rgba(26, 35, 126, 0.92)',
    color: hi ? '#000' : '#fff',
  };
}

export function factMatrixHeadLetterStyle(sizeStr, order) {
  const hi = isGridColumnHighlighted(sizeStr, getOrderHighlightGridNums(order));
  return {
    textAlign: 'center',
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    minWidth: 56,
    border: '1px solid rgba(13, 21, 100, 0.55)',
    background: hi ? '#e67e00' : 'rgba(40, 53, 147, 0.92)',
    color: hi ? '#000' : '#F59E0B',
  };
}

export const FACT_HEAD_COLOR_TOP = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 600,
  minWidth: 120,
  border: '1px solid rgba(13, 21, 100, 0.55)',
  background: 'rgba(26, 35, 126, 0.92)',
  color: '#e8e8e8',
  fontSize: 13,
};

export const FACT_HEAD_COLOR_BOTTOM = {
  textAlign: 'left',
  padding: '5px 12px',
  fontWeight: 400,
  minWidth: 120,
  border: '1px solid rgba(13, 21, 100, 0.55)',
  background: 'rgba(40, 53, 147, 0.92)',
  color: '#9ca3af',
  fontSize: 11,
};

export const FACT_HEAD_TOTAL_TOP = {
  textAlign: 'right',
  padding: '8px 12px',
  fontWeight: 600,
  minWidth: 72,
  border: '1px solid rgba(13, 21, 100, 0.55)',
  background: 'rgba(26, 35, 126, 0.92)',
  color: '#d1d5db',
  fontSize: 13,
};

export const FACT_HEAD_TOTAL_BOTTOM = {
  textAlign: 'center',
  padding: '5px 10px',
  minWidth: 72,
  border: '1px solid rgba(13, 21, 100, 0.55)',
  background: 'rgba(40, 53, 147, 0.92)',
};
