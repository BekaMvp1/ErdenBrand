/**
 * HTML для печати черновика планирования (месяц / неделя).
 */

import { escapeHtml, formatWeek, formatDate } from './printUtils';
import {
  getArticle,
  getName,
  getQty,
  getClient,
} from './planningDraftPrintRowFields';

/** Значения ячейки дня для печати недели (основной + подготовка). */
function weekPrintDayValues(row, dateKey) {
  const cell = row.days?.[dateKey] || row.weeks?.[dateKey] || row.cells?.[dateKey] || {};
  return {
    mp: parseCellNum(cell.plan ?? cell.mp ?? cell.planned),
    mf: parseCellNum(cell.fact ?? cell.mf ?? cell.actual),
    pp: parseCellNum(cell.prep_plan ?? cell.pp),
    pf: parseCellNum(cell.prep_fact ?? cell.pf),
  };
}

function weekPrintCellDisplay(n) {
  return n > 0 ? String(n) : '—';
}

/** 4 ячейки на день: Осн Пл/Фк + Подг Пл/Фк */
function weekPrintDayCellsHtml(row, dateKey, sepFirst) {
  const { mp, mf, pp, pf } = weekPrintDayValues(row, dateKey);
  const sep = sepFirst ? ' sep-day' : '';
  const td = (cls, val) =>
    `<td class="col-day${cls}" style="text-align:center;font-size:8px;padding:2px 1px;border:1px solid #ddd;">${weekPrintCellDisplay(val)}</td>`;
  return `${td(sep, mp)}${td('', mf)}${td(' col-prep', pp)}${td(' col-prep', pf)}`;
}

/** Шапка дней: 3 строки × 4 колонки на день (Осн / Подг → Пл / Фк) */
function buildWeekPrintDayHeaderHtml(days) {
  const row1 = days
    .map(
      (d, di) => `
    <th colspan="4" style="
      text-align:center;
      background:#1a237e;
      color:#fff;
      font-size:9px;
      padding:3px 2px;
      border:1px solid #fff;
      white-space:nowrap;
      ${di > 0 ? 'border-left:2px solid #3949ab;' : ''}
    ">${escapeHtml(d.label)}</th>`
    )
    .join('');

  const row2 = days
    .map(
      (d, di) => `
    <th colspan="2" style="
      text-align:center;
      background:#1a237e;
      color:#fff;
      font-size:8px;
      padding:2px 1px;
      border:1px solid #fff;
      ${di > 0 ? 'border-left:2px solid #3949ab;' : ''}
    ">Осн</th>
    <th colspan="2" style="
      text-align:center;
      background:#b8860b;
      color:#fff;
      font-size:8px;
      padding:2px 1px;
      border:1px solid #fff;
    ">Подг</th>`
    )
    .join('');

  const row3 = days
    .map(
      (_, di) => `
    <th style="text-align:center;font-size:7px;padding:2px 1px;border:1px solid #ccc;background:#e8eaf6;min-width:22px;${di > 0 ? 'border-left:2px solid #3949ab;' : ''}">Пл</th>
    <th style="text-align:center;font-size:7px;padding:2px 1px;border:1px solid #ccc;background:#e8eaf6;min-width:22px;">Фк</th>
    <th style="text-align:center;font-size:7px;padding:2px 1px;border:1px solid #ccc;background:#fff8dc;min-width:22px;">Пл</th>
    <th style="text-align:center;font-size:7px;padding:2px 1px;border:1px solid #ccc;background:#fff8dc;min-width:22px;">Фк</th>`
    )
    .join('');

  return `
    <tr class="row-days">
      <th rowspan="3" class="col-photo">Фото</th>
      <th rowspan="3" class="col-art">Арт.</th>
      <th rowspan="3" class="col-name">Наименование</th>
      <th rowspan="3" class="col-client">Заказчик</th>
      <th rowspan="3" class="col-qty">Кол-во</th>
      ${row1}
    </tr>
    <tr class="row-groups">${row2}</tr>
    <tr class="row-fields">${row3}</tr>
  `;
}

function buildWeekPrintColgroup(dayCount) {
  const dayCols = Array.from({ length: dayCount * 4 }, () => '<col style="width:22px"/>').join(
    ''
  );
  return `<colgroup>
    <col style="width:30px"/>
    <col style="width:38px"/>
    <col style="width:200px"/>
    <col style="width:52px"/>
    <col style="width:32px"/>
    ${dayCols}
  </colgroup>`;
}

