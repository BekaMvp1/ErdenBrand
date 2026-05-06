/**
 * Черновик / превью планирования производства (UI + сохранение + факты раскроя).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useOrderProgress } from '../context/OrderProgressContext';
import { subtractWeeksMonday, addWeeksMonday, formatWeekRangeShort } from '../utils/cycleWeekLabels';
import { toBase64, formatWeek } from '../utils/printUtils';
import {
  buildPlanningMonthPrintHtml,
  buildPlanningWeekPrintHtml,
} from '../utils/planningDraftPrintHtml';
import { getPhoto } from '../utils/planningDraftPrintRowFields';

/** Число колонок: №, Фото, Наименование, Заказчик, Кол-во + 4×(План|Факт) + Итого(План|Факт) */
const DATA_COL_COUNT_MONTH = 15;
/** Режим «неделя»: те же 5 ведущих + 6 дней × 4 ячейки + Итого */
const DATA_COL_COUNT_WEEK = 30;

const PD_DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Ширины ведущих колонок (совпадают с расчётом sticky left при закреплении) */
const PD_COL = {
  num: 36,
  art: 52,
  name: 200,
  cust: 110,
  qty: 110,
  weekCell: 70,
  total: 88,
};

const PD_FROZEN_MODES = [0, 3, 5];

const PD_COL_WIDTH_DEFAULTS = {
  num: 36,
  art: 52,
  name: 200,
  client: 110,
  qty: 110,
};
const PD_WEEK_PLAN_DEFAULT = 80;
const PD_WEEK_FACT_DEFAULT = 80;
const LS_PD_COL_WIDTHS = 'erden_col_widths';
const LS_PD_WEEK_COL_WIDTHS = 'erden_week_col_widths';
/** Общий scope месяц/цех/этаж/неделя — одинаковый для «Планирование месяц» и «Планирование неделя». */
const LS_PD_MONTH = 'erden_pd_month';
const LS_PD_WORKSHOP = 'erden_pd_workshop';
const LS_PD_FLOOR = 'erden_pd_floor';
const LS_PD_WEEK_MONDAY = 'erden_pd_week_monday';

function defaultMonthKeyFromToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readPdSavedScope() {
  if (typeof window === 'undefined') {
    return { month: null, workshop: '', floor: '', weekMonday: null };
  }
  try {
    return {
      month: localStorage.getItem(LS_PD_MONTH),
      workshop: localStorage.getItem(LS_PD_WORKSHOP) ?? '',
      floor: localStorage.getItem(LS_PD_FLOOR) ?? '',
      weekMonday: localStorage.getItem(LS_PD_WEEK_MONDAY),
    };
  } catch {
    return { month: null, workshop: '', floor: '', weekMonday: null };
  }
}
const PD_MIN_LEAD_COL = { num: 28, art: 44, name: 80, client: 72, qty: 72 };
const PD_MAX_LEAD_COL = { num: 44, art: 64, name: 320, client: 180, qty: 110 };
const PD_MIN_WEEK_COL = 40;

/** Ширина ячейки недели: План (pp, mp) / Факт (pf, mf). */
function pdWeekFieldWidth(field, planW, factW) {
  return field === 'pp' || field === 'mp' ? planW : factW;
}

/** Закрепление: 0 — нет; 3 — №+Фото+Наим.; 5 — все ведущие до «Кол-во». */
function leadingStickyLayout(frozenCount, widths) {
  const order = ['num', 'art', 'name', 'cust', 'qty'];
  const nPin =
    frozenCount === 0 ? 0 : frozenCount === 3 ? 3 : frozenCount === 5 ? 5 : 0;
  let x = 0;
  const map = {};
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    const w = widths[k] ?? PD_COL[k];
    if (i < nPin) {
      map[k] = { sticky: true, left: x };
      x += w;
    } else {
      map[k] = { sticky: false, left: 0 };
    }
  }
  return map;
}

/** Разделители Подготовка | Основное и недель */
const PD_BR_PREP_HDR = '2px solid #444';
const PD_BR_PREP_FACT = '2px solid #555';
const PD_BR_WEEK_GAP = '2px solid #888';

/** Цех-исполнитель для строк аутсорса (ключ в payload outsource_workshop) */
const PD_OUTSOURCE_EXECUTOR_OPTIONS = [
  { key: 'floor_4', label: 'Наш цех 4 этаж', short: '4 эт' },
  { key: 'floor_3', label: 'Наш цех 3 этаж', short: '3 эт' },
  { key: 'floor_2', label: 'Наш цех 2 этаж', short: '2 эт' },
  { key: 'aksy', label: 'Аксы', short: 'Аксы' },
  { key: 'external', label: 'Внешний подрядчик', short: 'Внешн.' },
];

function outsourceExecutorShort(key) {
  if (key == null || key === '') return '';
  const o = PD_OUTSOURCE_EXECUTOR_OPTIONS.find((x) => x.key === key);
  return o ? o.short : String(key);
}
/** Высоты строк шапки (px) — для расчёта position: sticky top у 2-й и 3-й строк */
const PD_HEAD_H1 = 56;
const PD_HEAD_H2 = 38;
const PD_HEAD_H3 = 38;
const PD_HEAD_TOP2 = PD_HEAD_H1;
const PD_HEAD_TOP3 = PD_HEAD_H1 + PD_HEAD_H2;
/** Вторая строка шапки «месяц» (План|Факт) по высоте как две строки «неделя». */
const PD_HEAD_MONTH_ROW2 = PD_HEAD_H2 + PD_HEAD_H3;

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getWeekDates(weekStart) {
  const dates = [];
  const d = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 6; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function getWeeksInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const weeks = [];
  let mon = getMonday(first);
  let weekNum = 1;
  while (mon <= last) {
    const sun = new Date(mon + 'T12:00:00');
    sun.setDate(sun.getDate() + 6);
    const dateTo = sun.toISOString().slice(0, 10);
    const dates = getWeekDates(mon);
    const inMonth = dates.some((d) => d >= first && d <= last);
    if (inMonth) {
      weeks.push({
        weekNum,
        label: `${weekNum} неделя`,
        dateFrom: mon,
        dateTo,
      });
      weekNum++;
    }
    mon = new Date(mon + 'T12:00:00');
    mon.setDate(mon.getDate() + 7);
    mon = mon.toISOString().slice(0, 10);
  }
  return weeks;
}

function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDdMm(iso) {
  if (!iso) return '';
  const [yy, mm, dd] = iso.split('-');
  return `${dd}.${mm}`;
}

