/**
 * Понедельник недели и подписи периодов для цикла закуп/раскрой/пошив.
 */

export const MONTH_SHORT_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export function getMonday(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getWeekSixWorkdays(weekStart) {
  const dates = [];
  const d = new Date(`${weekStart}T12:00:00`);
  for (let i = 0; i < 6; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** «23–29 мар» или «30.03–05.04» стиль как в ТЗ */
export function formatWeekRangeShort(mondayIso) {
  const dates = getWeekSixWorkdays(mondayIso);
  const a = dates[0];
  const b = dates[5];
  const [, m1, d1] = a.split('-').map(Number);
  const [, m2, d2] = b.split('-').map(Number);
  const M1 = MONTH_SHORT_RU[m1 - 1] || '';
  const M2 = MONTH_SHORT_RU[m2 - 1] || '';
  if (m1 === m2) return `${d1}–${d2} ${M2}`;
  return `${d1} ${M1} – ${d2} ${M2}`;
}

export function formatWeekNavTitle(mondayIso) {
  const dates = getWeekSixWorkdays(mondayIso);
  const a = dates[0];
  const b = dates[5];
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const M1 = MONTH_SHORT_RU[m1 - 1] || '';
  const M2 = MONTH_SHORT_RU[m2 - 1] || '';
  if (y1 !== y2) return `${d1} ${M1} ${y1} – ${d2} ${M2} ${y2}`;
  if (m1 === m2) return `${d1}–${d2} ${M2} ${y2}`;
  return `${d1} ${M1} – ${d2} ${M2} ${y2}`;
}

export function addWeeksMonday(mondayIso, delta) {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + delta * 7);
  return getMonday(d.toISOString().slice(0, 10));
}

export function subtractWeeksMonday(mondayIso, weeks) {
  return addWeeksMonday(mondayIso, -weeks);
}
