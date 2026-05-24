/**
 * Недели платёжного календаря 2026 (совпадают с PaymentCalendar.jsx).
 */

import { getMonday } from './cycleWeekLabels';

export function generateWeeks2026() {
  const weeks = [];
  const date = new Date('2025-12-29T12:00:00');
  for (let w = 1; w <= 52; w++) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const em = String(end.getMonth() + 1).padStart(2, '0');
    weeks.push({
      number: w,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `Нед ${w}\n${start.getDate()}.${sm}–${end.getDate()}.${em}`,
    });
    date.setDate(date.getDate() + 7);
  }
  return weeks;
}

const WEEKS_2026 = generateWeeks2026();

/** Номер недели календаря 2026 по дате (не ISO). */
export function weekNumberForDate(isoDate) {
  const iso = String(isoDate || '').slice(0, 10);
  if (!iso) {
    const now = new Date();
    return weekNumberForDate(now.toISOString().slice(0, 10));
  }
  for (const w of WEEKS_2026) {
    if (iso >= w.start && iso <= w.end) return w.number;
  }
  const monday = getMonday(iso);
  const byMonday = WEEKS_2026.find((w) => w.start === monday);
  if (byMonday) return byMonday.number;
  return 1;
}

export function weekMetaForNumber(weekNumber) {
  const n = parseInt(weekNumber, 10);
  return WEEKS_2026.find((w) => w.number === n) || WEEKS_2026[0];
}

/** Текущая неделя календаря 2026 по сегодняшней дате. */
export function getCurrentCalendarWeek() {
  return weekNumberForDate(new Date().toISOString().slice(0, 10));
}

const MAX_START_WEEK = 45;

export function clampPaymentCalendarStartWeek(startWeek) {
  const n = parseInt(startWeek, 10) || 1;
  return Math.max(1, Math.min(MAX_START_WEEK, n));
}

/** Стартовая неделя окна (8 недель): из URL или «сейчас − 4». */
export function getInitialPaymentCalendarStartWeek(urlWeek) {
  const parsed = parseInt(urlWeek, 10);
  if (parsed >= 1 && parsed <= 52) {
    return clampPaymentCalendarStartWeek(parsed - 1);
  }
  const current = getCurrentCalendarWeek();
  return clampPaymentCalendarStartWeek(current - 4);
}

export const STAGE_CALENDAR_CATEGORY = {
  procurement: 'supplier_fabric',
  cutting: 'dept_cutting',
  sewing: 'dept_sewing',
  otk: 'dept_otk',
};

export const STAGE_LABELS_RU = {
  procurement: 'Закуп',
  cutting: 'Раскрой',
  sewing: 'Пошив',
  otk: 'ОТК',
  purchase: 'Закуп',
};

export function stageFromPathname(pathname = '') {
  const seg = String(pathname).split('/').filter(Boolean)[0] || '';
  if (seg === 'purchase') return 'procurement';
  return seg;
}