function parseCellNum(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function ensureCapacityGridRead(sec) {
  const cell = () => ({ pp: '', pf: '', mp: '', mf: '' });
  if (Array.isArray(sec?.capacityGrid) && sec.capacityGrid.length >= 4) {
    return [0, 1, 2, 3].map((i) => {
      const c =
        sec.capacityGrid[i] && typeof sec.capacityGrid[i] === 'object'
          ? sec.capacityGrid[i]
          : {};
      return {
        pp: c.pp != null ? String(c.pp) : '',
        pf: c.pf != null ? String(c.pf) : '',
        mp: c.mp != null ? String(c.mp) : '',
        mf: c.mf != null ? String(c.mf) : '',
      };
    });
  }
  const legacy = Array.isArray(sec?.capacityByWeek) ? sec.capacityByWeek : ['', '', '', ''];
  const pad = [...legacy];
  while (pad.length < 4) pad.push('');
  return [0, 1, 2, 3].map((i) => ({
    pp: '',
    pf: '',
    mp: pad[i] != null ? String(pad[i]) : '',
    mf: '',
  }));
}

function weekAbsIndex(allWeeks, mondayIso) {
  const k = String(mondayIso).slice(0, 10);
  return allWeeks.findIndex((w) => String(w.dateFrom).slice(0, 10) === k);
}

function rowCellAtWeekMonday(row, mondayIso, weekSliceStart, allWeeks) {
  const abs = weekAbsIndex(allWeeks, mondayIso);
  if (abs < 0) return { pp: 0, fp: 0, mp: 0, fm: 0 };
  const wi = abs - weekSliceStart;
  if (wi < 0 || wi > 3) return { pp: 0, fp: 0, mp: 0, fm: 0 };
  const w = row.weeks?.[wi] || {};
  return {
    pp: parseCellNum(w.pp),
    fp: parseCellNum(w.pf),
    mp: parseCellNum(w.mp),
    fm: parseCellNum(w.mf),
  };
}

function sectionByKey(sectionTree, key) {
  return (sectionTree || []).find((s) => s.type === 'section' && s.key === key) || null;
}

function capacityAtMonday(sectionTree, sectionKey, mondayIso, weekSliceStart, allWeeks, field) {
  const sec = sectionByKey(sectionTree, sectionKey);
  const abs = weekAbsIndex(allWeeks, mondayIso);
  if (abs < 0) return '';
  const wi = abs - weekSliceStart;
  if (wi < 0 || wi > 3) return '';
  const grid = ensureCapacityGridRead(sec);
  const v = parseCellNum(grid[wi]?.[field]);
  return v > 0 ? String(v) : '';
}

function sumLoads(rows, mondayIso, weekSliceStart, allWeeks, key) {
  return rows.reduce((s, r) => s + rowCellAtWeekMonday(r, mondayIso, weekSliceStart, allWeeks)[key], 0);
}

const MONTH_PRINT_STYLES = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 9px; color: #000; padding: 5mm; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; margin-bottom: 8px; border-bottom: 2px solid #1a237e; }
    .page-title { font-size:14px; font-weight:700; }
    .page-meta { font-size:9px; color:#666; }
    .brand { font-size:16px; font-weight:700; color:#1a237e; }
    .section-header { background: #1a237e; color: #fff; padding: 5px 10px; font-size: 11px; font-weight: 700; margin: 10px 0 3px 0; display: flex; justify-content: space-between; }
    .week-header { background: #283593; color: #fff; padding: 4px 8px; font-size: 10px; font-weight: 600; margin: 6px 0 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; break-inside: avoid; }
    thead tr { background: #e8eaf6; border-bottom: 1.5px solid #1a237e; }
    thead th { padding: 4px 6px; text-align: center; font-weight: 700; font-size: 8px; text-transform: uppercase; border-right: 0.5px solid #c5cae9; white-space: nowrap; }
    thead th:first-child { text-align: left; }
    thead th:last-child { border-right: none; }
    tbody tr { border-bottom: 0.5px solid #e0e0e0; break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f9f9f9; }
    td { padding: 4px 6px; border-right: 0.5px solid #eee; vertical-align: middle; }
    td:last-child { border-right: none; }
    .col-num { width:24px; text-align:center; color:#999; }
    .col-photo { width:36px; text-align:center; padding:2px; }
    .col-article { width:50px; color:#1a237e; font-weight:700; }
    .col-name { min-width:110px; }
    .name-main { font-weight:600; font-size:9px; }
    .col-client { width:65px; color:#1a237e; font-size:9px; font-weight:600; }
    .col-qty { width:45px; text-align:right; font-weight:700; }
    .col-pf { width: 32px; text-align: center; font-size: 9px; }
    .val-plan { color: #1a237e; font-weight:600; }
    .val-fact { color: #2e7d32; font-weight:700; }
    .val-empty { color: #ccc; }
    .sep { border-left: 2px solid #1a237e !important; }
    .row-capacity { background: #e3f2fd; }
    .row-load { background: #e8f5e9; }
    .row-capacity td, .row-load td { font-weight: 700; font-size: 9px; }
    .signatures { display: flex; gap: 24px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #ccc; }
    .sig-line { border-bottom: 1px solid #000; height: 16px; margin-bottom: 2px; }
    .sig-label { font-size: 8px; color: #777; }
    @media print { body { padding: 3mm; } @page { margin: 6mm; size: A4 landscape; } .week-block { break-before: page; } .week-block:first-child { break-before: avoid; } }
`;

/**
 * @param {object} p
 * @param {Array} p.rowsWithPhotos — строки с order_id, section_id, weeks, article, name, client, quantity, photoBase64
 * @param {Array} p.allWeeks — { dateFrom, ... }
 * @param {Array} p.sections — { id, label }
 * @param {string} p.currentMonthLabel
 * @param {number} p.weekSliceStart
 * @param {Array} p.sectionTree
 */
export function buildPlanningMonthPrintHtml(p) {
  const {
    rowsWithPhotos,
    allWeeks,
    sections,
    currentMonthLabel,
    weekSliceStart,
    sectionTree,
  } = p;
  const todayStr = formatDate(new Date().toISOString());

  const weekBlocksHtml = allWeeks
    .map((w, wIdx) => {
      const weekStart = String(w.dateFrom).slice(0, 10);
      const d0 = new Date(`${weekStart}T12:00:00`);
      const d1 = new Date(d0);
      d1.setDate(d1.getDate() + 6);
      const weekEndStr = d1.toISOString().slice(0, 10);
      const weekHeader = `Неделя ${wIdx + 1}: ${formatWeek(weekStart)} (${formatDate(weekStart)} — ${formatDate(weekEndStr)})`;

      const sectionsHtml = sections
        .map((section) => {
          const sectionRows = rowsWithPhotos.filter((r) => r.section_id === section.id);
          if (sectionRows.length === 0) return '';

          const tbodyRows = sectionRows
            .map((row, rIdx) => {
              const cell = rowCellAtWeekMonday(row, weekStart, weekSliceStart, allWeeks);
              const pp = cell.pp;
              const fp = cell.fp;
              const mp = cell.mp;
              const fm = cell.fm;
              const article = getArticle(row);
              const name = getName(row);
              const qty = getQty(row);
              const client = getClient(row);
              const photoHtml = row.photoBase64
                ? `<img src="${row.photoBase64}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:3px;border:1px solid #ddd">`
                : `<div style="width:32px;height:32px;background:#e8eaf6;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#3949ab">${escapeHtml(String(article || '?').slice(0, 3))}</div>`;

              return `<tr>
                <td class="col-num">${rIdx + 1}</td>
                <td class="col-photo">${photoHtml}</td>
                <td class="col-article">${escapeHtml(article || '—')}</td>
                <td class="col-name"><div class="name-main">${escapeHtml(name)}</div></td>
                <td class="col-client">${escapeHtml(client)}</td>
                <td class="col-qty">${escapeHtml(String(qty !== '' && qty != null ? qty : '—'))}</td>
                <td class="col-pf"><span class="${pp > 0 ? 'val-plan' : 'val-empty'}">${pp > 0 ? pp : '—'}</span></td>
                <td class="col-pf"><span class="${fp > 0 ? 'val-fact' : 'val-empty'}">${fp > 0 ? fp : '—'}</span></td>
                <td class="col-pf sep"><span class="${mp > 0 ? 'val-plan' : 'val-empty'}">${mp > 0 ? mp : '—'}</span></td>
                <td class="col-pf"><span class="${fm > 0 ? 'val-fact' : 'val-empty'}">${fm > 0 ? fm : '—'}</span></td>
              </tr>`;
            })
            .join('');

          const capPrep = escapeHtml(
            capacityAtMonday(sectionTree, section.id, weekStart, weekSliceStart, allWeeks, 'pp')
          );
          const capMain = escapeHtml(
            capacityAtMonday(sectionTree, section.id, weekStart, weekSliceStart, allWeeks, 'mp')
          );
          const loadPp = sumLoads(sectionRows, weekStart, weekSliceStart, allWeeks, 'pp');
          const loadFp = sumLoads(sectionRows, weekStart, weekSliceStart, allWeeks, 'fp');
          const loadMp = sumLoads(sectionRows, weekStart, weekSliceStart, allWeeks, 'mp');
          const loadFm = sumLoads(sectionRows, weekStart, weekSliceStart, allWeeks, 'fm');

          return `
        <div class="section-header">
          <span>${escapeHtml(section.label)}</span>
          <span style="font-size:9px;opacity:0.8">${sectionRows.length} заказов</span>
        </div>
        <table>
          <thead>
            <tr>
              <th class="col-num">№</th>
              <th class="col-photo">Фото</th>
              <th class="col-article">Арт.</th>
              <th class="col-name">Наименование ГП</th>
              <th class="col-client">Заказчик</th>
              <th class="col-qty">Кол-во</th>
              <th class="col-pf">Пл</th>
              <th class="col-pf">Фк</th>
              <th class="col-pf sep">Пл</th>
              <th class="col-pf">Фк</th>
            </tr>
            <tr style="background:#c5cae9">
              <th colspan="6"></th>
              <th colspan="2" style="font-size:8px;color:#1a237e">Подготовка</th>
              <th colspan="2" class="sep" style="font-size:8px;color:#1a237e">Основное</th>
            </tr>
          </thead>
          <tbody>
            ${tbodyRows}
            <tr class="row-capacity">
              <td colspan="6" style="font-weight:700;padding-left:8px">МОЩНОСТЬ</td>
              <td class="col-pf">${capPrep}</td>
              <td class="col-pf"></td>
              <td class="col-pf sep">${capMain}</td>
              <td class="col-pf"></td>
            </tr>
            <tr class="row-load">
              <td colspan="6" style="font-weight:700;padding-left:8px">ЗАГРУЗКА</td>
              <td class="col-pf">${loadPp > 0 ? loadPp : ''}</td>
              <td class="col-pf">${loadFp > 0 ? loadFp : ''}</td>
              <td class="col-pf sep">${loadMp > 0 ? loadMp : ''}</td>
              <td class="col-pf">${loadFm > 0 ? loadFm : ''}</td>
            </tr>
          </tbody>
        </table>`;
        })
        .join('');

      return `<div class="week-block"><div class="week-header">${escapeHtml(weekHeader)}</div>${sectionsHtml}</div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Планирование месяц — ERDEN</title>
  <style>${MONTH_PRINT_STYLES}</style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="page-title">ПЛАНИРОВАНИЕ ПРОИЗВОДСТВА — МЕСЯЦ</div>
      <div class="page-meta">${escapeHtml(todayStr)} · ${escapeHtml(currentMonthLabel || '—')} · Заказов: ${rowsWithPhotos.length}</div>
    </div>
    <div class="brand">ERDEN</div>
  </div>
  ${weekBlocksHtml}
  <div class="signatures">
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Технолог</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Руководитель цеха</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Дата</div></div>
  </div>
</body>
</html>`;
}

const WEEK_PRINT_STYLES = `
    @page { size: A4 landscape; margin: 8mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 8px; color: #000; padding: 4mm; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; margin-bottom: 6px; border-bottom: 2px solid #1a237e; }
    .page-title { font-size:12px; font-weight:700; }
    .page-meta { font-size:8px; color:#666; }
    .brand { font-size:14px; font-weight:700; color:#1a237e; }
    .section-header { background: #1a237e; color: #fff; padding: 4px 8px; font-size: 9px; font-weight: 700; margin: 8px 0 2px 0; display: flex; justify-content: space-between; }
    table.week-print-table { width: 100%; border-collapse: collapse; font-size: 8px; table-layout: fixed; }
    thead tr.row-days th.lead-head { background: #e8eaf6; color: #1a237e; font-size: 8px; padding: 3px 2px; border: 1px solid #c5cae9; vertical-align: middle; }
    tbody tr { border-bottom: 0.5px solid #e0e0e0; }
    tbody tr:nth-child(even) { background: #f9f9f9; }
    td { padding: 2px 3px; border-right: 0.5px solid #eee; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
    td.col-prep { background: #fffef0; }
    .col-photo { width:30px; text-align:center; padding:1px; }
    .col-art { width:38px; color:#1a237e; font-weight:700; font-size:8px; }
    .col-name { max-width:200px; font-weight:600; font-size:8px; line-height:1.2; word-wrap:break-word; }
    .col-client { width:52px; color:#1a237e; font-weight:600; font-size:8px; }
    .col-qty { width:32px; text-align:right; font-weight:700; font-size:8px; }
    .col-day { text-align:center; }
    .sep-day { border-left: 2px solid #3949ab !important; }
    .signatures { display: flex; gap: 24px; margin-top: 10px; padding-top: 6px; border-top: 1px solid #ccc; }
    .sig-line { border-bottom: 1px solid #000; height: 14px; margin-bottom: 2px; }
    .sig-label { font-size: 7px; color: #777; }
    @media print { body { padding: 0; } }
`;

/**
 * @param {object} p
 * @param {Array} p.rowsWithPhotos
 * @param {Array} p.weekDays — Date или ISO строки Пн–Сб
 * @param {Array} p.sections
 * @param {string} p.weekTitle — formatWeek(currentWeekStart)
 */
export function buildPlanningWeekPrintHtml(p) {
  const { rowsWithPhotos, weekDays, sections, weekTitle } = p;
  const todayStr = formatDate(new Date().toISOString());
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const normalizedDays = (weekDays || []).slice(0, 6).map((d) => {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  });

  const printDays = normalizedDays.map((iso, di) => {
    const dt = new Date(`${iso}T12:00:00`);
    return {
      key: iso,
      label: `${dayNames[di] || ''} ${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`,
    };
  });

  const colgroup = buildWeekPrintColgroup(printDays.length);
  const dayHeaderHtml = buildWeekPrintDayHeaderHtml(printDays);

  const sectionsHtml = sections
    .map((section) => {
      const sectionRows = rowsWithPhotos.filter((r) => r.section_id === section.id);
      if (sectionRows.length === 0) return '';

      const bodyRows = sectionRows
        .map((row) => {
          const article = getArticle(row);
          const name = getName(row);
          const qty = getQty(row);
          const client = getClient(row);
          const photoHtml = row.photoBase64
            ? `<img src="${row.photoBase64}" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:3px;border:1px solid #ddd">`
            : `<div style="width:30px;height:30px;background:#e8eaf6;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#3949ab">${escapeHtml(String(article || '?').slice(0, 3))}</div>`;

          const dayCells = printDays
            .map((d, di) => weekPrintDayCellsHtml(row, d.key, di === 0))
            .join('');

          return `<tr>
            <td class="col-photo">${photoHtml}</td>
            <td class="col-art">${escapeHtml(article || '—')}</td>
            <td class="col-name">${escapeHtml(name)}</td>
            <td class="col-client">${escapeHtml(client)}</td>
            <td class="col-qty">${escapeHtml(String(qty !== '' && qty != null ? qty : '—'))}</td>
            ${dayCells}
          </tr>`;
        })
        .join('');

      return `
    <div class="section-header">
      <span>${escapeHtml(section.label)}</span>
      <span style="font-size:8px;opacity:0.8">${sectionRows.length} заказов</span>
    </div>
    <table class="week-print-table">
      ${colgroup}
      <thead>${dayHeaderHtml}</thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Планирование неделя — ERDEN</title>
  <style>${WEEK_PRINT_STYLES}</style>
</head>
<body>
  <!-- erden-week-print:4cols-osn-podg -->
  <div class="page-header">
    <div>
      <div class="page-title">ПЛАНИРОВАНИЕ ПРОИЗВОДСТВА — НЕДЕЛЯ</div>
      <div class="page-meta">${escapeHtml(todayStr)} · ${escapeHtml(weekTitle || '—')} · Заказов: ${rowsWithPhotos.length}</div>
    </div>
    <div class="brand">ERDEN</div>
  </div>
  ${sectionsHtml}
  <div class="signatures">
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Технолог</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Руководитель цеха</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Дата</div></div>
  </div>
</body>
</html>`;
}