function addWeeksToMonday(mondayIso, deltaWeeks) {
  const d = new Date(`${mondayIso}T12:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return getMonday(d.toISOString().slice(0, 10));
}

/** Заголовок периода для «Планирование неделя», напр. «31 марта — 5 апреля 2026» */
function formatWeekPeriodTitle(mondayIso) {
  const dates = getWeekDates(mondayIso);
  const a = dates[0];
  const b = dates[5];
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const M1 = MONTH_NAMES_RU[m1 - 1] || '';
  const M2 = MONTH_NAMES_RU[m2 - 1] || '';
  if (y1 === y2) {
    if (m1 === m2) return `${d1}–${d2} ${M2} ${y2}`;
    return `${d1} ${M1} — ${d2} ${M2} ${y2}`;
  }
  return `${d1} ${M1} ${y1} — ${d2} ${M2} ${y2}`;
}

const WEEKDAY_LABELS_FULL = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getWeekDatesFull(weekStart) {
  const dates = [];
  const d = new Date(`${weekStart}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function monthKeyFromIso(isoDate) {
  if (typeof isoDate !== 'string') return '';
  const s = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return s.slice(0, 7);
}

function orderPlanDateIso(order) {
  const candidates = [
    order?.deadline,
    order?.plan_date,
    order?.planned_date,
    order?.planned_deadline,
    order?.date_plan,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const s = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  return '';
}

function formatDeadlineLabelRu(isoDate) {
  if (!isoDate) return '—';
  const dt = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const MONTH_STAGE_COLUMNS = [
  { key: 'prep', label: 'ПОДГОТОВКА' },
  { key: 'main', label: 'ОСНОВНОЕ' },
  { key: 'cut', label: 'РАСКРОЙ' },
  { key: 'sew', label: 'ПОШИВ' },
  { key: 'otk', label: 'ОТК' },
  { key: 'stock', label: 'СКЛАД' },
];

function buildDayCellsMapFromApi(rows) {
  const m = {};
  for (const c of rows || []) {
    const rid = String(c.row_id || '');
    const dt = c.date ? String(c.date).slice(0, 10) : '';
    const ck = String(c.cell_key || '').toLowerCase();
    if (!rid || !dt || !['pp', 'pf', 'mp', 'mf'].includes(ck)) continue;
    if (!m[rid]) m[rid] = {};
    if (!m[rid][dt]) m[rid][dt] = { pp: '', pf: '', mp: '', mf: '' };
    m[rid][dt][ck] = c.cell_value != null ? String(c.cell_value) : '';
  }
  return m;
}

function flattenDayCellsForPersist(tree, dayCellsMap) {
  const out = [];
  for (const sec of tree) {
    if (sec.type !== 'section') continue;
    for (const sub of sec.subsections || []) {
      for (const r of sub.rows || []) {
        const byDate = dayCellsMap[r.id];
        if (!byDate) continue;
        for (const [date, w] of Object.entries(byDate)) {
          if (!w || typeof w !== 'object') continue;
          for (const k of ['pp', 'pf', 'mp', 'mf']) {
            const v = w[k];
            if (v != null && String(v).trim() !== '') {
              out.push({
                row_id: r.id,
                section_key: sec.key,
                subsection_key: sub.key,
                date,
                cell_key: k,
                cell_value: String(v),
              });
            }
          }
        }
      }
    }
  }
  return out;
}

function parseCellNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Подпись заказа: только [артикул] · [наименование], без повторов сегментов.
 * Учитывает model_name/title с «·» и дубли article внутри полей.
 */
function orderDisplayName(o) {
  if (!o) return '';
  const article = String(o.article || o.tz_code || '').trim();
  const explicitName = String(o.name || '').trim();
  let rawName = explicitName || String(o.model_name || '').trim();
  if (!rawName) {
    rawName = String(o.title || '').trim();
    if (article) {
      rawName = rawName
        .replace(new RegExp(`^${escapeRegExp(article)}\\s*[—\\-·]\\s*`, 'i'), '')
        .trim();
    }
  } else if (article) {
    rawName = rawName
      .replace(new RegExp(`^${escapeRegExp(article)}\\s*[—\\-·]\\s*`, 'i'), '')
      .trim();
  }

  const segments = [];
  const seen = new Set();
  const addSeg = (s) => {
    const t = String(s).trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    segments.push(t);
  };

  if (article) addSeg(article);
  for (const part of rawName.split(/\s*·\s*/)) {
    const p = part.trim();
    if (!p) continue;
    if (article && p.toLowerCase() === article.toLowerCase()) continue;
    addSeg(p);
  }

  if (segments.length === 0) {
    const t = String(o.title || '').trim();
    if (t) return t;
    return `Заказ #${o.id}`;
  }
  return segments.join(' · ');
}

/**
 * Ячейки недели строки (аналог planning_draft_cells): понедельник недели + план подготовка/основное.
 * Индекс wi в r.weeks совпадает с allWeeks[weekSliceStart + wi].
 */
function buildDraftWeekCellsForRow(row, allWeeks, weekSliceStart) {
  const out = [];
  const wks = row.weeks || [];
  for (let wi = 0; wi < wks.length; wi++) {
    const abs = weekSliceStart + wi;
    if (abs < 0 || abs >= allWeeks.length) continue;
    const monday = allWeeks[abs]?.dateFrom;
    if (!monday) continue;
    const w = wks[wi] || {};
    out.push({
      week_start: String(monday).slice(0, 10),
      plan_prep: parseCellNum(w.pp),
      plan_main: parseCellNum(w.mp),
    });
  }
  return out;
}

/** Первая по дате неделя с планом основного пошива (mp); если нет — с планом подготовки (pp). */
function getFirstPlannedWeekMonday(cells) {
  const byDate = (a, b) => String(a.week_start).localeCompare(String(b.week_start));
  const withMain = cells.filter((c) => c.plan_main > 0).sort(byDate);
  if (withMain.length) return withMain[0].week_start;
  const withPrep = cells.filter((c) => c.plan_prep > 0).sort(byDate);
  if (withPrep.length) return withPrep[0].week_start;
  return null;
}

/**
 * Строки для POST /api/planning/chain из дерева черновика.
 * @returns {{ rows: Array, skippedNoPlan: number, ordersInTable: number }}
 */
function collectProductionChainRows(
  sectionTree,
  orders,
  allWeeks,
  weekSliceStart,
  purchaseLead,
  cuttingLead,
  otkLead,
  shippingLead
) {
  let skippedNoPlan = 0;
  let ordersInTable = 0;
  const rows = [];
  for (const sec of sectionTree) {
    if (sec.type !== 'section') continue;
    const sectionId = String(sec.key || '').trim().slice(0, 64);
    if (!sectionId) continue;
    for (const sub of sec.subsections || []) {
      for (const r of sub.rows || []) {
        if (r.orderIdx == null || r.orderIdx < 0 || !orders[r.orderIdx]) continue;
        ordersInTable += 1;
        const cells = buildDraftWeekCellsForRow(r, allWeeks, weekSliceStart);
        const hasPlan = cells.some((c) => c.plan_prep > 0 || c.plan_main > 0);
        if (!hasPlan) {
          skippedNoPlan += 1;
          continue;
        }
        const sewingMonday = getFirstPlannedWeekMonday(cells);
        if (!sewingMonday) {
          skippedNoPlan += 1;
          continue;
        }
        const order = orders[r.orderIdx];
        const cuttingMonday = subtractWeeksMonday(sewingMonday, cuttingLead);
        const purchaseMonday = subtractWeeksMonday(sewingMonday, purchaseLead);
        const otkMonday =
          otkLead > 0 ? addWeeksMonday(sewingMonday, otkLead) : sewingMonday;
        const shippingMonday =
          shippingLead > 0 ? addWeeksMonday(otkMonday, shippingLead) : otkMonday;
        rows.push({
          order_id: order.id,
          section_id: sectionId,
          purchase_week_start: purchaseMonday,
          cutting_week_start: cuttingMonday,
          sewing_week_start: sewingMonday,
          otk_week_start: otkMonday,
          shipping_week_start: shippingMonday,
          orderLabel: orderDisplayName(order),
        });
      }
    }
  }
  return { rows, skippedNoPlan, ordersInTable };
}

/** Только DEV: POST цепочки с фиксированными датами (без плана в ячейках). */
function buildDevTestChainPayload(sectionTree, orders, limit = 3) {
  const dates = {
    sewing_week_start: '2026-04-13',
    cutting_week_start: '2026-03-30',
    purchase_week_start: '2026-03-23',
    otk_week_start: '2026-04-13',
    shipping_week_start: '2026-04-13',
  };
  const out = [];
  for (const sec of sectionTree || []) {
    if (sec.type !== 'section') continue;
    const sectionId = String(sec.key || 'floor_4').trim().slice(0, 64) || 'floor_4';
    for (const sub of sec.subsections || []) {
      for (const r of sub.rows || []) {
        if (r.orderIdx == null || r.orderIdx < 0 || !orders[r.orderIdx]) continue;
        const o = orders[r.orderIdx];
        out.push({
          order_id: o.id,
          section_id: sectionId,
          ...dates,
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function orderClientLabel(order) {
  if (!order) return '—';
  const n = order.Client?.name || order.client_name || '';
  return String(n).trim() || '—';
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  return data?.rows ?? data?.data ?? data?.orders ?? data?.clients ?? [];
}

/** Первое фото модели/заказа (JSONB photos или поле image). */
function orderModelImageSrc(order) {
  if (!order) return null;
  if (typeof order.image === 'string' && order.image.trim()) return order.image.trim();
  const photos = order.photos;
  if (Array.isArray(photos)) {
    const first = photos.find((p) => typeof p === 'string' && p.length > 0);
    if (first) return first;
  }
  return null;
}

/** Плоский список строк с заказом для печати планирования. */
function collectFilledPlanningRowsForPrint(tree, ordList) {
  const rows = [];
  for (const sec of tree || []) {
    if (sec.type !== 'section') continue;
    const section_id = sec.key;
    for (const sub of sec.subsections || []) {
      for (const r of sub.rows || []) {
        if (r.orderIdx == null || r.orderIdx < 0 || !ordList[r.orderIdx]) continue;
        const o = ordList[r.orderIdx];
        rows.push({
          id: r.id,
          section_id,
          weeks: r.weeks,
          Order: o,
          order: o,
          article: o.article_no ?? o.article ?? '',
          name: o.name || o.order_name || '',
          client: orderClientLabel(o),
          quantity: getOrderedQty(o),
          imageUrl: orderModelImageSrc(o),
        });
      }
    }
  }
  return rows;
}

function getOrderedQty(order) {
  if (!order) return 0;
  const q = order.total_quantity ?? order.quantity;
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

/** Сумма фактически раскроенного по операциям категории CUTTING (и stage_key cutting). */
function getCuttingActual(order) {
  const ops = order?.OrderOperations;
  if (!Array.isArray(ops) || ops.length === 0) return null;
  let sum = 0;
  let hit = false;
  let hasActual = false;
  for (const op of ops) {
    const cat = (op.Operation?.category || '').toUpperCase();
    const stage = String(op.stage_key || '').toLowerCase();
    if (cat !== 'CUTTING' && stage !== 'cutting') continue;
    hit = true;
    const raw = op.actual_quantity ?? op.actual_qty;
    if (raw != null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        sum += n;
        hasActual = true;
      }
    }
  }
  if (!hit) return null;
  return hasActual ? sum : null;
}

function CameraPlaceholder({ compact }) {
  const box = compact ? 'h-10 w-10' : 'h-9 w-9';
  const iconColor = compact ? '#555' : undefined;
  return (
    <div
      className={`flex ${box} flex-shrink-0 items-center justify-center rounded`}
      style={{ background: 'var(--surface2)', borderRadius: 4 }}
      aria-hidden
    >
      <svg
        className="h-4 w-4"
        style={{ color: iconColor || 'var(--muted)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
  );
}

/** Фото модели в строке: 40×40, превью 200×200 fixed при hover. */
function PhotoCellTable({ src }) {
  const [preview, setPreview] = useState(null);

  const placePreview = (e) => {
    const x = e.clientX + 12;
    const y = e.clientY - 100;
    setPreview({
      src,
      left: Math.max(8, Math.min(x, window.innerWidth - 208)),
      top: Math.max(8, Math.min(y, window.innerHeight - 208)),
    });
  };

  const onEnter = (e) => {
    if (!src) return;
    placePreview(e);
  };

  const onMove = (e) => {
    if (!src) return;
    setPreview((p) => {
      if (!p) return p;
      const x = e.clientX + 12;
      const y = e.clientY - 100;
      return {
        src,
        left: Math.max(8, Math.min(x, window.innerWidth - 208)),
        top: Math.max(8, Math.min(y, window.innerHeight - 208)),
      };
    });
  };

  const onLeave = () => setPreview(null);

  return (
    <>
      <div
        className="photo-cell flex items-center justify-center py-0.5"
        onMouseEnter={onEnter}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {src ? (
          <img
            src={src}
            alt=""
            width={40}
            height={40}
            className="object-cover"
            style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }}
          />
        ) : (
          <CameraPlaceholder compact />
        )}
      </div>
      {preview &&
        createPortal(
          <img
            src={preview.src}
            alt=""
            className="pointer-events-none fixed"
            style={{
              left: preview.left,
              top: preview.top,
              zIndex: 9999,
              width: 200,
              height: 200,
              objectFit: 'cover',
              borderRadius: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            }}
          />,
          document.body
        )}
    </>
  );
}

const WEEK_TEMPLATE = () => [
  { pp: '', pf: '', mp: '', mf: '' },
  { pp: '', pf: '', mp: '', mf: '' },
  { pp: '', pf: '', mp: '', mf: '' },
  { pp: '', pf: '', mp: '', mf: '' },
];

function normalizeWeeksForRow(weeks) {
  const base = WEEK_TEMPLATE();
  if (!weeks || !Array.isArray(weeks)) return base;
  return base.map((b, i) => ({
    ...b,
    ...(weeks[i] && typeof weeks[i] === 'object' ? weeks[i] : {}),
  }));
}

function rowSumPlan(r) {
  let s = 0;
  r.weeks.forEach((w) => {
    s += parseCellNum(w.pp) + parseCellNum(w.mp);
  });
  return s;
}

/** Сумма ручных фактов месяца по заказу (недели 0–3 текущего среза). */
function rowSumMonthFactsForOrder(order, monthFactsByOrderId) {
  if (!order) return 0;
  const id = String(order.id);
  const m = monthFactsByOrderId[id] ?? monthFactsByOrderId[Number(order.id)];
  if (!m) return 0;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const v = m[i];
    if (v != null && Number.isFinite(Number(v))) s += Number(v);
  }
  return s;
}

function rowSumPlanDays(r, dayCellsMap, displayDays) {
  let s = 0;
  for (const iso of displayDays) {
    const w = dayCellsMap[r.id]?.[iso];
    if (!w) continue;
    s += parseCellNum(w.pp) + parseCellNum(w.mp);
  }
  return s;
}

/** Жёсткий список секций черновика (порядок = порядок в tbody). */
const PD_PRODUCTION_SECTIONS = [
  { id: 'floor_4', label: 'Наш цех — 4 этаж', building_floor_id: 4 },
  { id: 'floor_3', label: 'Наш цех — 3 этаж', building_floor_id: 3 },
  { id: 'floor_2', label: 'Наш цех — 2 этаж', building_floor_id: 2 },
  { id: 'aksy', label: 'Аксы', building_floor_id: null },
  { id: 'outsource', label: 'Аутсорс цех', building_floor_id: null },
];

/** Подразделы: client в payload — null (общие), «ВБ», «Анна Москва». */
const PD_SUBSECTION_DEFS = [
  { key: 'general', label: 'Заказчики', draftClient: null },
  { key: 'vb', label: 'ВБ', draftClient: 'ВБ' },
  { key: 'anna_moscow', label: 'Анна Москва', draftClient: 'Анна Москва' },
];

function resolveWorkshopIds(workshops) {
  const list = workshops || [];
  const main =
    list.find((w) => Number(w.floors_count) === 4) || list[0] || null;
  const aksy = list.find((w) => /аксы/i.test(String(w.name || '')));
  const outsource = list.find((w) => /аутсорс/i.test(String(w.name || '')));
  return {
    mainWsId: main?.id ?? null,
    aksyId: aksy?.id ?? null,
    outsourceId: outsource?.id ?? null,
  };
}

function mkEmptySubsections() {
  return PD_SUBSECTION_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    draftClient: d.draftClient,
    rows: [],
  }));
}

function buildHardcodedSectionTree(workshops) {
  const { mainWsId, aksyId, outsourceId } = resolveWorkshopIds(workshops);
  return PD_PRODUCTION_SECTIONS.map((def) => {
    let workshop_id = null;
    if (def.id === 'floor_4' || def.id === 'floor_3' || def.id === 'floor_2') {
      workshop_id = mainWsId;
    } else if (def.id === 'aksy') {
      workshop_id = aksyId;
    } else if (def.id === 'outsource') {
      workshop_id = outsourceId;
    }
    return {
      type: 'section',
      key: def.id,
      label: def.label,
      building_floor_id: def.building_floor_id,
      workshop_id,
      capacityGrid: emptyCapacityGrid(),
      subsections: mkEmptySubsections(),
    };
  });
}

function emptyCapacityGrid() {
  const cell = () => ({ pp: '', pf: '', mp: '', mf: '' });
  return [cell(), cell(), cell(), cell()];
}

function ensureCapacityGrid(sec) {
  if (Array.isArray(sec.capacityGrid) && sec.capacityGrid.length >= 4) {
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
  const legacy = Array.isArray(sec.capacityByWeek) ? sec.capacityByWeek : ['', '', '', ''];
  const pad = [...legacy];
  while (pad.length < 4) pad.push('');
  return [0, 1, 2, 3].map((i) => ({
    pp: '',
    pf: '',
    mp: pad[i] != null ? String(pad[i]) : '',
    mf: '',
  }));
}

function normalizeDraftClientFromSaved(s) {
  if (s.client != null && String(s.client).trim() !== '') {
    const c = String(s.client).trim();
    if (c === 'ВБ' || c === 'Анна Москва') return c;
  }
  const sk = String(s.subsection_key || '');
  if (sk === 'vb') return 'ВБ';
  if (sk === 'anna_moscow') return 'Анна Москва';
  return null;
}

function newPlanRow(sectionKey, subsectionKey) {
  const def = PD_SUBSECTION_DEFS.find((d) => d.key === subsectionKey);
  return {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    num: null,
    sectionKey,
    subsectionKey,
    draftClient: def ? def.draftClient : null,
    orderIdx: null,
    custIdx: null,
    weeks: normalizeWeeksForRow([]),
    outsourceWorkshop: '',
    outsourceContact: '',
    outsourceComment: '',
  };
}

function rowFromSavedPayload(s, orders, clients) {
  const orderIdx =
    s.order_id != null ? orders.findIndex((o) => Number(o.id) === Number(s.order_id)) : -1;
  let custIdx = -1;
  if (s.client_id != null) {
    custIdx = clients.findIndex((c) => Number(c.id) === Number(s.client_id));
  }
  const sectionKey = s.section_id || s.section_key;
  const subsectionKey = s.subsection_key;
  return {
    id: s.id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    num: null,
    sectionKey,
    subsectionKey,
    draftClient: normalizeDraftClientFromSaved(s),
    orderIdx: orderIdx >= 0 ? orderIdx : null,
    custIdx: custIdx >= 0 ? custIdx : null,
    weeks: normalizeWeeksForRow(s.weeks),
    outsourceWorkshop:
      s.outsource_workshop != null && String(s.outsource_workshop).trim() !== ''
        ? String(s.outsource_workshop).trim()
        : '',
    outsourceContact:
      s.outsource_contact != null ? String(s.outsource_contact) : '',
    outsourceComment:
      s.outsource_comment != null ? String(s.outsource_comment) : '',
  };
}

function matchSavedSection(flatSaved, defSec, workshops) {
  const direct = flatSaved.find((s) => s.key === defSec.key);
  if (direct) return direct;

  const legacyFloor = { floor_4: 'bf_4', floor_3: 'bf_3', floor_2: 'bf_2' };
  const leg = legacyFloor[defSec.key];
  if (leg) {
    const hit = flatSaved.find((s) => s.key === leg);
    if (hit) return hit;
  }

  const { aksyId, outsourceId } = resolveWorkshopIds(workshops);

  if (defSec.key === 'aksy') {
    if (aksyId != null) {
      const byWs = flatSaved.find((s) => String(s.workshop_id) === String(aksyId));
      if (byWs) return byWs;
    }
    return flatSaved.find((s) => /аксы/i.test(String(s.label || '')));
  }
  if (defSec.key === 'outsource') {
    if (outsourceId != null) {
      const byWs = flatSaved.find((s) => String(s.workshop_id) === String(outsourceId));
      if (byWs) return byWs;
    }
    return flatSaved.find((s) => /аутсорс/i.test(String(s.label || '')));
  }

  return null;
}

function legacyCapacityByWeekArray(saved, fallbackFour) {
  if (Array.isArray(saved.capacityByWeek) && saved.capacityByWeek.length >= 4) {
    return [0, 1, 2, 3].map((i) =>
      saved.capacityByWeek[i] != null ? String(saved.capacityByWeek[i]) : ''
    );
  }
  const old = saved.capacity != null && saved.capacity !== '' ? String(saved.capacity) : '';
  if (old) return [old, old, old, old];
  return [...fallbackFour];
}

function normalizeCapacityGrid(saved, fallbackGrid) {
  if (Array.isArray(saved.capacityGrid) && saved.capacityGrid.length >= 4) {
    return [0, 1, 2, 3].map((i) => {
      const c =
        saved.capacityGrid[i] && typeof saved.capacityGrid[i] === 'object'
          ? saved.capacityGrid[i]
          : {};
      return {
        pp: c.pp != null ? String(c.pp) : '',
        pf: c.pf != null ? String(c.pf) : '',
        mp: c.mp != null ? String(c.mp) : '',
        mf: c.mf != null ? String(c.mf) : '',
      };
    });
  }
  const legacy = legacyCapacityByWeekArray(saved, ['', '', '', '']);
  return [0, 1, 2, 3].map((i) => ({
    pp: '',
    pf: '',
    mp: legacy[i] ?? '',
    mf: '',
  }));
}

function buildSubsectionsFromSaved(savedSubs, orders, clients, sectionKey) {
  const result = mkEmptySubsections();

  if (!Array.isArray(savedSubs)) return result;

  for (const ex of savedSubs) {
    const rows = Array.isArray(ex.rows) ? ex.rows : [];
    let targetKey = 'general';
    if (ex.key === 'general') targetKey = 'general';
    else if (ex.key === 'vb' || ex.key === 'anna_moscow') targetKey = ex.key;
    else if (String(ex.key || '').startsWith('c_')) {
      const cid = parseInt(String(ex.key).slice(2), 10);
      const c = clients.find((x) => Number(x.id) === cid);
      const nm = String(c?.name || c?.title || '').toLowerCase();
      if (nm.includes('вб')) targetKey = 'vb';
      else if (nm.includes('анна') && nm.includes('москва')) targetKey = 'anna_moscow';
      else targetKey = 'general';
    }

    const bucket = result.find((x) => x.key === targetKey) || result[0];
    for (const raw of rows) {
      bucket.rows.push(
        rowFromSavedPayload(
          {
            ...raw,
            section_key: sectionKey,
            subsection_key: targetKey,
          },
          orders,
          clients
        )
      );
    }
  }
  return result;
}

function hydrateTreeFromPayload(savedFull, orders, clients, workshops) {
  const flat = Array.isArray(savedFull)
    ? savedFull.filter((n) => n.type === 'section')
    : [];
  const defaultTree = buildHardcodedSectionTree(workshops);

  if (flat.length === 0) {
    return defaultTree;
  }

  return defaultTree.map((defSec) => {
    const saved = matchSavedSection(flat, defSec, workshops);
    if (!saved) {
      return { ...defSec, subsections: mkEmptySubsections() };
    }
    const capacityGrid = normalizeCapacityGrid(saved, defSec.capacityGrid);
    const subsections = buildSubsectionsFromSaved(
      saved.subsections,
      orders,
      clients,
      defSec.key
    );
    return {
      ...defSec,
      label: saved.label || defSec.label,
      building_floor_id: saved.building_floor_id ?? defSec.building_floor_id,
      workshop_id: saved.workshop_id ?? defSec.workshop_id,
      capacityGrid,
      subsections,
    };
  });
}

function migrateV1RowsToTree(savedRows, orders, clients, workshops) {
  const tree = buildHardcodedSectionTree(workshops);
  const firstSec = tree[0];
  if (!firstSec || !Array.isArray(savedRows) || savedRows.length === 0) return tree;
  const gen = firstSec.subsections.find((s) => s.key === 'general');
  if (!gen) return tree;
  gen.rows = savedRows.map((s, i) =>
    rowFromSavedPayload(
      {
        ...s,
        id: `mig-${i}`,
        section_key: firstSec.key,
        subsection_key: 'general',
        client: null,
      },
      orders,
      clients
    )
  );
  return tree;
}

function serializeSectionTree(tree, orders, clients) {
  return tree
    .filter((n) => n.type === 'section')
    .map((sec) => {
      const capacityGrid = ensureCapacityGrid(sec).map((w) => ({
        pp: w.pp ?? '',
        pf: w.pf ?? '',
        mp: w.mp ?? '',
        mf: w.mf ?? '',
      }));
      return {
        type: 'section',
        key: sec.key,
        section_id: sec.key,
        label: sec.label,
        building_floor_id: sec.building_floor_id,
        workshop_id: sec.workshop_id,
        capacityGrid,
        subsections: sec.subsections.map((sub) => ({
          key: sub.key,
          label: sub.label,
          rows: sub.rows.map((r) => {
            const o = r.orderIdx != null ? orders[r.orderIdx] : null;
            return {
              id: r.id,
              section_id: sec.key,
              section_key: sec.key,
              subsection_key: sub.key,
              client: r.draftClient ?? null,
              order_id: o?.id ?? null,
              client_id: o?.client_id ?? null,
              outsource_workshop:
                r.outsourceWorkshop != null && String(r.outsourceWorkshop).trim() !== ''
                  ? String(r.outsourceWorkshop).trim()
                  : null,
              outsource_contact: r.outsourceContact ?? '',
              outsource_comment: r.outsourceComment ?? '',
              weeks: r.weeks.map((w) => ({
                pp: w.pp ?? '',
                pf: w.pf ?? '',
                mp: w.mp ?? '',
                mf: w.mf ?? '',
              })),
            };
          }),
        })),
      };
    });
}

function serializeTreeForPayload(tree, orders, clients) {
  return serializeSectionTree(tree, orders, clients);
}

function updateRowInTree(tree, rowId, fn) {
  return tree.map((node) => {
    if (node.type !== 'section') return node;
    return {
      ...node,
      subsections: node.subsections.map((sub) => ({
        ...sub,
        rows: sub.rows.map((r) => (r.id === rowId ? fn(r) : r)),
      })),
    };
  });
}

function addPlanRowToSubsection(tree, sectionKey, subsectionKey) {
  return tree.map((node) => {
    if (node.type !== 'section' || node.key !== sectionKey) return node;
    return {
      ...node,
      subsections: node.subsections.map((sub) =>
        sub.key !== subsectionKey
          ? sub
          : { ...sub, rows: [...sub.rows, newPlanRow(sectionKey, subsectionKey)] }
      ),
    };
  });
}

function setSectionCapacityCellInTree(tree, sectionKey, weekIdx, field, value) {
  const fields = ['pp', 'pf', 'mp', 'mf'];
  if (!fields.includes(field)) return tree;
  return tree.map((n) => {
    if (n.type !== 'section' || n.key !== sectionKey) return n;
    const grid = ensureCapacityGrid(n).map((row) => ({ ...row }));
    grid[weekIdx] = { ...grid[weekIdx], [field]: value };
    return { ...n, capacityGrid: grid };
  });
}

/** Сумма по полю недели (pp / pf / mp / mf) по всем строкам секции. */
function sectionWeekFieldSum(sec, weekIdx, field) {
  if (!sec || weekIdx < 0 || weekIdx > 3) return 0;
  let s = 0;
  for (const sub of sec.subsections) {
    for (const r of sub.rows) {
      const w = r.weeks[weekIdx];
      if (!w) continue;
      s += parseCellNum(w[field]);
    }
  }
  return s;
}

function sectionWeekPlanLoadSum(sec, weekIdx) {
  return sectionWeekFieldSum(sec, weekIdx, 'pp') + sectionWeekFieldSum(sec, weekIdx, 'mp');
}

function sectionWeekDraftFactLoadSum(sec, weekIdx) {
  return sectionWeekFieldSum(sec, weekIdx, 'pf') + sectionWeekFieldSum(sec, weekIdx, 'mf');
}

/** Сумма ручных фактов месяца по строкам секции с выбранным заказом. */
function sectionMonthManualFactSumForWeek(sec, orders, monthFactsByOrderId, weekIdx) {
  if (!sec || weekIdx < 0 || weekIdx > 3) return 0;
  let s = 0;
  for (const sub of sec.subsections) {
    for (const r of sub.rows) {
      if (r.orderIdx === null) continue;
      const o = orders[r.orderIdx];
      if (!o) continue;
      const id = String(o.id);
      const v =
        monthFactsByOrderId[id]?.[weekIdx] ?? monthFactsByOrderId[Number(o.id)]?.[weekIdx];
      if (v != null && Number.isFinite(Number(v))) s += Number(v);
    }
  }
  return s;
}

function sectionDayFieldSum(sec, dateIso, field, dayCellsMap) {
  if (!sec || !dateIso) return 0;
  let s = 0;
  for (const sub of sec.subsections) {
    for (const r of sub.rows) {
      const w = dayCellsMap[r.id]?.[dateIso];
      if (!w) continue;
      s += parseCellNum(w[field]);
    }
  }
  return s;
}

/** Добавить заранее созданную строку (для открытия dropdown сразу после клика). */
function addPlanRowWithId(tree, sectionKey, subsectionKey, row) {
  return tree.map((node) => {
    if (node.type !== 'section' || node.key !== sectionKey) return node;
    return {
      ...node,
      subsections: node.subsections.map((sub) =>
        sub.key !== subsectionKey ? sub : { ...sub, rows: [...sub.rows, row] }
      ),
    };
  });
}

function removeRowFromTree(tree, rowId) {
  return tree.map((node) => {
    if (node.type !== 'section') return node;
    return {
      ...node,
      subsections: node.subsections.map((sub) => ({
        ...sub,
        rows: sub.rows.filter((r) => r.id !== rowId),
      })),
    };
  });
}

function findRowInTree(tree, rowId) {
  for (const node of tree) {
    if (node.type !== 'section') continue;
    for (const sub of node.subsections) {
      const r = sub.rows.find((x) => x.id === rowId);
      if (r) return r;
    }
  }
  return null;
}

function countFilledOrdersInTree(tree) {
  let n = 0;
  for (const node of tree) {
    if (node.type !== 'section') continue;
    for (const sub of node.subsections) {
      for (const r of sub.rows) {
        if (r.orderIdx !== null) n += 1;
      }
    }
  }
  return n;
}

function planningProductionDraftScopeKeyFE(workshopId, floorId, monthKey) {
  const w = workshopId != null && String(workshopId).trim() !== '' ? String(workshopId).trim() : '0';
  const f = floorId != null && String(floorId).trim() !== '' ? String(floorId).trim() : '0';
  const m = String(monthKey || '').trim().slice(0, 7);
  return `w${w}_f${f}_m${m}`;
}

/** Факт раскроя: агрегат из задач раскроя по order_id, иначе fallback на операции заказа. */
function getCutFactForOrder(order, cuttingFactsByOrderId) {
  if (!order) return null;
  const idKey = String(order.id);
  if (
    cuttingFactsByOrderId &&
    Object.prototype.hasOwnProperty.call(cuttingFactsByOrderId, idKey)
  ) {
    const v = cuttingFactsByOrderId[idKey];
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return getCuttingActual(order);
}

/** Сумма факта пошива из модуля Пошив (sewing_fact) по order_id. */
function getSewFactForOrder(order, sewingFactsByOrderId) {
  if (!order) return 0;
  const idKey = String(order.id);
  const raw =
    sewingFactsByOrderId?.[idKey] ?? sewingFactsByOrderId?.[Number(order.id)];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export default function PlanningDraft({ viewMode = 'month' }) {
  const isWeek = viewMode === 'week';
  const { user } = useAuth();
  const { ordersProgress } = useOrderProgress();
  const canPersistDraft = ['admin', 'manager', 'technologist'].includes(user?.role);
  const canBuildProductionChain =
    !isWeek && ['admin', 'manager'].includes(user?.role);
  const [chainModalOpen, setChainModalOpen] = useState(false);
  const [chainPreviewRows, setChainPreviewRows] = useState([]);
  const [chainSaving, setChainSaving] = useState(false);

  const [sectionTree, setSectionTree] = useState(() => buildHardcodedSectionTree([]));
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [monthKey, setMonthKey] = useState(() => {
    const s = readPdSavedScope();
    const m = s.month && /^\d{4}-\d{2}$/.test(String(s.month).trim())
      ? String(s.month).trim().slice(0, 7)
      : null;
    return m || defaultMonthKeyFromToday();
  });
  const [weekStartMonday, setWeekStartMonday] = useState(() => {
    const s = readPdSavedScope();
    const mk =
      s.month && /^\d{4}-\d{2}$/.test(String(s.month).trim())
        ? String(s.month).trim().slice(0, 7)
        : defaultMonthKeyFromToday();
    if (viewMode === 'week') {
      const wm = s.weekMonday && /^\d{4}-\d{2}-\d{2}$/.test(String(s.weekMonday).trim())
        ? String(s.weekMonday).trim().slice(0, 10)
        : null;
      if (wm) return getMonday(wm);
      return getMonday(`${mk}-01`);
    }
    return getMonday(new Date().toISOString().slice(0, 10));
  });
  const [dayCellsMap, setDayCellsMap] = useState({});
  const [capacityDayCells, setCapacityDayCells] = useState({});
  const [weekSliceStart, setWeekSliceStart] = useState(0);
  const [workshopId, setWorkshopId] = useState(() => String(readPdSavedScope().workshop ?? ''));
  const [floorId, setFloorId] = useState(() => String(readPdSavedScope().floor ?? ''));
  const [searchQ, setSearchQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [capacityInput, setCapacityInput] = useState('');
  /** null = все заказчики */
  const [customerFilterClientId, setCustomerFilterClientId] = useState(null);

  /** Агрегат факта раскроя из cutting_tasks, ключ — order_id (строка в JSON). */
  const [cuttingFactsByOrderId, setCuttingFactsByOrderId] = useState({});
  /** Агрегат факта пошива (GET /api/sewing/facts-by-order), ключ — order_id. */
  const [sewingFactsByOrderId, setSewingFactsByOrderId] = useState({});
  const [draftSaveHint, setDraftSaveHint] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const [openDropdown, setOpenDropdown] = useState(null);
  /** После «+ Добавить заказ» — открыть выбор заказа на новой строке. */
  const [pendingOpenRowId, setPendingOpenRowId] = useState(null);
  const [outsourceDrawerRowId, setOutsourceDrawerRowId] = useState(null);
  const [outsourceForm, setOutsourceForm] = useState({
    workshop: '',
    contact: '',
    comment: '',
  });
  const [ddSearch, setDdSearch] = useState('');
  const [ddPos, setDdPos] = useState({ top: 0, left: 0, width: 280 });
  const cellRefs = useRef({});
  const tableScrollRef = useRef(null);
  const ddSearchInputRef = useRef(null);
  const prevDraftScopeRef = useRef(null);
  const lastLoadedMonthKeyRef = useRef(null);
  const ordersRef = useRef(orders);
  const clientsRef = useRef(clients);
  const sectionTreeRef = useRef(sectionTree);
  const workshopsRef = useRef(workshops);
  const weekSliceRef = useRef(weekSliceStart);
  const skipDraftAutosaveRef = useRef(false);
  const draftInitDoneRef = useRef(false);
  const saveDebounceRef = useRef(null);

  ordersRef.current = orders;
  clientsRef.current = clients;
  sectionTreeRef.current = sectionTree;
  workshopsRef.current = workshops;
  weekSliceRef.current = weekSliceStart;

  /** Черновик в API привязан к календарному месяцу (как в «Планирование месяц»), не к месяцу понедельника в изоляции. */
  const effectiveMonthKey = useMemo(
    () => String(monthKey || '').trim().slice(0, 7),
    [monthKey]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LS_PD_MONTH, effectiveMonthKey);
      localStorage.setItem(LS_PD_WORKSHOP, String(workshopId ?? ''));
      localStorage.setItem(LS_PD_FLOOR, String(floorId ?? ''));
      if (isWeek) {
        localStorage.setItem(LS_PD_WEEK_MONDAY, weekStartMonday);
      }
    } catch (_) {
      /* ignore */
    }
  }, [effectiveMonthKey, workshopId, floorId, weekStartMonday, isWeek]);

  const draftScopeKey = useMemo(
    () => planningProductionDraftScopeKeyFE(workshopId, floorId, effectiveMonthKey),
    [workshopId, floorId, effectiveMonthKey]
  );
  const orderIdsQuery = useMemo(() => {
    const ids = (orders || [])
      .map((o) => Number(o?.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    return ids.length ? ids.join(',') : '';
  }, [orders]);

  const displayDays = useMemo(
    () => (isWeek ? getWeekDates(weekStartMonday) : []),
    [isWeek, weekStartMonday]
  );

  const dataColCount = isWeek ? DATA_COL_COUNT_WEEK : DATA_COL_COUNT_MONTH;
  const addRowTailColSpan = dataColCount - 3;
  const leadHeadRowSpan = isWeek ? 3 : 2;

  const [monthFactsByOrderId, setMonthFactsByOrderId] = useState({});
  const [editingMonthFactCell, setEditingMonthFactCell] = useState(null);
  const skipMonthFactBlurSaveRef = useRef(false);

  const [frozenCount, setFrozenCount] = useState(5);
  const [colWidths, setColWidths] = useState(PD_COL_WIDTH_DEFAULTS);
  const [weekColWidths, setWeekColWidths] = useState({
    plan: PD_WEEK_PLAN_DEFAULT,
    fact: PD_WEEK_FACT_DEFAULT,
  });
  const [draggingResize, setDraggingResize] = useState(null);

  const colWidthsRef = useRef(colWidths);
  const weekColWidthsRef = useRef(weekColWidths);
  const resizeRef = useRef({
    active: false,
    kind: null,
    colKey: null,
    weekKind: null,
    startX: 0,
    startW: 0,
  });

  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);
  useEffect(() => {
    weekColWidthsRef.current = weekColWidths;
  }, [weekColWidths]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PD_COL_WIDTHS);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          setColWidths((prev) => ({
            num: Number.isFinite(p.num) ? p.num : prev.num,
            art: Number.isFinite(p.art) ? p.art : prev.art,
            name: Number.isFinite(p.name) ? p.name : prev.name,
            client: Number.isFinite(p.client) ? p.client : prev.client,
            qty: Number.isFinite(p.qty) ? p.qty : prev.qty,
          }));
        }
      }
      const wr = localStorage.getItem(LS_PD_WEEK_COL_WIDTHS);
      if (wr) {
        const p = JSON.parse(wr);
        if (p && typeof p === 'object') {
          if (Number.isFinite(p.plan) || Number.isFinite(p.fact)) {
            setWeekColWidths((prev) => ({
              plan: Number.isFinite(p.plan) ? p.plan : prev.plan,
              fact: Number.isFinite(p.fact) ? p.fact : prev.fact,
            }));
          } else if (Number.isFinite(p.weekColWidth)) {
            const w0 = p.weekColWidth;
            setWeekColWidths({ plan: w0, fact: w0 });
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  const onResizeMove = useCallback((e) => {
    const r = resizeRef.current;
    if (!r.active) return;
    const delta = e.clientX - r.startX;
    if (r.kind === 'lead' && r.colKey) {
      const ck = r.colKey;
      const minW = PD_MIN_LEAD_COL[ck] ?? 30;
      const maxW = PD_MAX_LEAD_COL[ck] ?? 400;
      const newW = Math.min(maxW, Math.max(minW, r.startW + delta));
      setColWidths((prev) => {
        const next = { ...prev, [ck]: newW };
        colWidthsRef.current = next;
        return next;
      });
    } else if (r.kind === 'week' && r.weekKind) {
      const wk = r.weekKind;
      const newW = Math.max(PD_MIN_WEEK_COL, r.startW + delta);
      setWeekColWidths((prev) => {
        const next = { ...prev, [wk]: newW };
        weekColWidthsRef.current = next;
        return next;
      });
    }
  }, []);

  const stopResize = useCallback(() => {
    if (!resizeRef.current.active) return;
    resizeRef.current.active = false;
    setDraggingResize(null);
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', stopResize);
    try {
      localStorage.setItem(LS_PD_COL_WIDTHS, JSON.stringify(colWidthsRef.current));
      localStorage.setItem(LS_PD_WEEK_COL_WIDTHS, JSON.stringify(weekColWidthsRef.current));
    } catch (_) {
      /* ignore */
    }
  }, [onResizeMove]);

  const startResizeLead = useCallback(
    (e, colKey) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        active: true,
        kind: 'lead',
        colKey,
        weekKind: null,
        startX: e.clientX,
        startW: colWidthsRef.current[colKey],
      };
      setDraggingResize(`lead-${colKey}`);
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', stopResize);
    },
    [onResizeMove, stopResize]
  );

  const startResizeWeek = useCallback(
    (e, weekKind) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        active: true,
        kind: 'week',
        colKey: null,
        weekKind,
        startX: e.clientX,
        startW: weekColWidthsRef.current[weekKind],
      };
      setDraggingResize(`week-${weekKind}`);
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', stopResize);
    },
    [onResizeMove, stopResize]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', stopResize);
    };
  }, [onResizeMove, stopResize]);

  const leadWidths = useMemo(
    () => ({
      num: colWidths.num,
      art: colWidths.art,
      name: colWidths.name,
      cust: colWidths.client,
      qty: colWidths.qty,
    }),
    [colWidths]
  );

  const stickyLead = useMemo(
    () => leadingStickyLayout(frozenCount, leadWidths),
    [frozenCount, leadWidths]
  );
  const cycleFrozenCount = useCallback(() => {
    setFrozenCount((c) => {
      const i = PD_FROZEN_MODES.indexOf(c);
      return PD_FROZEN_MODES[(i + 1) % PD_FROZEN_MODES.length];
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQ.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [o, c, w] = await Promise.all([
          api.orders.list({ limit: 500 }),
          api.references.clients(),
          api.workshops.list(true),
        ]);
        if (cancelled) return;
        const normalizedOrders = normalizeList(o);
        console.log('ORDERS LOADED:', normalizedOrders.length, normalizedOrders[0]);
        setOrders(normalizedOrders);
        setClients(normalizeList(c));
        setWorkshops(Array.isArray(w) ? w : normalizeList(w));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e?.message || 'Ошибка загрузки данных');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workshopId) {
      setFloors([]);
      setFloorId('');
      return;
    }
    let cancelled = false;
    api.planning
      .floors(workshopId)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : normalizeList(data);
        setFloors(list);
        setFloorId((prev) => {
          if (prev && list.some((f) => String(f.id) === String(prev))) return prev;
          return '';
        });
      })
      .catch(() => {
        if (!cancelled) setFloors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  const allWeeks = useMemo(() => getWeeksInMonth(effectiveMonthKey), [effectiveMonthKey]);

  useEffect(() => {
    const maxStart = Math.max(0, allWeeks.length - 4);
    setWeekSliceStart((s) => Math.min(s, maxStart));
  }, [effectiveMonthKey, allWeeks.length]);

  const refreshCuttingFacts = useCallback(async () => {
    if (!orderIdsQuery) {
      setCuttingFactsByOrderId({});
      return;
    }
    try {
      const data = await api.cutting.factsByOrder(orderIdsQuery);
      if (data && typeof data === 'object') setCuttingFactsByOrderId(data);
      else setCuttingFactsByOrderId({});
    } catch (e) {
      console.warn('PlanningDraft cutting facts:', e);
      setCuttingFactsByOrderId({});
    }
  }, [orderIdsQuery]);

  const refreshSewingFacts = useCallback(async () => {
    if (!orderIdsQuery) {
      setSewingFactsByOrderId({});
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const data = await api.get(
        `/api/sewing/facts-by-order${orderIdsQuery ? `?order_ids=${encodeURIComponent(orderIdsQuery)}` : ''}`,
        { signal: controller.signal }
      );
      if (data && typeof data === 'object') setSewingFactsByOrderId(data);
      else setSewingFactsByOrderId({});
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.warn('PlanningDraft sewing facts:', e);
      setSewingFactsByOrderId({});
    } finally {
      clearTimeout(timeoutId);
    }
  }, [orderIdsQuery]);

  useEffect(() => {
    refreshCuttingFacts();
    refreshSewingFacts();
    const interval = setInterval(() => {
      refreshCuttingFacts();
      refreshSewingFacts();
    }, 30000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refreshCuttingFacts();
        refreshSewingFacts();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshCuttingFacts, refreshSewingFacts]);

  const displayWeeks = useMemo(() => {
    const slice = allWeeks.slice(weekSliceStart, weekSliceStart + 4);
    const out = [...slice];
    while (out.length < 4) {
      out.push({
        weekNum: '—',
        label: '—',
        dateFrom: '',
        dateTo: '',
      });
    }
    return out;
  }, [allWeeks, weekSliceStart]);

  const gridPeriods = useMemo(() => {
    if (isWeek) {
      return displayDays.map((iso, di) => ({
        key: iso,
        di,
        dayIso: iso,
        w: null,
      }));
    }
    return displayWeeks.map((w, di) => ({
      key: `w-${di}`,
      di,
      dayIso: '',
      w,
    }));
  }, [isWeek, displayDays, displayWeeks]);

  const monthNameRu =
    MONTH_NAMES_RU[parseInt(effectiveMonthKey.split('-')[1], 10) - 1] || '';

  const printMonthPlanning = useCallback(async () => {
    if (isWeek) return;
    setIsPrinting(true);
    try {
      const baseRows = collectFilledPlanningRowsForPrint(sectionTree, orders);
      const rowsWithPhotos = await Promise.all(
        baseRows.map(async (row) => ({
          ...row,
          photoBase64: await toBase64(getPhoto(row)),
        }))
      );
      const sections = PD_PRODUCTION_SECTIONS.map((d) => ({ id: d.id, label: d.label }));
      const year = effectiveMonthKey.split('-')[0];
      const currentMonthLabel = monthNameRu ? `${monthNameRu} ${year}` : effectiveMonthKey;
      const html = buildPlanningMonthPrintHtml({
        rowsWithPhotos,
        allWeeks,
        sections,
        currentMonthLabel,
        weekSliceStart,
        sectionTree,
      });
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 800);
    } finally {
      setIsPrinting(false);
    }
  }, [
    isWeek,
    sectionTree,
    orders,
    allWeeks,
    weekSliceStart,
    effectiveMonthKey,
    monthNameRu,
  ]);

  const printWeekPlanning = useCallback(async () => {
    if (!isWeek) return;
    setIsPrinting(true);
    try {
      const baseRows = collectFilledPlanningRowsForPrint(sectionTree, orders);
      const filledRows = await Promise.all(
        baseRows.map(async (row) => {
          const days = {};
          for (const iso of displayDays) {
            const w = dayCellsMap[row.id]?.[iso] || {};
            days[iso] = {
              plan: parseCellNum(w.pp) + parseCellNum(w.mp),
              fact: parseCellNum(w.pf) + parseCellNum(w.mf),
            };
          }
          return {
            ...row,
            days,
            photoBase64: await toBase64(getPhoto(row)),
          };
        })
      );
      console.log('[Print] первая строка:', filledRows[0]);
      console.log('[Print] ключи:', Object.keys(filledRows[0] || {}));
      const sections = PD_PRODUCTION_SECTIONS.map((d) => ({ id: d.id, label: d.label }));
      const html = buildPlanningWeekPrintHtml({
        rowsWithPhotos: filledRows,
        weekDays: displayDays,
        sections,
        weekTitle: formatWeek(weekStartMonday),
      });
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 800);
    } finally {
      setIsPrinting(false);
    }
  }, [isWeek, sectionTree, orders, displayDays, dayCellsMap, weekStartMonday]);

  const goPrevWeeks = useCallback(() => {
    if (weekSliceStart > 0) setWeekSliceStart((s) => s - 1);
    else setMonthKey((m) => addMonths(m, -1));
  }, [weekSliceStart]);

  const goNextWeeks = useCallback(() => {
    if (weekSliceStart + 4 < allWeeks.length) setWeekSliceStart((s) => s + 1);
    else {
      setMonthKey((m) => addMonths(m, 1));
      setWeekSliceStart(0);
    }
  }, [weekSliceStart, allWeeks.length]);

  const goPrevCalendarWeek = useCallback(() => {
    setWeekStartMonday((m) => addWeeksToMonday(m, -1));
  }, []);
  const goNextCalendarWeek = useCallback(() => {
    setWeekStartMonday((m) => addWeeksToMonday(m, 1));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (lastLoadedMonthKeyRef.current === effectiveMonthKey && prevDraftScopeRef.current === draftScopeKey) {
      return;
    }
    const prev = prevDraftScopeRef.current;
    if (prev === draftScopeKey && prev !== null) return;
    prevDraftScopeRef.current = draftScopeKey;
    lastLoadedMonthKeyRef.current = effectiveMonthKey;

    draftInitDoneRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const payload = await api.planning.productionDraftGet({
          month_key: effectiveMonthKey,
          ...(workshopId ? { workshop_id: workshopId } : {}),
          ...(floorId ? { building_floor_id: floorId } : {}),
        });
        if (cancelled) return;
        skipDraftAutosaveRef.current = true;
        if (payload && typeof payload === 'object') {
          const maxStart = Math.max(0, allWeeks.length - 4);
          const ws = Math.min(
            Math.max(0, parseInt(payload.week_slice_start, 10) || 0),
            maxStart
          );
          setWeekSliceStart(ws);
          if (isWeek && Array.isArray(payload.day_cells)) {
            setDayCellsMap(buildDayCellsMapFromApi(payload.day_cells));
          } else if (!isWeek) {
            setDayCellsMap({});
          }
          if (isWeek && payload.capacity_day_cells && typeof payload.capacity_day_cells === 'object') {
            setCapacityDayCells(payload.capacity_day_cells);
          } else if (!isWeek) {
            setCapacityDayCells({});
          }
        }
        if (payload && typeof payload === 'object' && Array.isArray(payload.sections)) {
          setSectionTree(
            hydrateTreeFromPayload(
              payload.sections,
              ordersRef.current,
              clientsRef.current,
              workshopsRef.current
            )
          );
        } else if (payload && typeof payload === 'object' && Array.isArray(payload.rows)) {
          setSectionTree(
            migrateV1RowsToTree(
              payload.rows,
              ordersRef.current,
              clientsRef.current,
              workshopsRef.current
            )
          );
        } else {
          setSectionTree(buildHardcodedSectionTree(workshopsRef.current));
        }
      } catch (e) {
        console.warn('PlanningDraft draft load:', e);
      } finally {
        if (!cancelled) {
          draftInitDoneRef.current = true;
          setTimeout(() => {
            skipDraftAutosaveRef.current = false;
          }, 150);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, draftScopeKey, effectiveMonthKey, workshopId, floorId, allWeeks.length, isWeek]);

  const persistDraft = useCallback(async () => {
    if (!canPersistDraft || skipDraftAutosaveRef.current) return;
    setDraftSaveHint('Сохранение…');
    try {
      const body = {
        month_key: effectiveMonthKey,
        workshop_id: workshopId || null,
        building_floor_id: floorId || null,
        week_slice_start: weekSliceRef.current,
        version: 2,
        sections: serializeTreeForPayload(
          sectionTreeRef.current,
          ordersRef.current,
          clientsRef.current
        ),
      };
      if (isWeek) {
        body.day_cells = flattenDayCellsForPersist(sectionTreeRef.current, dayCellsMap);
        body.capacity_day_cells = capacityDayCells;
      }
      await api.planning.productionDraftPut(body);
      setDraftSaveHint('Сохранено');
      setTimeout(() => setDraftSaveHint((h) => (h === 'Сохранено' ? '' : h)), 2200);
    } catch (e) {
      console.error(e);
      setDraftSaveHint(e?.message || 'Ошибка сохранения');
    }
  }, [canPersistDraft, effectiveMonthKey, workshopId, floorId, isWeek, dayCellsMap, capacityDayCells]);

  useEffect(() => {
    setEditingMonthFactCell(null);
    if (loading || isWeek) {
      if (isWeek) setMonthFactsByOrderId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.planning.monthFactsGet({
          month_key: effectiveMonthKey,
          workshop_id: workshopId,
          building_floor_id: floorId,
          week_slice_start: weekSliceStart,
        });
        if (cancelled) return;
        const byOrder = {};
        for (const f of res.facts || []) {
          const oid = String(f.order_id);
          if (!byOrder[oid]) byOrder[oid] = {};
          byOrder[oid][f.week_index] =
            f.value != null && Number.isFinite(Number(f.value)) ? Number(f.value) : 0;
        }
        setMonthFactsByOrderId(byOrder);
      } catch (e) {
        if (!cancelled) setMonthFactsByOrderId({});
        console.warn('PlanningDraft month-facts:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, isWeek, effectiveMonthKey, workshopId, floorId, weekSliceStart]);

  const persistMonthFact = useCallback(
    async (orderId, weekIndex, raw) => {
      if (!canPersistDraft) return;
      const trimmed = String(raw ?? '').trim();
      const n = trimmed === '' ? 0 : Number(trimmed);
      const value = Number.isFinite(n) ? Math.round(n) : 0;
      try {
        await api.planning.monthFactPost({
          month_key: effectiveMonthKey,
          workshop_id: workshopId || null,
          building_floor_id: floorId || null,
          week_slice_start: weekSliceStart,
          order_id: orderId,
          week_index: weekIndex,
          value,
        });
        const oid = String(orderId);
        setMonthFactsByOrderId((prev) => ({
          ...prev,
          [oid]: { ...(prev[oid] || {}), [weekIndex]: value },
        }));
      } catch (e) {
        console.error(e);
        alert(e?.message || 'Не удалось сохранить факт');
      }
    },
    [canPersistDraft, effectiveMonthKey, workshopId, floorId, weekSliceStart]
  );

  useEffect(() => {
    if (loading || !canPersistDraft) return;
    if (!draftInitDoneRef.current) return;
    if (skipDraftAutosaveRef.current) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      persistDraft();
    }, 900);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [
    sectionTree,
    weekSliceStart,
    dayCellsMap,
    capacityDayCells,
    loading,
    canPersistDraft,
    persistDraft,
  ]);

  const handleSaveDraftClick = useCallback(() => {
    if (!canPersistDraft) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    persistDraft();
  }, [canPersistDraft, persistDraft]);

  const filteredOrders = useMemo(() => {
    const q = ddSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const name = orderDisplayName(o).toLowerCase();
      const art = String(o.article || o.tz_code || '').toLowerCase();
      const cl = (o.Client?.name || '').toLowerCase();
      return name.includes(q) || art.includes(q) || cl.includes(q);
    });
  }, [orders, ddSearch]);

  const scheduleOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      const orderWorkshopId = o?.workshop_id ?? o?.Workshop?.id ?? null;
      const orderFloorId = o?.building_floor_id ?? o?.floor_id ?? o?.Floor?.id ?? null;
      if (workshopId && String(orderWorkshopId) !== String(workshopId)) return false;
      if (floorId && String(orderFloorId) !== String(floorId)) return false;
      if (customerFilterClientId != null && Number(o?.client_id) !== Number(customerFilterClientId)) {
        return false;
      }
      if (debouncedSearch) {
        const hay = [
          orderDisplayName(o),
          o?.article || '',
          o?.tz_code || '',
          orderClientLabel(o),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [orders, workshopId, floorId, customerFilterClientId, debouncedSearch]);

  const weeklyScheduleDates = useMemo(
    () => (isWeek ? getWeekDatesFull(weekStartMonday) : []),
    [isWeek, weekStartMonday]
  );

  const weeklyScheduleByDate = useMemo(() => {
    const map = {};
    for (const d of weeklyScheduleDates) map[d] = [];
    for (const order of scheduleOrders) {
      const dateIso = orderPlanDateIso(order);
      if (!dateIso || !map[dateIso]) continue;
      map[dateIso].push(order);
    }
    for (const d of weeklyScheduleDates) {
      map[d].sort((a, b) => orderDisplayName(a).localeCompare(orderDisplayName(b), 'ru'));
    }
    return map;
  }, [scheduleOrders, weeklyScheduleDates]);

  const monthCalendarData = useMemo(() => {
    if (isWeek) return { leading: 0, dates: [] };
    const [y, m] = effectiveMonthKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return { leading: 0, dates: [] };
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const mondayBased = (first.getDay() + 6) % 7;
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return { leading: mondayBased, dates };
  }, [effectiveMonthKey, isWeek]);

  const monthScheduleByDate = useMemo(() => {
    const map = {};
    for (const d of monthCalendarData.dates) map[d] = [];
    for (const order of scheduleOrders) {
      const dateIso = orderPlanDateIso(order);
      if (!dateIso) continue;
      if (monthKeyFromIso(dateIso) !== effectiveMonthKey) continue;
      if (!map[dateIso]) continue;
      map[dateIso].push(order);
    }
    for (const d of monthCalendarData.dates) {
      map[d].sort((a, b) => orderDisplayName(a).localeCompare(orderDisplayName(b), 'ru'));
    }
    return map;
  }, [scheduleOrders, monthCalendarData, effectiveMonthKey]);

  const monthPlanStorageKey = useMemo(
    () => `erden_month_stage_cells:${effectiveMonthKey}`,
    [effectiveMonthKey]
  );
  const [monthStageCells, setMonthStageCells] = useState({});
  const [savingMonthCell, setSavingMonthCell] = useState(null);

  useEffect(() => {
    if (isWeek) return;
    try {
      const raw = localStorage.getItem(monthPlanStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      setMonthStageCells(parsed && typeof parsed === 'object' ? parsed : {});
    } catch (_) {
      setMonthStageCells({});
    }
  }, [isWeek, monthPlanStorageKey]);

  useEffect(() => {
    if (isWeek) return;
    try {
      localStorage.setItem(monthPlanStorageKey, JSON.stringify(monthStageCells || {}));
    } catch (_) {
      // ignore localStorage errors
    }
  }, [isWeek, monthPlanStorageKey, monthStageCells]);

  const monthOrders = useMemo(() => {
    if (isWeek) return [];
    return scheduleOrders.filter((o) => {
      const dateIso = orderPlanDateIso(o);
      const monthByDate = monthKeyFromIso(dateIso);
      const monthByPlan = String(o?.planned_month || '').slice(0, 7);
      // Мягкий фильтр: если в заказе нет явного месяца/даты плана — не скрываем заказ.
      if (!monthByDate && !monthByPlan) return true;
      return monthByDate === effectiveMonthKey || monthByPlan === effectiveMonthKey;
    });
  }, [isWeek, scheduleOrders, effectiveMonthKey]);

  const monthGroups = useMemo(() => {
    const map = new Map();
    monthOrders.forEach((o) => {
      const wkId = String(o?.workshop_id ?? o?.Workshop?.id ?? 'none');
      if (!map.has(wkId)) {
        map.set(wkId, {
          key: wkId,
          workshop_id: o?.workshop_id ?? o?.Workshop?.id ?? null,
          label: o?.Workshop?.name || (wkId === 'none' ? 'Без цеха' : `Цех #${wkId}`),
          items: [],
        });
      }
      map.get(wkId).items.push(o);
    });
    const list = Array.from(map.values());
    list.forEach((g) => {
      g.items.sort((a, b) => orderDisplayName(a).localeCompare(orderDisplayName(b), 'ru'));
    });
    list.sort((a, b) => String(a.label).localeCompare(String(b.label), 'ru'));
    return list;
  }, [monthOrders]);

  const getMonthStageCellValue = useCallback(
    (orderId, dayIso, stageKey, kind) =>
      monthStageCells?.[String(orderId)]?.[`${dayIso}_${stageKey}_${kind}`] || '',
    [monthStageCells]
  );

  const setMonthStageCell = useCallback((orderId, dayIso, stageKey, kind, value) => {
    setMonthStageCells((prev) => ({
      ...prev,
      [String(orderId)]: {
        ...(prev[String(orderId)] || {}),
        [`${dayIso}_${stageKey}_${kind}`]: value || '',
      },
    }));
  }, []);

  const saveMonthStageCell = useCallback(
    async (order, dayIso, stageKey, kind, value) => {
      if (!order?.id) return;
      setSavingMonthCell(`${order.id}:${dayIso}:${stageKey}:${kind}`);
      try {
        // Backend route остается прежним; фиксируем принадлежность к выбранному месяцу.
        await api.orders.update(order.id, { planned_month: effectiveMonthKey });
        setMonthStageCell(order.id, dayIso, stageKey, kind, value);
      } catch (e) {
        alert(e?.message || 'Ошибка сохранения даты');
      } finally {
        setSavingMonthCell(null);
      }
    },
    [effectiveMonthKey, setMonthStageCell]
  );

  const rowMatchesFilter = useCallback(
    (r) => {
      if (!debouncedSearch) return true;
      const o = r.orderIdx !== null ? orders[r.orderIdx] : null;
      const cust = r.custIdx !== null ? clients[r.custIdx] : null;
      const hay = [
        o ? orderDisplayName(o) : '',
        o?.article || '',
        o?.tz_code || '',
        cust?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(debouncedSearch);
    },
    [debouncedSearch, orders, clients]
  );

  const clientsSorted = useMemo(
    () =>
      [...clients].sort((a, b) =>
        String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''), 'ru')
      ),
    [clients]
  );

  const rowMatchesCustomerFilter = useCallback(
    (r) => {
      if (customerFilterClientId == null) return true;
      const o = r.orderIdx !== null ? orders[r.orderIdx] : null;
      const fromOrder = o?.client_id;
      const fromPick = r.custIdx !== null ? clients[r.custIdx]?.id : null;
      const cid = fromOrder ?? fromPick;
      if (cid == null || cid === '') return true;
      return Number(cid) === Number(customerFilterClientId);
    },
    [customerFilterClientId, orders, clients]
  );

  const filledCount = useMemo(() => countFilledOrdersInTree(sectionTree), [sectionTree]);

  const totalDataRows = useMemo(
    () =>
      sectionTree.reduce((acc, n) => {
        if (n.type !== 'section') return acc;
        return (
          acc +
          n.subsections.reduce((a, sub) => a + sub.rows.length, 0)
        );
      }, 0),
    [sectionTree]
  );

  const updateWeekCell = (rowId, weekIdx, field, value) => {
    setSectionTree((prev) =>
      updateRowInTree(prev, rowId, (r) => ({
        ...r,
        weeks: r.weeks.map((w, wi) => (wi === weekIdx ? { ...w, [field]: value } : w)),
      }))
    );
  };

  const updateDayCell = (rowId, dateIso, field, value) => {
    setDayCellsMap((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [dateIso]: {
          ...(prev[rowId]?.[dateIso] || { pp: '', pf: '', mp: '', mf: '' }),
          [field]: value,
        },
      },
    }));
  };

  const setCapacityDayField = (sectionKey, dateIso, field, value) => {
    setCapacityDayCells((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [dateIso]: {
          ...(prev[sectionKey]?.[dateIso] || { pp: '', pf: '', mp: '', mf: '' }),
          [field]: value,
        },
      },
    }));
  };

  const distributeWeekPlanToDays = useCallback(() => {
    if (!isWeek) return;
    if (
      !window.confirm(
        'Распределить недельные планы (подготовка и основной — план) равномерно по рабочим дням?'
      )
    ) {
      return;
    }
    const tree = sectionTreeRef.current;
    const weeksOfMonth = getWeeksInMonth(effectiveMonthKey);
    const wi = weeksOfMonth.findIndex(
      (w) => weekStartMonday >= w.dateFrom && weekStartMonday <= w.dateTo
    );
    if (wi < 0) return;
    const nd = displayDays.length || 6;
    setDayCellsMap((prev) => {
      const next = { ...prev };
      for (const sec of tree) {
        if (sec.type !== 'section') continue;
        for (const sub of sec.subsections) {
          for (const r of sub.rows) {
            const wk = r.weeks[wi];
            if (!wk) continue;
            for (const field of ['pp', 'mp']) {
              const total = parseCellNum(wk[field]);
              if (total <= 0) continue;
              const per = Math.max(0, Math.round(total / nd));
              if (!next[r.id]) next[r.id] = {};
              for (const iso of displayDays) {
                if (!next[r.id][iso]) next[r.id][iso] = { pp: '', pf: '', mp: '', mf: '' };
                next[r.id][iso][field] = per > 0 ? String(per) : '';
              }
            }
          }
        }
      }
      return next;
    });
  }, [isWeek, effectiveMonthKey, weekStartMonday, displayDays]);

  const openProductionChainModal = useCallback(async () => {
    if (!canBuildProductionChain) return;
    try {
      if (import.meta.env.DEV) console.log('[Chain] загрузка настроек цикла...');
      const cfg = await api.settings.productionCycleGet();
      if (import.meta.env.DEV) console.log('[Chain] настройки:', cfg);
      const p = Math.min(8, Math.max(1, Number(cfg.purchaseLeadWeeks) || 3));
      const c = Math.min(6, Math.max(1, Number(cfg.cuttingLeadWeeks) || 2));
      const otkN = Number(cfg.otkLeadWeeks);
      const o = Math.min(4, Math.max(0, Number.isFinite(otkN) ? otkN : 1));
      const shipN = Number(cfg.shippingLeadWeeks);
      const sh = Math.min(4, Math.max(0, Number.isFinite(shipN) ? shipN : 0));
      const tree = sectionTreeRef.current;
      const ord = ordersRef.current;
      if (import.meta.env.DEV) {
        console.log('[Chain] заказы из планирования (массив orders, длина):', ord?.length, ord);
      }
      const weeks = getWeeksInMonth(effectiveMonthKey);
      const { rows, skippedNoPlan, ordersInTable } = collectProductionChainRows(
        tree,
        ord,
        weeks,
        weekSliceRef.current,
        p,
        c,
        o,
        sh
      );
      if (import.meta.env.DEV) {
        console.log('[Chain] вычисленная цепочка:', rows);
        console.log('[Chain] в таблице заказов:', ordersInTable, 'пропущено без плана:', skippedNoPlan);
      }
      if (ordersInTable === 0) {
        alert('Добавьте заказы в таблицу планирования.');
        return;
      }
      if (rows.length === 0) {
        alert(
          'Заполните план (колонки «Подготовка — План» или «Основное — План») хотя бы для одного заказа.'
        );
        return;
      }
      if (skippedNoPlan > 0) {
        const w =
          skippedNoPlan % 10 === 1 && skippedNoPlan % 100 !== 11
            ? 'заказ пропущен'
            : skippedNoPlan % 10 >= 2 &&
                skippedNoPlan % 10 <= 4 &&
                (skippedNoPlan % 100 < 10 || skippedNoPlan % 100 >= 20)
              ? 'заказа пропущены'
              : 'заказов пропущено';
        alert(`⚠️ ${skippedNoPlan} ${w} — не заполнен план по неделям`);
      }
      setChainPreviewRows(rows);
      setChainModalOpen(true);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Chain] ошибка:', e);
      alert(e?.message || 'Не удалось подготовить цепочку');
    }
  }, [canBuildProductionChain, effectiveMonthKey]);

  const confirmProductionChainSave = useCallback(async () => {
    setChainSaving(true);
    try {
      const payload = chainPreviewRows.map((r) => ({
        order_id: r.order_id,
        section_id: r.section_id,
        purchase_week_start: r.purchase_week_start,
        cutting_week_start: r.cutting_week_start,
        sewing_week_start: r.sewing_week_start,
        otk_week_start: r.otk_week_start,
        shipping_week_start: r.shipping_week_start,
      }));
      if (import.meta.env.DEV) {
        console.log('[Chain] отправляем:', payload);
        console.log('[Chain] POST /api/planning/chain, записей:', payload.length);
      }
      const res = await api.planning.chainPost(payload);
      if (import.meta.env.DEV) console.log('[Chain] ответ сохранения:', res);
      const ids = Array.isArray(res?.ids) ? res.ids : [];
      if (ids.length > 0) {
        await api.planning.chainSyncDocuments(ids).catch((e) => {
          if (import.meta.env.DEV) console.warn('[Chain] sync-documents:', e);
        });
      }
      setChainModalOpen(false);
      setChainPreviewRows([]);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Chain] ошибка сохранения:', e);
      alert(e?.message || 'Ошибка сохранения');
    } finally {
      setChainSaving(false);
    }
  }, [chainPreviewRows]);

  const createDevTestProductionChain = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    const tree = sectionTreeRef.current;
    const ord = ordersRef.current;
    const testChain = buildDevTestChainPayload(tree, ord, 3);
    if (testChain.length === 0) {
      alert('Нет строк с заказами в таблице');
      return;
    }
    console.log('[Test] отправляем тестовую цепочку:', testChain);
    try {
      const res = await api.planning.chainPost(testChain);
      console.log('[Test] результат:', res);
      const n = res?.saved ?? 0;
      alert(`Тестовая цепочка создана: ${n} записей`);
    } catch (e) {
      console.error('[Test]', e);
      alert(e?.message || 'Ошибка');
    }
  }, []);

  const openOrderDropdown = useCallback((rowId, el) => {
    if (openDropdown === rowId) {
      setOpenDropdown(null);
      setDdSearch('');
      return;
    }
    const rect = el.getBoundingClientRect();
    const w = Math.max(rect.width, 280);
    const estH = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < estH && rect.top > estH;
    setDdPos({
      left: rect.left,
      width: w,
      top: flip ? Math.max(8, rect.top - estH) : rect.bottom + 4,
    });
    setOpenDropdown(rowId);
    setDdSearch('');
  }, [openDropdown]);

  useEffect(() => {
    if (!pendingOpenRowId) return;
    const id = pendingOpenRowId;
    const raf = requestAnimationFrame(() => {
      const el = cellRefs.current[id];
      if (el) openOrderDropdown(id, el);
      setPendingOpenRowId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingOpenRowId, sectionTree, openOrderDropdown]);

  useEffect(() => {
    if (!openDropdown) return;
    const onDoc = (e) => {
      const t = e.target;
      const cell = cellRefs.current[openDropdown];
      if (cell && cell.contains(t)) return;
      const pop = document.getElementById('planning-draft-order-popup');
      if (pop && pop.contains(t)) return;
      setOpenDropdown(null);
      setDdSearch('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openDropdown]);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el || !openDropdown) return;
    const onScroll = () => {
      setOpenDropdown(null);
      setDdSearch('');
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown) return;
    const onResize = () => {
      setOpenDropdown(null);
      setDdSearch('');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [openDropdown]);

  useEffect(() => {
    if (openDropdown && ddSearchInputRef.current) {
      const t = requestAnimationFrame(() => ddSearchInputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [openDropdown]);

  useEffect(() => {
    if (!outsourceDrawerRowId) return;
    const r = findRowInTree(sectionTreeRef.current, outsourceDrawerRowId);
    if (r) {
      setOutsourceForm({
        workshop: r.outsourceWorkshop || '',
        contact: r.outsourceContact || '',
        comment: r.outsourceComment || '',
      });
    }
  }, [outsourceDrawerRowId]);

  useEffect(() => {
    if (!outsourceDrawerRowId) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOutsourceDrawerRowId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [outsourceDrawerRowId]);

  const saveOutsourceDrawer = useCallback(() => {
    if (!outsourceDrawerRowId) return;
    setSectionTree((prev) =>
      updateRowInTree(prev, outsourceDrawerRowId, (row) => ({
        ...row,
        outsourceWorkshop: outsourceForm.workshop,
        outsourceContact: outsourceForm.contact,
        outsourceComment: outsourceForm.comment,
      }))
    );
    setOutsourceDrawerRowId(null);
  }, [outsourceDrawerRowId, outsourceForm]);

  const selectOrder = (rowId, idx) => {
    setSectionTree((prev) =>
      updateRowInTree(prev, rowId, (r) => ({ ...r, orderIdx: idx }))
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const clearOrder = (rowId) => {
    setSectionTree((prev) =>
      updateRowInTree(prev, rowId, (r) => ({ ...r, orderIdx: null }))
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const monthOptions = useMemo(() => {
    const opts = [];
    const d = new Date();
    for (let i = -6; i <= 6; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() + i, 1);
      const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
      opts.push({
        key,
        label: `${MONTH_NAMES_RU[x.getMonth()]} ${x.getFullYear()}`,
      });
    }
    return opts;
  }, []);

  const inputCls =
    'w-full bg-transparent border-0 text-center text-xs py-1.5 px-1 outline-none focus:bg-[rgba(107,175,0,0.08)] focus:text-[#d4efaa]';

  if (loading) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center gap-3 text-sm"
        style={{ color: 'var(--muted)' }}
      >
        <span
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
        Загрузка…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6 text-center"
        style={{
          background: 'var(--bg2)',
          borderColor: 'var(--border)',
          color: 'var(--danger)',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-0 pb-4" style={{ color: 'var(--text)' }}>
      <style>{`
        @keyframes pd-art-preview-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .planning-draft-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .planning-draft-scroll::-webkit-scrollbar-track { background: var(--bg); }
        .planning-draft-scroll::-webkit-scrollbar-thumb {
          background: var(--surface2);
          border-radius: 4px;
        }
        .planning-draft-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        .pd-draft-table .col-resize-handle {
          position: absolute;
          right: 0;
          top: 0;
          width: 6px;
          height: 100%;
          cursor: col-resize;
          z-index: 10;
          user-select: none;
        }
        .pd-draft-table .col-resize-handle:hover,
        .pd-draft-table .col-resize-handle.active {
          background: #c8ff00;
          opacity: 0.6;
        }
        .pd-draft-table .qty-cell {
          padding: 4px 6px;
          vertical-align: middle;
        }
        .pd-draft-table .qty-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px 8px;
          font-size: 11px;
        }
        .pd-draft-table .qty-item {
          display: flex;
          justify-content: space-between;
          gap: 4px;
          align-items: center;
          min-width: 0;
        }
        .pd-draft-table .qty-grid .qty-label {
          color: #666;
          font-size: 10px;
          white-space: nowrap;
        }
        .pd-draft-table .qty-val {
          font-weight: 600;
          font-size: 11px;
          text-align: right;
        }
        .pd-draft-table tbody tr.pd-data-row {
          height: 56px;
          max-height: 56px;
        }
        .pd-draft-table tbody tr.pd-data-row > td {
          max-height: 56px;
          vertical-align: middle;
        }
        .pd-draft-table tbody tr.pd-data-row > td.pd-num-cell {
          overflow: visible;
        }
        .pd-draft-table tbody tr.pd-data-row input[type="number"] {
          padding-top: 2px;
          padding-bottom: 2px;
        }
        .pd-draft-table .gp-name-ellipsis {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pd-draft-table .section-header td {
          background: #2a2a1a;
          color: #c8ff00;
          font-weight: 700;
          font-size: 14px;
          padding: 10px 16px;
          border-top: 2px solid #444;
        }
        .pd-draft-table .subsection-header td {
          background: #1e1e14;
          color: #888;
          font-size: 13px;
          padding: 6px 16px 6px 32px;
        }
        .pd-draft-table .add-row td {
          padding: 4px 16px 4px 48px;
          color: #c8ff00;
          cursor: pointer;
          font-size: 12px;
          background: var(--bg);
        }
        .pd-draft-table .add-row:hover td { background: #1a2000; }
        .pd-draft-table .summary-row td {
          background: #111;
          font-weight: 600;
          font-size: 12px;
          letter-spacing: 0.05em;
          padding: 6px 16px;
          border-top: 1px solid #333;
        }
        .pd-draft-table .summary-row td,
        .pd-draft-table .section-header td,
        .pd-draft-table .subsection-header td,
        .pd-draft-table .add-row td {
          border-color: var(--border);
        }
      `}</style>

      {/* Top bar */}
      <header
        className="sticky top-0 z-[300] flex flex-wrap items-center gap-3 border-b px-4 py-3"
        style={{
          background: 'var(--bg2)',
          borderColor: 'var(--border)',
        }}
      >
        <span
          className="rounded px-2 py-0.5 text-xs font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {isWeek ? 'НЕДЕЛЯ' : 'МЕСЯЦ'}
        </span>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {isWeek ? 'Планирование неделя' : 'Планирование месяц'}
        </h1>
      </header>

      {/* Stats */}
      <div
        className="flex flex-wrap gap-2.5 px-[18px] py-2.5"
        style={{ gap: '10px', padding: '10px 18px' }}
      >
        {[
          { label: 'Всего строк', value: totalDataRows, color: '#58a6ff' },
          { label: 'Заполнено', value: filledCount, color: 'var(--accent)' },
          { label: 'Выполнено', value: 0, color: 'var(--accent)' },
          { label: '% выполнения', value: '0%', color: 'var(--warn)' },
        ].map((c) => (
          <div
            key={c.label}
            className="min-w-[120px] flex-1 rounded-[10px] border px-[18px] py-2.5"
            style={{
              background: 'var(--bg2)',
              borderColor: 'var(--border)',
              padding: '10px 18px',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {c.label}
            </div>
            <div className="text-xl font-bold" style={{ color: c.color }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
        style={{ background: 'var(--bg2)', borderColor: 'var(--border)', gap: '8px' }}
      >
        <select
          className="rounded border px-2 py-1.5 text-sm outline-none"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          value={monthKey}
          onChange={(e) => {
            const mk = e.target.value;
            setMonthKey(mk);
            setWeekSliceStart(0);
            if (isWeek) {
              setWeekStartMonday(getMonday(`${mk}-01`));
            }
          }}
        >
          {monthOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        {!isWeek ? (
          <select
            className="rounded border px-2 py-1.5 text-sm outline-none"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
            value={String(weekSliceStart)}
            onChange={(e) => setWeekSliceStart(parseInt(e.target.value, 10) || 0)}
          >
            {Array.from({ length: Math.max(1, allWeeks.length - 3) }, (_, i) => (
              <option key={i} value={String(i)}>
                Недели {i + 1}–{Math.min(i + 4, allWeeks.length)}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="shrink-0 rounded border px-2 py-1.5 text-sm"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            {formatWeekPeriodTitle(weekStartMonday)}
          </span>
        )}

        <select
          className="rounded border px-2 py-1.5 text-sm outline-none"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          value={workshopId}
          onChange={(e) => setWorkshopId(e.target.value)}
        >
          <option value="">Цех</option>
          {workshops.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <select
          className="rounded border px-2 py-1.5 text-sm outline-none"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          value={floorId}
          onChange={(e) => setFloorId(e.target.value)}
          disabled={!workshopId}
        >
          <option value="">Этаж</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <input
          type="search"
          placeholder="Поиск (клиент / модель)"
          className="rounded border px-2 py-1.5 text-sm outline-none"
          style={{
            width: '140px',
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />

        <div className="h-6 w-px shrink-0" style={{ background: 'var(--border)' }} />

        <button
          type="button"
          className="rounded border px-2 py-1.5 text-sm transition-colors"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          onClick={isWeek ? goPrevCalendarWeek : goPrevWeeks}
        >
          ← Предыдущая
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1.5 text-sm transition-colors"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          onClick={isWeek ? goNextCalendarWeek : goNextWeeks}
        >
          Следующая →
        </button>

        {isWeek ? (
          <button
            type="button"
            className="rounded border px-2 py-1.5 text-sm transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            onClick={distributeWeekPlanToDays}
          >
            📅 Распределить по дням
          </button>
        ) : null}

        <button
          type="button"
          className="rounded border px-2 py-1.5 text-sm transition-colors"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          title="Переключить закрепление колонок слева при горизонтальном скролле"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          onClick={cycleFrozenCount}
        >
          | ◀▶ Закреп: {frozenCount}
        </button>

        <div className="h-6 w-px shrink-0" style={{ background: 'var(--border)' }} />

        <input
          type="number"
          placeholder="Мощность"
          className="rounded border px-1 py-1.5 text-sm outline-none"
          style={{
            width: '60px',
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          value={capacityInput}
          onChange={(e) => setCapacityInput(e.target.value)}
        />

        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Сохранить мощность
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
          disabled={!canPersistDraft}
          onClick={handleSaveDraftClick}
        >
          Сохранить
        </button>
        {canBuildProductionChain ? (
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: 'var(--surface)',
              borderColor: '#c8ff00',
              color: '#c8ff00',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(200,255,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface)';
            }}
            onClick={openProductionChainModal}
          >
            ⛓ Сформировать план цеха
          </button>
        ) : null}
        {draftSaveHint ? (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {draftSaveHint}
          </span>
        ) : null}
        <button
          type="button"
          disabled={isPrinting}
          style={{
            background: '#1a237e',
            color: '#fff',
            border: 'none',
            padding: '7px 16px',
            borderRadius: 6,
            cursor: isPrinting ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: isPrinting ? 0.85 : 1,
          }}
          onClick={() => {
            if (isWeek) printWeekPlanning();
            else printMonthPlanning();
          }}
        >
          {isPrinting ? '⏳...' : '🖨 Печать'}
        </button>
      </div>

      {isWeek ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Заказчик:
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
              style={{
                borderColor: customerFilterClientId == null ? 'var(--accent)' : 'var(--border)',
                background:
                  customerFilterClientId == null ? 'rgba(107,175,0,0.18)' : 'var(--surface)',
                color: customerFilterClientId == null ? '#a8d870' : 'var(--text)',
                boxShadow:
                  customerFilterClientId == null ? '0 0 0 1px rgba(107,175,0,0.35)' : 'none',
              }}
              onClick={() => setCustomerFilterClientId(null)}
            >
              Все
            </button>
            {clientsSorted.map((c) => {
              const active = Number(customerFilterClientId) === Number(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'rgba(107,175,0,0.18)' : 'var(--surface)',
                    color: active ? '#a8d870' : 'var(--text)',
                    boxShadow: active ? '0 0 0 1px rgba(107,175,0,0.35)' : 'none',
                  }}
                  onClick={() => setCustomerFilterClientId(c.id)}
                >
                  {c.name || c.title || `Клиент ${c.id}`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isWeek ? (
        <div className="border-b px-3 py-3" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            Заказы в плане (неделя)
          </div>
          <div className="planning-draft-scroll overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-7 gap-2">
              {weeklyScheduleDates.map((iso, idx) => {
                const items = weeklyScheduleByDate[iso] || [];
                const dayNum = String(iso).slice(8, 10);
                return (
                  <div
                    key={iso}
                    className="rounded border p-2"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      <span>{WEEKDAY_LABELS_FULL[idx]}</span>
                      <span>{dayNum}</span>
                    </div>
                    <div className="space-y-2">
                      {items.length === 0 ? (
                        <div className="rounded border px-2 py-2 text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                          Нет заказов
                        </div>
                      ) : (
                        items.map((o) => (
                          <div
                            key={`wk-${iso}-${o.id}`}
                            className="rounded border px-2 py-2 text-xs"
                            style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                          >
                            <div className="font-semibold">{o.tz_code || o.article || `#${o.id}`}</div>
                            <div className="truncate">{o.model_name || orderDisplayName(o)}</div>
                            <div style={{ color: 'var(--muted)' }}>Клиент: {orderClientLabel(o)}</div>
                            <div style={{ color: 'var(--muted)' }}>Кол-во: {getOrderedQty(o)} шт</div>
                            <div style={{ color: 'var(--muted)' }}>Дедлайн: {formatDeadlineLabelRu(orderPlanDateIso(o))}</div>
                            <div style={{ color: 'var(--muted)' }}>
                              Цех: {o.Workshop?.name || (o.workshop_id ? `Цех #${o.workshop_id}` : '—')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      

      {/* Table */}
      <div
        ref={tableScrollRef}
        className="planning-draft-scroll overflow-x-auto overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 195px)', display: 'block' }}
      >
        <table
          className="pd-draft-table border-collapse"
          style={{
            tableLayout: 'fixed',
            width: 'max-content',
            borderColor: 'var(--border)',
          }}
        >
          <thead>
            <tr style={{ height: PD_HEAD_H1 }}>
              <th
                rowSpan={leadHeadRowSpan}
                className="border px-0.5 text-xs font-medium align-top"
                style={{
                  position: 'sticky',
                  top: 0,
                  ...(stickyLead.num.sticky ? { left: stickyLead.num.left } : {}),
                  zIndex: 34,
                  width: colWidths.num,
                  minWidth: colWidths.num,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: '1px 0 0 var(--border)',
                  verticalAlign: 'middle',
                }}
              >
                <span className="relative block pr-1.5">
                  №
                  <div
                    className={`col-resize-handle${draggingResize === 'lead-num' ? ' active' : ''}`}
                    onMouseDown={(e) => startResizeLead(e, 'num')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                  />
                </span>
              </th>
              <th
                rowSpan={leadHeadRowSpan}
                className="border px-0 text-xs font-medium align-top"
                style={{
                  position: 'sticky',
                  top: 0,
                  ...(stickyLead.art.sticky ? { left: stickyLead.art.left } : {}),
                  zIndex: 35,
                  width: colWidths.art,
                  minWidth: colWidths.art,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: '1px 0 0 var(--border)',
                  verticalAlign: 'middle',
                }}
                aria-label="Фото модели"
              >
                <span className="relative flex justify-center pr-1">
                  <svg
                    className="h-3.5 w-3.5"
                    style={{ color: '#666' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <div
                    className={`col-resize-handle${draggingResize === 'lead-art' ? ' active' : ''}`}
                    onMouseDown={(e) => startResizeLead(e, 'art')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                  />
                </span>
              </th>
              <th
                rowSpan={leadHeadRowSpan}
                className="border px-1 text-left text-xs font-medium align-top"
                style={{
                  position: 'sticky',
                  top: 0,
                  ...(stickyLead.name.sticky ? { left: stickyLead.name.left } : {}),
                  zIndex: 36,
                  width: colWidths.name,
                  minWidth: colWidths.name,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: '1px 0 0 var(--border)',
                  verticalAlign: 'middle',
                }}
              >
                <span className="relative block pr-1.5">
                  Наименование ГП
                  <div
                    className={`col-resize-handle${draggingResize === 'lead-name' ? ' active' : ''}`}
                    onMouseDown={(e) => startResizeLead(e, 'name')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                  />
                </span>
              </th>
              <th
                rowSpan={leadHeadRowSpan}
                className="border px-1 text-xs font-medium align-top"
                style={{
                  position: 'sticky',
                  top: 0,
                  ...(stickyLead.cust.sticky ? { left: stickyLead.cust.left } : {}),
                  zIndex: 37,
                  width: colWidths.client,
                  minWidth: colWidths.client,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: '1px 0 0 var(--border)',
                  verticalAlign: 'middle',
                }}
              >
                <span className="relative block pr-1.5">
                  Заказчик
                  <div
                    className={`col-resize-handle${draggingResize === 'lead-client' ? ' active' : ''}`}
                    onMouseDown={(e) => startResizeLead(e, 'client')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                  />
                </span>
              </th>
              <th
                rowSpan={leadHeadRowSpan}
                className="border px-1 text-center text-xs font-medium align-top"
                style={{
                  position: 'sticky',
                  top: 0,
                  ...(stickyLead.qty.sticky ? { left: stickyLead.qty.left } : {}),
                  zIndex: 38,
                  width: colWidths.qty,
                  minWidth: colWidths.qty,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: stickyLead.qty.sticky
                    ? '6px 0 14px rgba(0,0,0,0.55)'
                    : '1px 0 0 var(--border)',
                  verticalAlign: 'middle',
                }}
              >
                <span className="relative block pr-1.5">
                  Кол-во
                  <div
                    className={`col-resize-handle${draggingResize === 'lead-qty' ? ' active' : ''}`}
                    onMouseDown={(e) => startResizeLead(e, 'qty')}
                    role="separator"
                    aria-orientation="vertical"
                    aria-hidden
                  />
                </span>
              </th>
              {gridPeriods.map((p) => (
                <th
                  key={p.key}
                  colSpan={isWeek ? 4 : 2}
                  className="border px-1 text-center text-xs font-medium"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    height: PD_HEAD_H1,
                    borderLeft: isWeek
                      ? p.di === 0
                        ? '2px solid var(--accent)'
                        : PD_BR_WEEK_GAP
                      : p.di === 0
                        ? '2px solid #e3b341'
                        : PD_BR_WEEK_GAP,
                    borderColor: 'var(--border)',
                    background: 'var(--bg2)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                >
                  {isWeek ? (
                    <>
                      <div>{PD_DAY_SHORT[p.di]}</div>
                      <div className="text-[10px] font-normal" style={{ color: 'var(--muted)' }}>
                        {formatDdMm(p.dayIso)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        {p.w?.dateFrom ? `${monthNameRu} ${p.w.weekNum}` : '—'}
                      </div>
                      <div className="text-[10px] font-normal" style={{ color: 'var(--muted)' }}>
                        {p.w?.dateFrom && p.w?.dateTo
                          ? `${formatDdMm(p.w.dateFrom)}–${formatDdMm(p.w.dateTo)}`
                          : ''}
                      </div>
                    </>
                  )}
                </th>
              ))}
              {isWeek ? (
                <th
                  rowSpan={3}
                  className="border px-1 text-xs font-medium align-top"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 11,
                    width: PD_COL.total,
                    minWidth: PD_COL.total,
                    background: 'var(--bg2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    verticalAlign: 'middle',
                  }}
                >
                  Итого
                </th>
              ) : (
                <th
                  colSpan={2}
                  className="border px-1 text-center text-xs font-medium"
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 11,
                    minWidth: weekColWidths.plan + weekColWidths.fact,
                    background: 'var(--bg2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                    verticalAlign: 'middle',
                    boxSizing: 'border-box',
                  }}
                >
                  Итого
                </th>
              )}
            </tr>
            {isWeek ? (
              <>
                <tr style={{ height: PD_HEAD_H2 }}>
                  {gridPeriods.map((p) => (
                    <React.Fragment key={`h2-${p.key}`}>
                      <th
                        colSpan={2}
                        className="border px-1 text-center text-[10px] font-medium"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP2,
                          zIndex: 11,
                          height: PD_HEAD_H2,
                          borderLeft:
                            p.di === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                          borderRight: PD_BR_PREP_HDR,
                          borderColor: 'var(--border)',
                          background: 'rgba(227,179,65,0.12)',
                          color: '#e3b341',
                          boxSizing: 'border-box',
                        }}
                      >
                        Подготовка
                      </th>
                      <th
                        colSpan={2}
                        className="border px-1 text-center text-[10px] font-medium"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP2,
                          zIndex: 11,
                          height: PD_HEAD_H2,
                          borderLeft: '2px solid var(--accent)',
                          borderColor: 'var(--border)',
                          background: 'var(--bg2)',
                          color: 'var(--text)',
                          boxSizing: 'border-box',
                        }}
                      >
                        Основное
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
                <tr style={{ height: PD_HEAD_H3 }}>
                  {gridPeriods.map((p) => (
                    <React.Fragment key={`h3-${p.key}`}>
                      <th
                        className="border px-0.5 text-[10px] font-normal"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP3,
                          zIndex: 12,
                          minWidth: weekColWidths.plan,
                          width: weekColWidths.plan,
                          height: PD_HEAD_H3,
                          borderLeft:
                            p.di === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                          background: 'rgba(227,179,65,0.08)',
                          color: '#e3b341',
                          borderColor: 'var(--border)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span className="relative block pr-1">
                          План
                          <div
                            className={`col-resize-handle${draggingResize === 'week-plan' ? ' active' : ''}`}
                            onMouseDown={(e) => startResizeWeek(e, 'plan')}
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                          />
                        </span>
                      </th>
                      <th
                        className="border px-0.5 text-[10px] font-normal"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP3,
                          zIndex: 12,
                          minWidth: weekColWidths.fact,
                          width: weekColWidths.fact,
                          height: PD_HEAD_H3,
                          background: 'rgba(227,179,65,0.08)',
                          color: '#e3b341',
                          borderRight: PD_BR_PREP_FACT,
                          borderColor: 'var(--border)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span className="relative block pr-1">
                          Факт
                          <div
                            className={`col-resize-handle${draggingResize === 'week-fact' ? ' active' : ''}`}
                            onMouseDown={(e) => startResizeWeek(e, 'fact')}
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                          />
                        </span>
                      </th>
                      <th
                        className="border px-0.5 text-[10px] font-normal"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP3,
                          zIndex: 12,
                          minWidth: weekColWidths.plan,
                          width: weekColWidths.plan,
                          height: PD_HEAD_H3,
                          borderLeft: '2px solid var(--accent)',
                          background: 'var(--bg2)',
                          color: 'var(--text)',
                          borderColor: 'var(--border)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span className="relative block pr-1">
                          План
                          <div
                            className={`col-resize-handle${draggingResize === 'week-plan' ? ' active' : ''}`}
                            onMouseDown={(e) => startResizeWeek(e, 'plan')}
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                          />
                        </span>
                      </th>
                      <th
                        className="border px-0.5 text-[10px] font-normal"
                        style={{
                          position: 'sticky',
                          top: PD_HEAD_TOP3,
                          zIndex: 12,
                          minWidth: weekColWidths.fact,
                          width: weekColWidths.fact,
                          height: PD_HEAD_H3,
                          background: 'var(--bg2)',
                          color: 'var(--text)',
                          borderRight: PD_BR_WEEK_GAP,
                          borderColor: 'var(--border)',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span className="relative block pr-1">
                          Факт
                          <div
                            className={`col-resize-handle${draggingResize === 'week-fact' ? ' active' : ''}`}
                            onMouseDown={(e) => startResizeWeek(e, 'fact')}
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                          />
                        </span>
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </>
            ) : (
              <tr style={{ height: PD_HEAD_MONTH_ROW2 }}>
                {gridPeriods.map((p) => (
                  <React.Fragment key={`mh2-${p.key}`}>
                    <th
                      className="border px-0.5 text-[10px] font-normal"
                      style={{
                        position: 'sticky',
                        top: PD_HEAD_H1,
                        zIndex: 12,
                        minWidth: weekColWidths.plan,
                        width: weekColWidths.plan,
                        height: PD_HEAD_MONTH_ROW2,
                        borderLeft: p.di === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                        background: 'rgba(227,179,65,0.08)',
                        color: 'var(--text)',
                        borderColor: 'var(--border)',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span className="relative block pr-1">
                        План
                        <div
                          className={`col-resize-handle${draggingResize === 'week-plan' ? ' active' : ''}`}
                          onMouseDown={(e) => startResizeWeek(e, 'plan')}
                          role="separator"
                          aria-orientation="vertical"
                          aria-hidden
                        />
                      </span>
                    </th>
                    <th
                      className="border px-0.5 text-[10px] font-normal"
                      style={{
                        position: 'sticky',
                        top: PD_HEAD_H1,
                        zIndex: 12,
                        minWidth: weekColWidths.fact,
                        width: weekColWidths.fact,
                        height: PD_HEAD_MONTH_ROW2,
                        background: 'var(--bg2)',
                        color: '#4caf50',
                        fontWeight: 700,
                        borderColor: 'var(--border)',
                        borderRight: PD_BR_WEEK_GAP,
                        boxSizing: 'border-box',
                      }}
                    >
                      <span className="relative block pr-1">
                        Факт
                        <div
                          className={`col-resize-handle${draggingResize === 'week-fact' ? ' active' : ''}`}
                          onMouseDown={(e) => startResizeWeek(e, 'fact')}
                          role="separator"
                          aria-orientation="vertical"
                          aria-hidden
                        />
                      </span>
                    </th>
                  </React.Fragment>
                ))}
                <th
                  className="border px-0.5 text-[10px] font-normal"
                  style={{
                    position: 'sticky',
                    top: PD_HEAD_H1,
                    zIndex: 12,
                    minWidth: weekColWidths.plan,
                    width: weekColWidths.plan,
                    height: PD_HEAD_MONTH_ROW2,
                    background: 'var(--bg2)',
                    color: 'var(--text)',
                    borderColor: 'var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  План
                </th>
                <th
                  className="border px-0.5 text-[10px] font-normal"
                  style={{
                    position: 'sticky',
                    top: PD_HEAD_H1,
                    zIndex: 12,
                    minWidth: weekColWidths.fact,
                    width: weekColWidths.fact,
                    height: PD_HEAD_MONTH_ROW2,
                    background: 'var(--bg2)',
                    color: '#4caf50',
                    fontWeight: 700,
                    borderColor: 'var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  Факт
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {(() => {
              let orderRowNum = 0;
              const out = [];
              for (const sec of sectionTree) {
                if (sec.type !== 'section') continue;
                out.push(
                  <tr key={`${sec.key}-sec-h`} className="section-header">
                    <td colSpan={dataColCount} className="border">
                      {sec.label}
                    </td>
                  </tr>
                );
                for (const sub of sec.subsections) {
                  out.push(
                    <tr key={`${sec.key}-${sub.key}-subh`} className="subsection-header">
                      <td colSpan={dataColCount} className="border">
                        {sub.label}
                      </td>
                    </tr>
                  );
                  for (const r of sub.rows) {
                    const order = r.orderIdx !== null ? orders[r.orderIdx] : null;
                    const chainProg =
                      order && ordersProgress.length
                        ? ordersProgress.find((p) => Number(p.id) === Number(order.id))
                        : null;
                    const cutFromProgress = chainProg?.quantities?.cutting ?? 0;
                    const sewFromProgress = chainProg?.quantities?.sewing ?? 0;
                    const imgSrc = orderModelImageSrc(order);
                    const orderedQty = getOrderedQty(order);
                    const cutFact = getCutFactForOrder(order, cuttingFactsByOrderId);
                    const sewQty = order
                      ? getSewFactForOrder(order, sewingFactsByOrderId)
                      : 0;
                    const cutLo =
                      cutFact != null && Number.isFinite(Number(cutFact)) ? Number(cutFact) : 0;
                    const cutNum =
                      cutFromProgress > 0 || cutLo > 0
                        ? Math.max(cutFromProgress, cutLo)
                        : null;
                    const sewNum = Math.max(sewFromProgress, sewQty);
                    const cutDisplay = cutNum != null && cutNum > 0 ? cutNum : '—';
                    const remainder = cutNum !== null ? cutNum - sewNum : null;
                    const remainderNeg = remainder !== null && remainder < 0;
                    const qtyShortage =
                      cutNum !== null && orderedQty > 0 && cutNum < orderedQty;
                    const qtyCellBg = remainderNeg
                      ? 'rgba(255,60,60,0.15)'
                      : qtyShortage && !remainderNeg
                        ? 'rgba(245,158,11,0.2)'
                        : 'var(--bg)';
                    const qtyCellColor = 'var(--text)';
                    const cutRowValueColor =
                      cutNum !== null && orderedQty > 0 && cutNum < orderedQty
                        ? '#F59E0B'
                        : undefined;
                    const remainderValueColor =
                      remainder === null
                        ? 'var(--muted)'
                        : remainder < 0
                          ? '#ff4444'
                          : remainder === 0
                            ? '#c8ff00'
                            : 'var(--text)';
                    const total = isWeek
                      ? rowSumPlanDays(r, dayCellsMap, displayDays)
                      : rowSumPlan(r);
                    const totalFactMonth = !isWeek
                      ? rowSumMonthFactsForOrder(order, monthFactsByOrderId)
                      : 0;
                    const dim =
                      debouncedSearch && !rowMatchesFilter(r) ? 0.35 : 1;
                    const custOk = rowMatchesCustomerFilter(r);
                    if (custOk) orderRowNum += 1;
                    const displayNum = orderRowNum;
                    out.push(
                      <tr
                        key={r.id}
                        className="group/row pd-data-row border-b transition-colors"
                        style={{
                          borderColor: 'var(--border)',
                          opacity: dim,
                          display: custOk ? undefined : 'none',
                        }}
                      >
                        <td
                          className="pd-num-cell group-hover/row:bg-[var(--surface2)] relative flex items-center justify-center border px-0.5 text-center text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                          style={{
                            ...(stickyLead.num.sticky
                              ? {
                                  position: 'sticky',
                                  left: stickyLead.num.left,
                                  zIndex: 20,
                                }
                              : {}),
                            width: colWidths.num,
                            minWidth: colWidths.num,
                            background: 'var(--bg)',
                            borderColor: 'var(--border)',
                            boxShadow: '1px 0 0 var(--border)',
                          }}
                        >
                          <button
                            type="button"
                            title="Удалить строку"
                            className="absolute left-0 top-1/2 z-[26] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded p-0 text-[11px] leading-none opacity-0 transition-opacity hover:opacity-100 group-hover/row:opacity-100"
                            style={{ color: '#ff4444' }}
                            onClick={() => {
                              const label = order
                                ? orderDisplayName(order)
                                : 'пустую строку плана';
                              if (
                                !window.confirm(
                                  `Удалить заказ «${label}»? Это действие нельзя отменить`
                                )
                              ) {
                                return;
                              }
                              setSectionTree((t) => removeRowFromTree(t, r.id));
                              setOpenDropdown((cur) => {
                                if (cur === r.id) {
                                  setDdSearch('');
                                  return null;
                                }
                                return cur;
                              });
                              setOutsourceDrawerRowId((cur) =>
                                cur === r.id ? null : cur
                              );
                            }}
                          >
                            🗑
                          </button>
                          {custOk ? displayNum : ''}
                        </td>
                        <td
                          className="group-hover/row:bg-[var(--surface2)] border px-0.5 transition-colors group-hover/row:!bg-[#1d2229]"
                          style={{
                            ...(stickyLead.art.sticky
                              ? {
                                  position: 'sticky',
                                  left: stickyLead.art.left,
                                  zIndex: 21,
                                }
                              : {}),
                            width: colWidths.art,
                            minWidth: colWidths.art,
                            background: 'var(--bg)',
                            borderColor: 'var(--border)',
                            boxShadow: '1px 0 0 var(--border)',
                          }}
                        >
                          <PhotoCellTable src={imgSrc} />
                        </td>
                        <td
                          className="group-hover/row:bg-[var(--surface2)] border p-0 transition-colors group-hover/row:!bg-[#1d2229]"
                          style={{
                            ...(stickyLead.name.sticky
                              ? {
                                  position: 'sticky',
                                  left: stickyLead.name.left,
                                  zIndex: 22,
                                }
                              : {}),
                            width: colWidths.name,
                            minWidth: colWidths.name,
                            paddingLeft: 8,
                            paddingRight: 4,
                            background: 'var(--bg)',
                            borderColor: 'var(--border)',
                            boxShadow: '1px 0 0 var(--border)',
                          }}
                        >
                          <div className="flex max-h-[52px] items-center gap-0.5 px-0.5 py-0.5">
                            <div
                              ref={(el) => {
                                cellRefs.current[r.id] = el;
                              }}
                              role="button"
                              tabIndex={0}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1"
                              onClick={() => {
                                if (sec.key === 'outsource' && order) {
                                  setOutsourceDrawerRowId(r.id);
                                  return;
                                }
                                const el = cellRefs.current[r.id];
                                if (el) openOrderDropdown(r.id, el);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (sec.key === 'outsource' && order) {
                                    setOutsourceDrawerRowId(r.id);
                                    return;
                                  }
                                  const el = cellRefs.current[r.id];
                                  if (el) openOrderDropdown(r.id, el);
                                }
                              }}
                            >
                              {sec.key === 'outsource' &&
                              r.outsourceWorkshop &&
                              String(r.outsourceWorkshop).trim() !== '' ? (
                                <span
                                  className="shrink-0 rounded px-1 py-px text-[10px] font-semibold"
                                  style={{
                                    background: 'rgba(200,255,0,0.12)',
                                    color: '#c8ff00',
                                  }}
                                >
                                  {outsourceExecutorShort(r.outsourceWorkshop)}
                                </span>
                              ) : null}
                              <span
                                className="gp-name-ellipsis min-w-0 flex-1 text-xs"
                                style={{
                                  color: order ? 'var(--text)' : 'var(--muted)',
                                  maxWidth: colWidths.name - 36,
                                }}
                              >
                                {order ? (
                                  orderDisplayName(order)
                                ) : (
                                  <span className="italic">— выберите заказ —</span>
                                )}
                              </span>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              className="flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded border text-[10px] leading-none transition-all"
                              style={{
                                borderColor:
                                  openDropdown === r.id ? 'var(--accent)' : 'var(--border)',
                                background:
                                  openDropdown === r.id ? 'var(--accent)' : 'var(--surface2)',
                                color: openDropdown === r.id ? '#fff' : 'var(--text)',
                                transform: openDropdown === r.id ? 'rotate(180deg)' : 'none',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const el = cellRefs.current[r.id];
                                if (el) openOrderDropdown(r.id, el);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  const el = cellRefs.current[r.id];
                                  if (el) openOrderDropdown(r.id, el);
                                }
                              }}
                            >
                              ▼
                            </span>
                          </div>
                        </td>
                        <td
                          className="group-hover/row:bg-[var(--surface2)] border px-1 transition-colors group-hover/row:!bg-[#1d2229]"
                          style={{
                            ...(stickyLead.cust.sticky
                              ? {
                                  position: 'sticky',
                                  left: stickyLead.cust.left,
                                  zIndex: 23,
                                }
                              : {}),
                            width: colWidths.client,
                            minWidth: colWidths.client,
                            background: 'var(--bg)',
                            borderColor: 'var(--border)',
                            boxShadow: '1px 0 0 var(--border)',
                          }}
                        >
                          <div
                            className="truncate text-xs leading-tight"
                            style={{ color: 'var(--text)' }}
                            title={orderClientLabel(order)}
                          >
                            {orderClientLabel(order)}
                          </div>
                        </td>
                        <td
                          className={`border text-center transition-colors${
                            order ? ' qty-cell' : ' group-hover/row:bg-[var(--surface2)] px-1 py-1 text-[10px] leading-snug group-hover/row:!bg-[#1d2229]'
                          }`}
                          style={{
                            ...(stickyLead.qty.sticky
                              ? {
                                  position: 'sticky',
                                  left: stickyLead.qty.left,
                                  zIndex: 24,
                                }
                              : {}),
                            width: colWidths.qty,
                            minWidth: colWidths.qty,
                            maxWidth: colWidths.qty,
                            background: order ? qtyCellBg : 'var(--bg)',
                            color: order ? qtyCellColor : 'var(--text)',
                            borderColor: 'var(--border)',
                            boxShadow: stickyLead.qty.sticky
                              ? '6px 0 14px rgba(0,0,0,0.55)'
                              : '1px 0 0 var(--border)',
                          }}
                        >
                          {order ? (
                            <>
                              <div className="qty-grid">
                                <span className="qty-item">
                                  <span className="qty-label">Зак</span>
                                  <span className="qty-val">{orderedQty}</span>
                                </span>
                                <span className="qty-item">
                                  <span className="qty-label">Рас</span>
                                  <span
                                    className="qty-val"
                                    style={{
                                      color: cutRowValueColor ?? 'var(--text)',
                                    }}
                                  >
                                    {cutDisplay}
                                  </span>
                                </span>
                                <span className="qty-item">
                                  <span className="qty-label">Пош</span>
                                  <span
                                    className="qty-val"
                                    style={{
                                      color:
                                        sewFromProgress > 0 ? '#c8ff00' : 'var(--text)',
                                      fontWeight: sewFromProgress > 0 ? 700 : undefined,
                                    }}
                                  >
                                    {sewNum > 0 ? sewNum : '—'}
                                  </span>
                                </span>
                                <span className="qty-item">
                                  <span className="qty-label">Ост</span>
                                  <span className="qty-val" style={{ color: remainderValueColor }}>
                                    {remainder !== null ? remainder : '—'}
                                  </span>
                                </span>
                              </div>
                              {chainProg && (chainProg.total_progress ?? 0) > 0 ? (
                                <div
                                  style={{
                                    marginTop: 4,
                                    background: '#1a1a1a',
                                    height: 2,
                                    borderRadius: 1,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(100, chainProg.total_progress ?? 0)}%`,
                                      height: 2,
                                      borderRadius: 1,
                                      background: '#c8ff00',
                                    }}
                                  />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        {isWeek
                          ? displayDays.map((iso, di) => {
                              const w = dayCellsMap[r.id]?.[iso] || {
                                pp: '',
                                pf: '',
                                mp: '',
                                mf: '',
                              };
                              return (
                                <React.Fragment key={iso}>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 transition-colors"
                                    style={{
                                      borderLeft:
                                        di === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                                      borderColor: 'var(--border)',
                                      background: 'rgba(227,179,65,0.06)',
                                      minWidth: pdWeekFieldWidth(
                                        'pp',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                      width: pdWeekFieldWidth(
                                        'pp',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                    }}
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      className={inputCls}
                                      value={w.pp === '' || w.pp === '0' ? '' : w.pp}
                                      onChange={(e) =>
                                        updateDayCell(r.id, iso, 'pp', e.target.value)
                                      }
                                    />
                                  </td>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 transition-colors"
                                    style={{
                                      borderColor: 'var(--border)',
                                      background: 'rgba(227,179,65,0.06)',
                                      borderRight: PD_BR_PREP_FACT,
                                      minWidth: pdWeekFieldWidth(
                                        'pf',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                      width: pdWeekFieldWidth(
                                        'pf',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                    }}
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      className={inputCls}
                                      value={w.pf === '' || w.pf === '0' ? '' : w.pf}
                                      onChange={(e) =>
                                        updateDayCell(r.id, iso, 'pf', e.target.value)
                                      }
                                    />
                                  </td>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 transition-colors"
                                    style={{
                                      borderLeft: '2px solid var(--accent)',
                                      borderColor: 'var(--border)',
                                      minWidth: pdWeekFieldWidth(
                                        'mp',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                      width: pdWeekFieldWidth(
                                        'mp',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                    }}
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      className={inputCls}
                                      value={w.mp === '' || w.mp === '0' ? '' : w.mp}
                                      onChange={(e) =>
                                        updateDayCell(r.id, iso, 'mp', e.target.value)
                                      }
                                    />
                                  </td>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 transition-colors"
                                    style={{
                                      borderColor: 'var(--border)',
                                      borderRight: PD_BR_WEEK_GAP,
                                      minWidth: pdWeekFieldWidth(
                                        'mf',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                      width: pdWeekFieldWidth(
                                        'mf',
                                        weekColWidths.plan,
                                        weekColWidths.fact
                                      ),
                                    }}
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      className={inputCls}
                                      value={w.mf === '' || w.mf === '0' ? '' : w.mf}
                                      onChange={(e) =>
                                        updateDayCell(r.id, iso, 'mf', e.target.value)
                                      }
                                    />
                                  </td>
                                </React.Fragment>
                              );
                            })
                          : r.weeks.map((w, wi) => {
                              const oid = order?.id;
                              const storedFact =
                                oid != null
                                  ? monthFactsByOrderId[String(oid)]?.[wi] ??
                                    monthFactsByOrderId[Number(oid)]?.[wi]
                                  : undefined;
                              const factNum =
                                storedFact != null && Number.isFinite(Number(storedFact))
                                  ? Number(storedFact)
                                  : null;
                              const editingFact =
                                oid != null &&
                                editingMonthFactCell?.orderId === oid &&
                                editingMonthFactCell?.weekIndex === wi;
                              return (
                                <React.Fragment key={wi}>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 align-top transition-colors group-hover/row:!bg-[#1d2229]"
                                    style={{
                                      borderLeft:
                                        wi === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                                      borderColor: 'var(--border)',
                                      background: 'rgba(227,179,65,0.04)',
                                      minWidth: weekColWidths.plan,
                                      width: weekColWidths.plan,
                                      verticalAlign: 'top',
                                    }}
                                  >
                                    <div className="flex flex-col gap-0.5 px-0.5 py-0.5">
                                      <input
                                        type="number"
                                        min={0}
                                        title="Подготовка — план"
                                        className={`${inputCls} !py-1 text-[10px]`}
                                        value={w.pp === '' || w.pp === '0' ? '' : w.pp}
                                        onChange={(e) =>
                                          updateWeekCell(r.id, wi, 'pp', e.target.value)
                                        }
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        title="Основное — план"
                                        className={`${inputCls} !py-1 text-[10px]`}
                                        value={w.mp === '' || w.mp === '0' ? '' : w.mp}
                                        onChange={(e) =>
                                          updateWeekCell(r.id, wi, 'mp', e.target.value)
                                        }
                                      />
                                    </div>
                                  </td>
                                  <td
                                    className="group-hover/row:bg-[var(--surface2)] border p-0 text-center text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                                    style={{
                                      borderColor: 'var(--border)',
                                      borderRight: PD_BR_WEEK_GAP,
                                      minWidth: weekColWidths.fact,
                                      width: weekColWidths.fact,
                                      verticalAlign: 'middle',
                                    }}
                                  >
                                    {editingFact && canPersistDraft ? (
                                      <input
                                        key={`${oid}-${wi}`}
                                        type="number"
                                        min={0}
                                        defaultValue={
                                          factNum != null && factNum !== 0 ? String(factNum) : ''
                                        }
                                        autoFocus
                                        className="mx-auto block outline-none"
                                        style={{
                                          width: 52,
                                          maxWidth: '100%',
                                          textAlign: 'center',
                                          background: '#1a1f26',
                                          color: '#fff',
                                          border: 'none',
                                          borderRadius: 4,
                                          padding: '6px 4px',
                                          fontWeight: 700,
                                        }}
                                        onBlur={(e) => {
                                          if (skipMonthFactBlurSaveRef.current) {
                                            skipMonthFactBlurSaveRef.current = false;
                                            return;
                                          }
                                          void persistMonthFact(oid, wi, e.target.value);
                                          setEditingMonthFactCell(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') e.currentTarget.blur();
                                          if (e.key === 'Escape') {
                                            e.preventDefault();
                                            skipMonthFactBlurSaveRef.current = true;
                                            setEditingMonthFactCell(null);
                                          }
                                        }}
                                      />
                                    ) : (
                                      <div
                                        role={oid != null && canPersistDraft ? 'button' : undefined}
                                        tabIndex={oid != null && canPersistDraft ? 0 : undefined}
                                        className="mx-auto flex min-h-[28px] min-w-[40px] max-w-[72px] items-center justify-center rounded px-0.5 transition-colors hover:bg-[rgba(76,175,80,0.12)]"
                                        style={{
                                          cursor:
                                            oid != null && canPersistDraft ? 'pointer' : 'default',
                                          color: '#4caf50',
                                          fontWeight: 700,
                                        }}
                                        onClick={() => {
                                          if (oid == null || !canPersistDraft) return;
                                          setEditingMonthFactCell({ orderId: oid, weekIndex: wi });
                                        }}
                                        onKeyDown={(e) => {
                                          if (
                                            (e.key === 'Enter' || e.key === ' ') &&
                                            oid != null &&
                                            canPersistDraft
                                          ) {
                                            e.preventDefault();
                                            setEditingMonthFactCell({ orderId: oid, weekIndex: wi });
                                          }
                                        }}
                                      >
                                        {factNum != null && factNum !== 0 ? factNum : '—'}
                                      </div>
                                    )}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                        {isWeek ? (
                          <td
                            className="group-hover/row:bg-[var(--surface2)] border px-1 text-center text-xs font-bold transition-colors"
                            style={{
                              borderColor: 'var(--border)',
                              color:
                                total === 0 ? 'var(--surface2)' : 'var(--accent)',
                              width: PD_COL.total,
                              minWidth: PD_COL.total,
                            }}
                          >
                            {total === 0 ? '' : total}
                          </td>
                        ) : (
                          <>
                            <td
                              className="group-hover/row:bg-[var(--surface2)] border px-1 text-center text-xs font-bold transition-colors group-hover/row:!bg-[#1d2229]"
                              style={{
                                borderColor: 'var(--border)',
                                color:
                                  total === 0 ? 'var(--surface2)' : 'var(--text)',
                                minWidth: weekColWidths.plan,
                                width: weekColWidths.plan,
                              }}
                            >
                              {total === 0 ? '' : total}
                            </td>
                            <td
                              className="group-hover/row:bg-[var(--surface2)] border px-1 text-center text-xs font-bold transition-colors group-hover/row:!bg-[#1d2229]"
                              style={{
                                borderColor: 'var(--border)',
                                color:
                                  totalFactMonth === 0
                                    ? 'var(--surface2)'
                                    : '#4caf50',
                                minWidth: weekColWidths.fact,
                                width: weekColWidths.fact,
                              }}
                            >
                              {totalFactMonth === 0 ? '' : totalFactMonth}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  }
                  out.push(
                    <tr key={`${sec.key}-${sub.key}-add`} className="add-row add-order-row">
                      <td
                        className="border"
                        style={{
                          ...(stickyLead.num.sticky
                            ? {
                                position: 'sticky',
                                left: stickyLead.num.left,
                                zIndex: 15,
                              }
                            : {}),
                          width: colWidths.num,
                          minWidth: colWidths.num,
                          background: 'var(--bg)',
                          borderColor: 'var(--border)',
                          boxShadow: '1px 0 0 var(--border)',
                        }}
                      />
                      <td
                        className="border"
                        style={{
                          ...(stickyLead.art.sticky
                            ? {
                                position: 'sticky',
                                left: stickyLead.art.left,
                                zIndex: 15,
                              }
                            : {}),
                          width: colWidths.art,
                          minWidth: colWidths.art,
                          background: 'var(--bg)',
                          borderColor: 'var(--border)',
                          boxShadow: '1px 0 0 var(--border)',
                        }}
                      >
                        <div className="flex justify-center py-0.5">
                          <CameraPlaceholder compact />
                        </div>
                      </td>
                      <td
                        className="border"
                        style={{
                          ...(stickyLead.name.sticky
                            ? {
                                position: 'sticky',
                                left: stickyLead.name.left,
                                zIndex: 15,
                              }
                            : {}),
                          width: colWidths.name,
                          minWidth: colWidths.name,
                          background: 'var(--bg)',
                          borderColor: 'var(--border)',
                          boxShadow: '1px 0 0 var(--border)',
                        }}
                      >
                        <button
                          type="button"
                          className="w-full bg-transparent py-2 text-left font-semibold"
                          style={{ color: '#c8ff00' }}
                          onClick={() => {
                            const row = newPlanRow(sec.key, sub.key);
                            setSectionTree((t) =>
                              addPlanRowWithId(t, sec.key, sub.key, row)
                            );
                            setPendingOpenRowId(row.id);
                          }}
                        >
                          + Добавить заказ
                        </button>
                      </td>
                      <td
                        colSpan={addRowTailColSpan}
                        className="border"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                      />
                    </tr>
                  );
                }
                const capGrid = ensureCapacityGrid(sec);
                const sumFields = ['pp', 'pf', 'mp', 'mf'];
                const summaryWeekCellStyle = (wi, field) => {
                  const isPp = field === 'pp';
                  const isPf = field === 'pf';
                  const isMp = field === 'mp';
                  const isMf = field === 'mf';
                  const wc = pdWeekFieldWidth(field, weekColWidths.plan, weekColWidths.fact);
                  return {
                    minWidth: wc,
                    width: wc,
                    borderColor: 'var(--border)',
                    borderLeft:
                      isPp && wi === 0
                        ? '2px solid #e3b341'
                        : isPp && wi > 0
                          ? PD_BR_WEEK_GAP
                          : isMp
                            ? '2px solid var(--accent)'
                            : undefined,
                    borderRight: isPf ? PD_BR_PREP_FACT : isMf ? PD_BR_WEEK_GAP : undefined,
                    background:
                      isPp || isPf ? 'rgba(227,179,65,0.12)' : 'rgba(0,0,0,0.35)',
                  };
                };
                const summaryDayCellStyle = (di, field) =>
                  summaryWeekCellStyle(di, field);
                if (isWeek) {
                  out.push(
                    <tr key={`${sec.key}-cap`} className="summary-row">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        МОЩНОСТЬ
                      </td>
                      {displayDays.map((iso, di) =>
                        sumFields.map((field) => (
                          <td
                            key={`cap-${iso}-${field}`}
                            className="border p-0"
                            style={summaryDayCellStyle(di, field)}
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-full border-0 bg-transparent px-1 py-2 text-center text-xs outline-none"
                              style={{ color: 'var(--text)' }}
                              value={capacityDayCells[sec.key]?.[iso]?.[field] ?? ''}
                              onChange={(e) =>
                                setCapacityDayField(sec.key, iso, field, e.target.value)
                              }
                            />
                          </td>
                        ))
                      )}
                      <td colSpan={1} className="border" />
                    </tr>
                  );
                  out.push(
                    <tr key={`${sec.key}-load`} className="summary-row">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        ЗАГРУЗКА
                      </td>
                      {displayDays.map((iso, di) =>
                        sumFields.map((field) => {
                          const loadVal = sectionDayFieldSum(sec, iso, field, dayCellsMap);
                          return (
                            <td
                              key={`load-${iso}-${field}`}
                              className="border px-0.5 text-center text-xs font-bold"
                              style={{
                                ...summaryDayCellStyle(di, field),
                                color: 'var(--accent)',
                              }}
                            >
                              {loadVal === 0 ? '' : loadVal}
                            </td>
                          );
                        })
                      )}
                      <td colSpan={1} className="border" />
                    </tr>
                  );
                  out.push(
                    <tr key={`${sec.key}-free`} className="summary-row summary-row--free">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        СВОБОДНО
                      </td>
                      {displayDays.map((iso, di) =>
                        sumFields.map((field) => {
                          const capN = parseCellNum(
                            capacityDayCells[sec.key]?.[iso]?.[field]
                          );
                          const loadN = sectionDayFieldSum(sec, iso, field, dayCellsMap);
                          const freeN = capN - loadN;
                          return (
                            <td
                              key={`free-${iso}-${field}`}
                              className="border px-0.5 text-center text-xs font-bold"
                              style={{
                                ...summaryDayCellStyle(di, field),
                                color: freeN < 0 ? '#f87171' : 'var(--text)',
                              }}
                            >
                              {capN === 0 && loadN === 0 ? '' : freeN}
                            </td>
                          );
                        })
                      )}
                      <td colSpan={1} className="border" />
                    </tr>
                  );
                } else {
                  const monthWeekCellTd = (wi) => ({
                    minWidth: weekColWidths.plan + weekColWidths.fact,
                    width: weekColWidths.plan + weekColWidths.fact,
                    borderColor: 'var(--border)',
                    borderLeft: wi === 0 ? '2px solid #e3b341' : PD_BR_WEEK_GAP,
                    borderRight: PD_BR_WEEK_GAP,
                    background: 'rgba(227,179,65,0.1)',
                  });
                  const weekIndices = displayWeeks.map((_, wi) => wi);
                  out.push(
                    <tr key={`${sec.key}-cap`} className="summary-row">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        МОЩНОСТЬ
                      </td>
                      {weekIndices.map((wi) => (
                        <td key={`cap-m-${wi}`} className="border p-0" style={monthWeekCellTd(wi)} colSpan={2}>
                          <div className="p-0.5" style={{ minHeight: 36 }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-full min-w-0 border-0 bg-transparent px-0.5 py-1 text-center text-[11px] outline-none"
                              style={{ color: 'var(--text)' }}
                              value={capGrid[wi]?.pp ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSectionTree((t) => {
                                  let next = t;
                                  sumFields.forEach((field) => {
                                    next = setSectionCapacityCellInTree(next, sec.key, wi, field, v);
                                  });
                                  return next;
                                });
                              }}
                            />
                          </td>
                      ))}
                      <td className="border" style={{ minWidth: weekColWidths.plan }} />
                      <td className="border" style={{ minWidth: weekColWidths.fact }} />
                    </tr>
                  );
                  out.push(
                    <tr key={`${sec.key}-load`} className="summary-row">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        ЗАГРУЗКА
                      </td>
                      {weekIndices.map((wi) => {
                        const loadPlan = sectionWeekPlanLoadSum(sec, wi);
                        return (
                          <td
                            key={`load-m-${wi}`}
                            className="border px-0.5 text-center text-xs font-bold"
                            style={{ ...monthWeekCellTd(wi), color: 'var(--accent)' }}
                            colSpan={2}
                          >
                            {loadPlan === 0 ? '' : loadPlan}
                          </td>
                        );
                      })}
                      <td
                        className="border px-0.5 text-center text-xs font-bold"
                        style={{ color: 'var(--accent)', minWidth: weekColWidths.plan }}
                      >
                        {(() => {
                          let s = 0;
                          for (let wi = 0; wi < 4; wi++) s += sectionWeekPlanLoadSum(sec, wi);
                          return s === 0 ? '' : s;
                        })()}
                      </td>
                      <td
                        className="border px-0.5 text-center text-xs font-bold"
                        style={{ color: '#4caf50', minWidth: weekColWidths.fact }}
                      >
                        {''}
                      </td>
                    </tr>
                  );
                  out.push(
                    <tr key={`${sec.key}-free`} className="summary-row summary-row--free">
                      <td colSpan={5} className="border text-left uppercase tracking-wide">
                        СВОБОДНО
                      </td>
                      {weekIndices.map((wi) => {
                        const capPlan = parseCellNum(capGrid[wi]?.pp);
                        const loadPlan = sectionWeekPlanLoadSum(sec, wi);
                        const freePlan = capPlan - loadPlan;
                        return (
                          <td
                            key={`free-m-${wi}`}
                            className="border px-0.5 text-center text-xs font-bold"
                            style={{
                              ...monthWeekCellTd(wi),
                              color: freePlan < 0 ? '#f87171' : freePlan > 0 ? '#22c55e' : 'var(--text)',
                            }}
                            colSpan={2}
                          >
                            {capPlan === 0 && loadPlan === 0 ? '' : freePlan}
                          </td>
                        );
                      })}
                      <td
                        className="border px-0.5 text-center text-xs font-bold"
                        style={{ minWidth: weekColWidths.plan, color: 'var(--text)' }}
                      >
                        {(() => {
                          let s = 0;
                          for (let wi = 0; wi < weekIndices.length; wi++) {
                            const capPlan = parseCellNum(capGrid[wi]?.pp);
                            const loadPlan = sectionWeekPlanLoadSum(sec, wi);
                            s += capPlan - loadPlan;
                          }
                          return s === 0 ? '' : s;
                        })()}
                      </td>
                      <td
                        className="border px-0.5 text-center text-xs font-bold"
                        style={{ minWidth: weekColWidths.fact, color: 'var(--text)' }}
                      >
                        {''}
                      </td>
                    </tr>
                  );
                }
              }
              return out;
            })()}
          </tbody>
        </table>
      </div>

      {chainModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[2200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setChainModalOpen(false);
                setChainPreviewRows([]);
              }
            }}
            role="presentation"
          >
            <div
              className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border shadow-2xl"
              style={{
                background: 'var(--bg2)',
                borderColor: 'var(--border)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="chain-modal-title"
            >
              <div
                className="border-b px-4 py-3 text-lg font-bold"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                id="chain-modal-title"
              >
                План цеха — предпросмотр
              </div>
              <div className="max-h-[55vh] overflow-auto px-4 py-3">
                <table className="w-full border-collapse text-sm" style={{ color: 'var(--text)' }}>
                  <thead>
                    <tr>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        Заказ
                      </th>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        Закуп
                      </th>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        Раскрой
                      </th>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        Пошив
                      </th>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        ОТК
                      </th>
                      <th className="border px-2 py-2 text-left" style={{ borderColor: 'var(--border)' }}>
                        Отгрузка
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainPreviewRows.map((r) => (
                      <tr key={`${r.order_id}-${r.section_id}`}>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {r.orderLabel}
                        </td>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {formatWeekRangeShort(r.purchase_week_start)}
                        </td>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {formatWeekRangeShort(r.cutting_week_start)}
                        </td>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {formatWeekRangeShort(r.sewing_week_start)}
                        </td>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {formatWeekRangeShort(r.otk_week_start)}
                        </td>
                        <td className="border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                          {formatWeekRangeShort(r.shipping_week_start)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="flex flex-wrap justify-end gap-2 border-t px-4 py-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  onClick={() => {
                    setChainModalOpen(false);
                    setChainPreviewRows([]);
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={chainSaving}
                  className="rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  style={{ background: '#c8ff00' }}
                  onClick={confirmProductionChainSave}
                >
                  {chainSaving ? 'Сохранение…' : 'Подтвердить и сохранить'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {openDropdown &&
        createPortal(
          <div
            id="planning-draft-order-popup"
            className="z-[2000]"
            style={{
              position: 'fixed',
              left: ddPos.left,
              top: ddPos.top,
              width: ddPos.width,
              maxHeight: 320,
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderTop: '2px solid var(--accent)',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'pd-fade 100ms ease-out forwards',
            }}
          >
            <style>{`
              @keyframes pd-fade {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <input
              ref={ddSearchInputRef}
              type="search"
              placeholder="🔍 Поиск заказа..."
              className="m-2 rounded border px-2 py-1.5 text-sm outline-none"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
              value={ddSearch}
              onChange={(e) => setDdSearch(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <div className="min-h-0 flex-1 overflow-y-auto planning-draft-scroll px-1 pb-2">
              <button
                type="button"
                className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm transition-colors"
                style={{ color: 'var(--danger)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                onClick={() => clearOrder(openDropdown)}
              >
                ✕ Очистить
              </button>
              {filteredOrders.map((o) => {
                const idx = orders.findIndex((x) => x.id === o.id);
                const openRow = openDropdown
                  ? findRowInTree(sectionTree, openDropdown)
                  : null;
                const sel = openRow != null && openRow.orderIdx === idx;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm"
                    style={{
                      background: sel ? 'rgba(107,175,0,0.15)' : 'transparent',
                      color: sel ? '#a8d870' : 'var(--text)',
                    }}
                    onMouseEnter={(e) => {
                      if (!sel) e.currentTarget.style.background = 'var(--surface2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!sel) e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => selectOrder(openDropdown, idx)}
                  >
                    <span
                      className="shrink-0 rounded px-1 py-px text-[10px]"
                      style={{
                        background: 'var(--surface2)',
                        color: 'var(--muted)',
                      }}
                    >
                      {o.tz_code || o.article || '—'}
                    </span>
                    <span className="min-w-0 flex-1">{orderDisplayName(o)}</span>
                    {sel ? <span className="text-[#a8d870]">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}

      {outsourceDrawerRowId &&
        createPortal(
          (() => {
            const dRow = findRowInTree(sectionTree, outsourceDrawerRowId);
            const dOrder =
              dRow?.orderIdx != null ? orders[dRow.orderIdx] : null;
            return (
              <div
                className="fixed inset-0 z-[2100] flex justify-end"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setOutsourceDrawerRowId(null);
                }}
                role="presentation"
              >
                <aside
                  className="flex h-full w-full max-w-md flex-col border-l shadow-2xl"
                  style={{
                    background: 'var(--bg2)',
                    borderColor: 'var(--border)',
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div
                    className="border-b px-4 py-3 text-sm font-bold"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Аутсорс — заказ
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm planning-draft-scroll">
                    {!dRow || !dOrder ? (
                      <p style={{ color: 'var(--muted)' }}>
                        Сначала выберите заказ в строке (▼).
                      </p>
                    ) : (
                      <>
                        <div className="mb-3 space-y-1" style={{ color: 'var(--text)' }}>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Заказ: </span>
                            {orderDisplayName(dOrder)}
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Артикул: </span>
                            {dOrder.tz_code || dOrder.article || '—'}
                          </div>
                          <div>
                            <span style={{ color: 'var(--muted)' }}>Заказчик: </span>
                            {orderClientLabel(dOrder)}
                          </div>
                        </div>
                        <label
                          className="mb-1 block text-xs font-medium"
                          style={{ color: 'var(--muted)' }}
                        >
                          Цех-исполнитель
                        </label>
                        <select
                          className="mb-3 w-full rounded border px-2 py-2 text-sm outline-none"
                          style={{
                            background: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                          }}
                          value={outsourceForm.workshop}
                          onChange={(e) =>
                            setOutsourceForm((f) => ({
                              ...f,
                              workshop: e.target.value,
                            }))
                          }
                        >
                          <option value="">— выберите —</option>
                          {PD_OUTSOURCE_EXECUTOR_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <label
                          className="mb-1 block text-xs font-medium"
                          style={{ color: 'var(--muted)' }}
                        >
                          Контакт подрядчика
                        </label>
                        <input
                          type="text"
                          className="mb-3 w-full rounded border px-2 py-2 text-sm outline-none"
                          style={{
                            background: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                          }}
                          value={outsourceForm.contact}
                          onChange={(e) =>
                            setOutsourceForm((f) => ({ ...f, contact: e.target.value }))
                          }
                        />
                        <label
                          className="mb-1 block text-xs font-medium"
                          style={{ color: 'var(--muted)' }}
                        >
                          Комментарий
                        </label>
                        <textarea
                          rows={4}
                          className="mb-4 w-full rounded border px-2 py-2 text-sm outline-none"
                          style={{
                            background: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                          }}
                          value={outsourceForm.comment}
                          onChange={(e) =>
                            setOutsourceForm((f) => ({ ...f, comment: e.target.value }))
                          }
                        />
                      </>
                    )}
                  </div>
                  <div
                    className="flex gap-2 border-t px-4 py-3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <button
                      type="button"
                      className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}
                      disabled={!dRow || !dOrder}
                      onClick={saveOutsourceDrawer}
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      className="rounded border px-4 py-2 text-sm"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                      }}
                      onClick={() => setOutsourceDrawerRowId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </aside>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}
