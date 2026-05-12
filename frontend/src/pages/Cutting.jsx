/**
 * Страница раскроя — документы из плана цеха
 */

import React, { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useOrderProgress } from '../context/OrderProgressContext';
import { formatWeekRangeLabel } from '../components/planChain/PlanChainDocumentCard';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';
import { getMonday } from '../utils/cycleWeekLabels';
import {
  CHAIN_WORKSHOPS_FALLBACK,
  LEGACY_SECTION_LABELS,
  docMatchesChainSectionFilter,
  effectiveChainSectionKey,
} from '../utils/planChainWorkshops';
import {
  getSizeLetter,
  FACT_HEAD_COLOR_TOP,
  FACT_HEAD_COLOR_BOTTOM,
  FACT_HEAD_TOTAL_TOP,
  FACT_HEAD_TOTAL_BOTTOM,
  factMatrixHeadNumStyle,
  factMatrixHeadLetterStyle,
} from '../utils/sizeGridHeader';

function chainDateIsoCut(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

const CHAIN_COLS = 13;

const CHAIN_TABLE_HEADERS = [
  { label: 'Фото' },
  { label: 'TZ — MODEL' },
  { label: 'План кол-во', thStyle: { textAlign: 'right' } },
  { label: 'Факт кол-во', thStyle: { textAlign: 'right', minWidth: 120 } },
  { label: 'Клиент' },
  { label: 'Неделя план' },
  { label: 'Дата план' },
  { label: 'Дата факт' },
  { label: 'Этаж', thStyle: { minWidth: 120 } },
  { label: 'Статус' },
  { label: 'Цех' },
  { label: 'Комментарий' },
  { label: 'Печать', thStyle: { textAlign: 'center' } },
];

function getTotalFact(doc) {
  return (doc?.cutting_facts || []).reduce((s, f) => s + (parseInt(f.quantity, 10) || 0), 0);
}

function findCuttingFactForSpec(facts, color, size) {
  const c = String(color ?? '').trim();
  const s = String(size ?? '').trim();
  return (facts || []).find(
    (f) => String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
  );
}

function formatWeekForPrint(dateStr) {
  if (!dateStr) return '—';
  const iso = chainDateIsoCut(dateStr);
  if (!iso) return '—';
  const start = new Date(`${iso}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'май',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

function escapeHtmlPrint(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absPhotoUrlForPrint(url) {
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `${window.location.protocol}${t}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${t.startsWith('/') ? '' : '/'}${t}`;
}

/** Загрузка фото в data URL для печати (обходит блокировки внешних img в окне печати) */
async function cuttingPhotoUrlToDataUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith('data:image/')) return t;
  const abs = absPhotoUrlForPrint(t);
  if (!abs) return null;
  try {
    const res = await fetch(abs, { mode: 'cors', credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob?.size) return null;
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const CUT_PRINT_LEGACY_FLOOR_LABELS = {
  floor_2: '2 этаж',
  floor_3: '3 этаж',
  floor_4: '4 этаж',
};

/** Название этажа для печати: справочник building_floors, затем legacy-ключи, затем id */
function resolvePrintFloorName(doc, buildingFloors = []) {
  const fid = doc?.floor_id;
  if (fid == null || fid === '') return '—';
  const hit = (buildingFloors || []).find((f) => String(f.id) === String(fid));
  if (hit?.name) return hit.name;
  const leg = CUT_PRINT_LEGACY_FLOOR_LABELS[String(fid)];
  if (leg) return leg;
  return String(fid);
}

/** Печать документа раскроя из плана цеха (отдельное окно + window.print) */
function printCuttingDoc(doc) {
  const specification = doc.specification || [];
  const facts = doc.cutting_facts || [];
  const colors = [
    ...new Set(specification.map((s) => String(s.color ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const sizes = [
    ...new Set(specification.map((s) => String(s.size ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));

  const getPlanQty = (color, size) => {
    const row = specification.find(
      (s) =>
        String(s.color ?? '').trim() === String(color ?? '').trim() &&
        String(s.size ?? '').trim() === String(size ?? '').trim()
    );
    return row ? Math.max(0, parseInt(row.quantity, 10) || 0) : 0;
  };
  const getFactQty = (color, size) => {
    const f = findCuttingFactForSpec(facts, color, size);
    return parseInt(f?.quantity, 10) || 0;
  };

  const planTotal = specification.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0) || 0;
  const factTotal = facts.reduce((s, f) => s + (parseInt(f.quantity, 10) || 0), 0) || 0;

  const O = doc.Order || {};
  const article = String(O.article || O.tz_code || '').trim();
  const titleSafe = escapeHtmlPrint(article || 'заказ');
  const productLine = escapeHtmlPrint(orderTzModelLineCutting(O));
  const clientName = escapeHtmlPrint(O.Client?.name || O.client_name || '—');
  const photoRaw = firstPhotoSrcCutting(O);
  const photoBase64 =
    O.photoBase64 != null && typeof O.photoBase64 === 'string' && O.photoBase64.startsWith('data:')
      ? O.photoBase64
      : null;
  const photoUrl = photoBase64 ? '' : absPhotoUrlForPrint(photoRaw);
  const imgSrc = photoBase64 || photoUrl;
  const photoArt3 = escapeHtmlPrint((article || '?').slice(0, 3));
  const cardPhotoPlaceholderHidden = `<div class="card-photo-placeholder" style="display:none;background:#e8eaf6;color:#3949ab;border:1px solid #c5cae9;font-weight:700">${photoArt3}</div>`;
  let cardPhotoHtml;
  if (!imgSrc) {
    cardPhotoHtml = `<div class="card-photo-placeholder" style="background:#e8eaf6;color:#3949ab;border:1px solid #c5cae9;font-weight:700">${photoArt3}</div>`;
  } else if (photoBase64) {
    cardPhotoHtml = `<img class="card-photo" src="${escapeHtmlPrint(photoBase64)}" alt="" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='flex'">${cardPhotoPlaceholderHidden}`;
  } else {
    cardPhotoHtml = `<img class="card-photo" src="${escapeHtmlPrint(photoUrl)}" alt="" crossorigin="anonymous" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='flex'">${cardPhotoPlaceholderHidden}`;
  }

  const weekIso = chainDateIsoCut(doc.week_start);
  const planDateStr = weekIso
    ? new Date(`${weekIso}T12:00:00`).toLocaleDateString('ru-RU')
    : '—';
  const factIso = chainDateIsoCut(doc.actual_week_start || doc.actual_date);
  const factDateStr = factIso
    ? new Date(`${factIso}T12:00:00`).toLocaleDateString('ru-RU')
    : '—';

  const workshopLabel = escapeHtmlPrint(
    doc.print_workshop_name || doc.workshop_name || doc.section_id || doc.workshop || '—'
  );

  const floorStr =
    doc.print_floor_name != null && String(doc.print_floor_name).trim() !== ''
      ? String(doc.print_floor_name).trim()
      : resolvePrintFloorName(doc, doc._print_building_floors || []);
  const floorLabel = escapeHtmlPrint(floorStr);

  const st = doc.status || 'pending';
  const statusLabel = escapeHtmlPrint(
    st === 'done' ? 'Раскроено' : st === 'in_progress' ? 'В процессе' : 'Не начато'
  );

  const sizeThs = sizes.map((s) => `<th>${escapeHtmlPrint(s)}</th>`).join('');

  let matrixTableHtml;
  if (!colors.length || !sizes.length) {
    matrixTableHtml =
      '<p style="margin:12px 0;font-size:12px;color:#666">Нет матрицы цвет × размер в спецификации заказа.</p>';
  } else {
    const tbodyRows = colors
      .map((color) => {
        const rowFactTotal = sizes.reduce((sum, size) => sum + getFactQty(color, size), 0);
        const rowPlanTotal = sizes.reduce((sum, size) => sum + getPlanQty(color, size), 0);
        const cells = sizes
          .map((size) => {
            const plan = getPlanQty(color, size);
            const fact = getFactQty(color, size);
            if (plan === 0) return '<td style="color:#ddd">—</td>';
            const cls = fact >= plan ? 'done' : fact > 0 ? 'partial' : 'zero';
            return `<td><div class="cell-pf"><span class="cell-plan">${plan}</span><span class="cell-fact ${cls}">${fact}</span></div></td>`;
          })
          .join('');
        const rowCls =
          rowFactTotal >= rowPlanTotal ? 'done' : rowFactTotal > 0 ? 'partial' : 'zero';
        return `<tr><td>${escapeHtmlPrint(color)}</td>${cells}<td><div class="cell-pf"><span class="cell-plan">${rowPlanTotal}</span><span class="cell-fact ${rowCls}">${rowFactTotal}</span></div></td></tr>`;
      })
      .join('');

    const tfootCells = sizes
      .map((size) => {
        const colFact = colors.reduce((sum, color) => sum + getFactQty(color, size), 0);
        const colPlan = colors.reduce((sum, color) => sum + getPlanQty(color, size), 0);
        const colCls = colFact >= colPlan ? 'done' : colFact > 0 ? 'partial' : 'zero';
        return `<td><div class="cell-pf"><span class="cell-plan">${colPlan}</span><span class="cell-fact ${colCls}">${colFact}</span></div></td>`;
      })
      .join('');

    const grandCls = factTotal >= planTotal ? 'done' : factTotal > 0 ? 'partial' : 'zero';
    matrixTableHtml = `
  <table class="matrix-table">
    <thead>
      <tr>
        <th>Цвет</th>
        ${sizeThs}
        <th>Итого</th>
      </tr>
    </thead>
    <tbody>
      ${tbodyRows}
    </tbody>
    <tfoot>
      <tr>
        <td>Итого</td>
        ${tfootCells}
        <td><div class="cell-pf"><span class="cell-plan">${planTotal}</span><span class="cell-fact ${grandCls}">${factTotal}</span></div></td>
      </tr>
    </tfoot>
  </table>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Раскрой — ${titleSafe}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: #000;
      padding: 16px;
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #000;
    }
    .doc-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .doc-subtitle { font-size: 12px; color: #555; }
    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ddd;
      flex-wrap: wrap;
    }
    .card-photo {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #ddd;
      flex-shrink: 0;
    }
    .card-photo-placeholder {
      width: 80px;
      height: 80px;
      background: #eee;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #999;
      flex-shrink: 0;
    }
    .card-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .card-id { font-size: 12px; color: #666; }
    .card-meta-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: flex-start;
      flex: 1;
      justify-content: flex-end;
      min-width: 200px;
    }
    .meta-item { display: flex; flex-direction: column; gap: 2px; min-width: 72px; }
    .meta-label {
      font-size: 9px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .meta-value { font-size: 12px; font-weight: 600; }
    .meta-line {
      display: block;
      min-height: 14px;
      border-bottom: 1px solid #ccc;
      margin-top: 2px;
    }
    .matrix-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .matrix-table th {
      background: #1a237e;
      color: #fff;
      padding: 6px 10px;
      text-align: center;
      font-weight: 600;
      border: 1px solid #0d1564;
    }
    .matrix-table th:first-child { text-align: left; }
    .matrix-table td {
      padding: 6px 10px;
      border: 1px solid #ddd;
      text-align: center;
    }
    .matrix-table td:first-child {
      text-align: left;
      font-weight: 500;
      background: #f5f5f5;
    }
    .matrix-table tfoot td {
      font-weight: 700;
      background: #eee;
    }
    .cell-pf {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      line-height: 1.3;
    }
    .cell-plan { font-size: 10px; color: #888; }
    .cell-fact {
      font-size: 13px;
      font-weight: 700;
      color: #000;
    }
    .cell-fact.done { color: #1a7e2e; }
    .cell-fact.partial { color: #b36800; }
    .cell-fact.zero { color: #bbb; }
    .card-totals {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 24px;
      margin-bottom: 16px;
      padding: 10px 14px;
      border: 2px solid #1a237e;
      border-radius: 4px;
      align-items: flex-end;
    }
    .card-totals > div { display: flex; flex-direction: column; gap: 2px; }
    .tot-label { font-size: 9px; color: #888; text-transform: uppercase; }
    .tot-value { font-size: 16px; font-weight: 700; }
    .signatures {
      display: flex;
      gap: 48px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
    }
    .sig-item { flex: 1; }
    .sig-line {
      border-bottom: 1px solid #000;
      margin-bottom: 4px;
      height: 24px;
    }
    .sig-label { font-size: 10px; color: #666; }
    @media print {
      body { padding: 8px; }
      @page { margin: 10mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <div class="doc-title">ДОКУМЕНТ РАСКРОЯ</div>
      <div class="doc-subtitle">Сформирован: ${escapeHtmlPrint(new Date().toLocaleDateString('ru-RU'))}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:700;color:#1a237e">ERDEN</div>
      <div style="font-size:11px;color:#888">Производство одежды</div>
    </div>
  </div>
  <div class="card-header">
    ${cardPhotoHtml}
    <div style="flex:1;min-width:120px">
      <div class="card-name">${productLine}</div>
      <div class="card-id">#${escapeHtmlPrint(String(doc.order_id ?? ''))} · ${clientName}</div>
    </div>
    <div class="card-meta-group">
      <div class="meta-item">
        <div class="meta-label">Неделя план</div>
        <div class="meta-value">${escapeHtmlPrint(formatWeekForPrint(doc.week_start))}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Дата план</div>
        <div class="meta-value">${escapeHtmlPrint(planDateStr)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Дата факт</div>
        ${
          factIso
            ? `<div class="meta-value">${escapeHtmlPrint(factDateStr)}</div>`
            : '<span class="meta-line"></span>'
        }
      </div>
      <div class="meta-item">
        <div class="meta-label">Этаж</div>
        <div class="meta-value">${floorLabel}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Цех</div>
        <div class="meta-value">${workshopLabel}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Статус</div>
        <div class="meta-value">${statusLabel}</div>
      </div>
    </div>
  </div>
  <div class="card-totals">
    <div>
      <div class="tot-label">ПЛАН</div>
      <div class="tot-value">${planTotal} шт</div>
    </div>
    <div>
      <div class="tot-label">ФАКТ</div>
      <div class="tot-value" style="color:${
        factTotal >= planTotal ? '#1a7e2e' : factTotal > 0 ? '#b36800' : '#000'
      }">${factTotal > 0 ? `${factTotal} шт` : '_____ шт'}</div>
    </div>
    <div>
      <div class="tot-label">ОСТАТОК</div>
      <div class="tot-value">${
        factTotal > 0 ? `${Math.max(0, planTotal - factTotal)} шт` : '_____ шт'
      }</div>
    </div>
    <div>
      <div class="tot-label">%</div>
      <div class="tot-value">${planTotal > 0 ? `${Math.round((factTotal / planTotal) * 100)}%` : '—'}</div>
    </div>
  </div>
  <div class="matrix-title">
    <span>Детализация по цветам и размерам</span>
    <span style="font-size:11px;color:#888;font-weight:400">план / факт</span>
  </div>
  ${matrixTableHtml}
  <div class="signatures">
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label">Раскройщик</div>
    </div>
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label">Технолог</div>
    </div>
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label">Дата</div>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 500);
  return true;
}

/** TZ — MODEL для печати: без дублирования артикула в начале названия */
function cuttingPrintDisplayName(order) {
  const O = order || {};
  const article = String(O.article || O.tz_code || '').trim();
  const name = String(O.title || O.model_name || '').trim() || '—';
  if (article && name.startsWith(article)) return name;
  if (article) return `${article} — ${name}`;
  return name;
}

function groupCuttingPrintDocsByWeek(docs) {
  const groups = {};
  for (const doc of docs) {
    const w = doc.week_start != null && doc.week_start !== '' ? String(doc.week_start) : 'unknown';
    if (!groups[w]) groups[w] = [];
    groups[w].push(doc);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    const ia = chainDateIsoCut(a) || a;
    const ib = chainDateIsoCut(b) || b;
    const da = new Date(`${ia}T12:00:00`).getTime();
    const db = new Date(`${ib}T12:00:00`).getTime();
    return (Number.isNaN(da) ? 0 : da) - (Number.isNaN(db) ? 0 : db);
  });
}

function buildMiniMatrixHtml(doc) {
  const spec = doc.specification || [];
  const facts = doc.cutting_facts || [];
  const colors = [
    ...new Set(spec.map((s) => String(s.color ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  const sizes = [
    ...new Set(spec.map((s) => String(s.size ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
  if (!colors.length || !sizes.length) return '';

  const getPlan = (c, sz) => {
    const row = spec.find(
      (s) =>
        String(s.color ?? '').trim() === String(c ?? '').trim() &&
        String(s.size ?? '').trim() === String(sz ?? '').trim()
    );
    return row ? Math.max(0, parseInt(row.quantity, 10) || 0) : 0;
  };
  const getFact = (c, sz) => {
    const f = findCuttingFactForSpec(facts, c, sz);
    return parseInt(f?.quantity, 10) || 0;
  };

  const sizeThs = sizes
    .map(
      (s) =>
        `<th style="background:#3949ab;color:#fff;padding:2px 8px;text-align:center;min-width:36px;border:0.5px solid #283593">${escapeHtmlPrint(s)}</th>`
    )
    .join('');

  const tbody = colors
    .map((color) => {
      const rowPlan = sizes.reduce((s, sz) => s + getPlan(color, sz), 0);
      const rowFact = sizes.reduce((s, sz) => s + getFact(color, sz), 0);
      const cells = sizes
        .map((size) => {
          const p = getPlan(color, size);
          const f = getFact(color, size);
          if (!p) {
            return `<td style="color:#ddd;text-align:center;padding:2px 4px;border:0.5px solid #eee">—</td>`;
          }
          const factCell =
            f > 0
              ? `<div style="font-weight:700;color:#1a7e2e">${f}</div>`
              : `<div style="border-bottom:1px solid #000;width:20px;height:10px;margin:0 auto"></div>`;
          return `<td style="text-align:center;padding:2px 4px;border:0.5px solid #ddd">
              <div style="font-size:9px;color:#555">${p}</div>
              ${factCell}
            </td>`;
        })
        .join('');
      const totFactCell =
        rowFact > 0
          ? `<div style="color:#1a7e2e">${rowFact}</div>`
          : `<div style="border-bottom:1px solid #000;width:20px;height:10px;margin:0 auto"></div>`;
      return `<tr style="border-bottom:0.5px solid #ddd">
          <td style="padding:2px 6px;font-weight:500;background:#f0f0f0;border:0.5px solid #ddd">${escapeHtmlPrint(color)}</td>
          ${cells}
          <td style="text-align:center;padding:2px 6px;font-weight:700;background:#f0f0f0;border:0.5px solid #ddd">
            <div style="font-size:9px;color:#555">${rowPlan}</div>
            ${totFactCell}
          </td>
        </tr>`;
    })
    .join('');

  return `<table style="border-collapse:collapse;font-size:9px;margin-top:2px">
    <thead>
      <tr>
        <th style="background:#3949ab;color:#fff;padding:2px 6px;text-align:left;min-width:60px;border:0.5px solid #283593">Цвет</th>
        ${sizeThs}
        <th style="background:#1a237e;color:#fff;padding:2px 8px;text-align:center;border:0.5px solid #0d1564">Итого</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

/** Печать списка раскроя: альбом, группы по неделям, мини-матрица под строкой */
function buildPrintAllCuttingSimpleTableHtml(fullDocs) {
  const style = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11px;
      color: #000;
      padding: 8mm;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #000;
    }
    .page-title { font-size: 14px; font-weight: 700; }
    .page-meta { font-size: 10px; color: #555; }
    .signatures {
      display: flex;
      gap: 32px;
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
    }
    .sig-line {
      border-bottom: 1px solid #000;
      height: 16px;
      margin-bottom: 2px;
    }
    .sig-label { font-size: 9px; color: #666; }
    @media print {
      body { padding: 5mm; }
      @page { margin: 8mm; size: A4 landscape; }
    }
  `;

  const weekBlocks = groupCuttingPrintDocsByWeek(fullDocs)
    .map(([weekStart, weekDocs]) => {
      const weekLabel =
        weekStart === 'unknown'
          ? '—'
          : escapeHtmlPrint(formatWeekForPrint(weekStart));
      const weekPlanSum = weekDocs.reduce((s, d) => {
        const spec = d.specification || [];
        return s + spec.reduce((ss, r) => ss + (parseInt(r.quantity, 10) || 0), 0);
      }, 0);

      const tbody = weekDocs
        .map((doc, idx) => {
          const spec = doc.specification || [];
          const facts = doc.cutting_facts || [];
          const planTotal =
            spec.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0) || 0;
          const factTotal =
            facts.reduce((s, f) => s + (parseInt(f.quantity, 10) || 0), 0) || 0;

          const O = doc.Order || {};
          const photoRaw = firstPhotoSrcCutting(O);
          const photoB64 =
            O.photoBase64 != null && typeof O.photoBase64 === 'string' && O.photoBase64.startsWith('data:')
              ? O.photoBase64
              : null;
          const photoUrlOnly = photoB64 ? '' : (photoRaw ? absPhotoUrlForPrint(photoRaw) : '');
          const rowImgSrc = photoB64 || photoUrlOnly;
          const rowArt3 = escapeHtmlPrint(
            String(O.article || O.tz_code || '').trim().slice(0, 3) || '?'
          );
          const displayName = escapeHtmlPrint(cuttingPrintDisplayName(O));
          const clientName = escapeHtmlPrint(O.Client?.name || O.client_name || '—');
          const weekIso = chainDateIsoCut(doc.week_start);
          const planDateStr = weekIso
            ? new Date(`${weekIso}T12:00:00`).toLocaleDateString('ru-RU')
            : '—';
          const factIso = chainDateIsoCut(doc.actual_week_start || doc.actual_date);
          const factDateStr = factIso
            ? new Date(`${factIso}T12:00:00`).toLocaleDateString('ru-RU')
            : '';
          const floorRaw =
            doc.floor_name != null && String(doc.floor_name).trim() !== ''
              ? String(doc.floor_name).trim()
              : resolvePrintFloorName(doc, doc._print_building_floors || []);
          const floorCell = escapeHtmlPrint(floorRaw);
          const rowBg = idx % 2 === 0 ? '#fff' : '#f9f9f9';
          const mini = spec.length > 0 ? buildMiniMatrixHtml(doc) : '';

          const photoTd = rowImgSrc
            ? photoB64
              ? `<img src="${escapeHtmlPrint(photoB64)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:3px;border:1px solid #ddd">`
              : `<img src="${escapeHtmlPrint(rowImgSrc)}" crossorigin="anonymous" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:3px;border:1px solid #ddd" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'"><div style="display:none;width:36px;height:36px;background:#e8eaf6;border-radius:3px;align-items:center;justify-content:center;font-size:8px;color:#3949ab;border:1px solid #c5cae9;font-weight:700">${rowArt3}</div>`
            : `<div style="width:36px;height:36px;background:#e8eaf6;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#3949ab;border:1px solid #c5cae9;font-weight:700">${rowArt3}</div>`;

          const mainRow = `
        <tr style="border-bottom:0.5px solid #ddd;background:${rowBg}">
          <td style="padding:6px;text-align:center;color:#666;font-size:10px">${idx + 1}</td>
          <td style="padding:4px 6px">${photoTd}</td>
          <td style="padding:6px 8px">
            <div style="font-weight:600;font-size:11px">${displayName}</div>
            <div style="font-size:9px;color:#999">#${escapeHtmlPrint(String(doc.order_id ?? ''))}</div>
          </td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;font-size:12px">${planTotal} шт</td>
          <td style="padding:6px 8px;text-align:right">
            ${
              factTotal > 0
                ? `<span style="font-weight:700;color:#1a7e2e">${factTotal} шт</span>`
                : `<span style="border-bottom:1px solid #000;display:inline-block;width:50px;height:12px"></span>`
            }
          </td>
          <td style="padding:6px 8px;font-size:11px;color:#1a237e;font-weight:600">${clientName}</td>
          <td style="padding:6px 8px;font-size:11px">${escapeHtmlPrint(planDateStr)}</td>
          <td style="padding:6px 8px">
            ${
              factDateStr
                ? `<span style="font-size:11px">${escapeHtmlPrint(factDateStr)}</span>`
                : `<span style="border-bottom:1px solid #000;display:inline-block;width:60px;height:12px"></span>`
            }
          </td>
          <td style="padding:6px 8px;font-size:11px">${floorCell}</td>
        </tr>`;

          const matrixRow = mini
            ? `<tr style="background:${rowBg}">
          <td colspan="2"></td>
          <td colspan="7" style="padding:4px 8px 8px">${mini}</td>
        </tr>`
            : '';

          return mainRow + matrixRow;
        })
        .join('');

      return `
  <div style="
    background:#1a237e;
    color:#fff;
    padding:8px 16px;
    margin:12px 0 6px 0;
    font-size:13px;
    font-weight:700;
    letter-spacing:0.5px;
    display:flex;
    justify-content:space-between;
    align-items:center;
  ">
    <span>Неделя раскроя: ${weekLabel}</span>
    <span style="font-weight:400;font-size:11px;opacity:0.8">
      ${weekDocs.length} заказов · ${weekPlanSum} шт план
    </span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px">
    <thead>
      <tr style="background:#e8eaf6;border-bottom:2px solid #1a237e">
        <th style="width:30px;padding:5px 6px;text-align:center;color:#333">№</th>
        <th style="width:50px;padding:5px 6px;color:#333">Фото</th>
        <th style="padding:5px 8px;text-align:left;color:#333">TZ — MODEL</th>
        <th style="width:80px;padding:5px 8px;text-align:right;color:#333">План кол-во</th>
        <th style="width:80px;padding:5px 8px;text-align:right;color:#333">Факт кол-во</th>
        <th style="width:90px;padding:5px 8px;color:#333">Клиент</th>
        <th style="width:80px;padding:5px 8px;color:#333">Дата план</th>
        <th style="width:80px;padding:5px 8px;color:#333">Дата факт</th>
        <th style="width:90px;padding:5px 8px;color:#333">Этаж</th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>`;
    })
    .join('');

  const printDate = escapeHtmlPrint(new Date().toLocaleDateString('ru-RU'));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Раскрой</title>
  <style>${style}</style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="page-title">ПЛАН РАСКРОЯ</div>
      <div class="page-meta">${printDate} · Заказов: ${fullDocs.length}</div>
    </div>
    <div style="font-size:16px;font-weight:700;color:#1a237e">ERDEN</div>
  </div>
  ${weekBlocks}
  <div class="signatures">
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Раскройщик</div>
    </div>
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Технолог</div>
    </div>
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Проверил</div>
    </div>
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Дата</div>
    </div>
  </div>
</body>
</html>`;
}

function planQtyCuttingOrder(o) {
  if (!o) return '—';
  const q = o.qty_order ?? o.quantity ?? o.total_quantity ?? o.amount;
  if (q == null || q === '') return '—';
  return String(q);
}

function planQtyCuttingNumber(o) {
  const q = o?.qty_order ?? o?.quantity ?? o?.total_quantity ?? o?.amount;
  const n = parseInt(q, 10);
  return Number.isFinite(n) ? n : 0;
}

const CHAIN_FILTER_INPUT = {
  background: '#1a1a1a',
  border: '0.5px solid #444',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
};

function escapeRegExpChain(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function orderTzModelLineCutting(order) {
  if (!order) return '—';
  const article = String(order.article || order.tz_code || '').trim();
  let rawName = String(order.model_name || '').trim();
  const title = String(order.title || '').trim();
  if (!rawName) rawName = title;
  if (article && rawName) {
    rawName = rawName.replace(new RegExp(`^${escapeRegExpChain(article)}\\s*[—\\-·]\\s*`, 'i'), '').trim();
  }
  const name = rawName || title || order.model_name || '—';
  if (article) return `${article} — ${name}`;
  return name || `Заказ #${order.id}`;
}

function firstPhotoSrcCutting(order) {
  const p = order?.photos;
  if (!Array.isArray(p) || !p.length) return null;
  const x = p[0];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

function statusColorCutting(status) {
  return (
    {
      pending: '#ff6b6b',
      in_progress: '#F59E0B',
      done: '#c8ff00',
    }[status] || '#666'
  );
}

/** Просрочка: фактическая неделя (понедельник) позже конца плановой недели */
function isOverdueCuttingFactWeek(weekStartIso, factWeekStartIso) {
  if (!weekStartIso || !factWeekStartIso) return false;
  const ws = new Date(`${chainDateIsoCut(weekStartIso)}T12:00:00`);
  const limit = new Date(ws);
  limit.setDate(limit.getDate() + 7);
  const fw = new Date(`${chainDateIsoCut(factWeekStartIso)}T12:00:00`);
  return fw > limit;
}

/** Pivot actual_variants to { sizes, rows: [{ color, bySize }] } — Table 1: раскрой по партиям (export for OrderDetails) */
export function buildBatchPivot(actualVariants) {
  const variants = actualVariants || [];
  const sizeSet = new Set();
  const byColor = {};
  for (const v of variants) {
    const size = String(v.size || '').trim() || '—';
    const color = String(v.color || '').trim() || '—';
    sizeSet.add(size);
    if (!byColor[color]) byColor[color] = {};
    byColor[color][size] = (byColor[color][size] || 0) + (parseInt(v.quantity_actual, 10) || 0);
  }
  const sizes = [...sizeSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const rows = Object.entries(byColor).map(([color, bySize]) => ({ color, bySize }));
  return { sizes, rows };
}

/** Aggregate batches into totals by color — Table 2: итог по цветам (export for OrderDetails) */
export function buildTotalsPivot(batchesData) {
  const allSizes = new Set();
  const totalsByColor = {};
  for (const { sizes, rows } of batchesData) {
    sizes.forEach((s) => allSizes.add(s));
    for (const { color, bySize } of rows) {
      if (!totalsByColor[color]) totalsByColor[color] = {};
      for (const [size, qty] of Object.entries(bySize)) {
        totalsByColor[color][size] = (totalsByColor[color][size] || 0) + qty;
      }
    }
  }
  const sizes = [...allSizes].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const rows = Object.entries(totalsByColor).map(([color, bySize]) => {
    let total = 0;
    for (const q of Object.values(bySize)) total += q;
    return { color, bySize, total };
  });
  return { sizes, rows };
}

export function CompleteByFactModal({ task, onClose, onSave, isEditMode }) {
  const today = new Date().toISOString().slice(0, 10);
  const variants = task.Order?.OrderVariants || [];
  const actualMap = (task.actual_variants || []).reduce(
    (acc, v) => { acc[`${v.color}|${v.size}`] = v.quantity_actual; return acc; },
    {}
  );
  const colorSet = new Set();
  const sizeSet = new Set();
  const pivot = {};
  for (const v of variants) {
    const color = String(v.color || '').trim() || '—';
    const size = (v.Size?.name || v.Size?.code || '').toString().trim() || '—';
    if (color && size) {
      colorSet.add(color);
      sizeSet.add(size);
      const key = `${color}|${size}`;
      if (!pivot[color]) pivot[color] = {};
      pivot[color][size] = actualMap[key] ?? v.quantity ?? 0;
    }
  }
  const colors = [...colorSet].sort();
  const sizes = [...sizeSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const [pivotState, setPivotState] = useState(() => JSON.parse(JSON.stringify(pivot)));
  const [endDate, setEndDate] = useState(task.end_date || today);
  const { registerRef, handleKeyDown } = useGridNavigation(colors.length, sizes.length);

  const handleChange = (color, size, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setPivotState((prev) => ({
      ...prev,
      [color]: { ...(prev[color] || {}), [size]: n },
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const actualVariants = [];
    for (const color of colors) {
      for (const size of sizes) {
        const q = pivotState[color]?.[size] || 0;
        if (q > 0) {
          actualVariants.push({ color, size, quantity_planned: 0, quantity_actual: q });
        }
      }
    }
    onSave(actualVariants, endDate);
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden" onClick={onClose}>
      <div
        className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text p-4 sm:p-6 pb-0 shrink-0">
          {isEditMode ? 'Редактировать по факту' : 'Завершить по факту'} — #{task.order_id} {task.Order?.title}
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 pt-4">
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Заполните количество по факту (цвет × размер)</p>
            <div className="overflow-x-auto -mx-1 mb-4">
              <table className="w-full text-sm table-fixed min-w-[280px]">
                <thead>
                  <tr className="bg-accent-2/50 dark:bg-dark-800">
                    <th className="text-left px-4 py-2.5 font-medium w-[120px]">Цвет</th>
                    {sizes.map((s) => (
                      <th key={s} className="text-center px-2 py-2.5 font-medium">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color, ci) => (
                    <tr key={color} className="border-t border-white/10">
                      <td className="px-4 py-2.5">{color}</td>
                      {sizes.map((size, si) => (
                        <td key={size} className="px-2 py-2.5">
                          <input
                            ref={registerRef(ci, si)}
                            type="number"
                            min="0"
                            placeholder="0"
                            value={numInputValue(pivotState[color]?.[size])}
                            onChange={(e) => handleChange(color, size, e.target.value)}
                            onKeyDown={handleKeyDown(ci, si)}
                            className="w-full min-w-[3rem] px-2 py-1.5 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Дата окончания</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
            </div>
            <div className="flex gap-2 justify-end flex-wrap shrink-0 pt-4">
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                {isEditMode ? 'Сохранить' : 'Сохранить и завершить'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text">
                Отмена
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default function Cutting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh: refreshOrderProgress } = useOrderProgress();
  const canEditChainDocs = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [workshops, setWorkshops] = useState([]);
  const [chainBuildingFloors, setChainBuildingFloors] = useState([]);
  const [chainDocs, setChainDocs] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainBanner, setChainBanner] = useState(null);
  const [factModal, setFactModal] = useState(null);
  const factModalSyncRef = useRef(null);
  /** Debounce автосохранения фактов по ячейке (цвет+размер) */
  const saveCuttingFactTimerRef = useRef({});
  const isSavingFactsRef = useRef(false);

  useEffect(() => {
    factModalSyncRef.current = factModal;
  }, [factModal]);

  useEffect(() => {
    return () => {
      Object.values(saveCuttingFactTimerRef.current).forEach((t) => {
        if (t) clearTimeout(t);
      });
      saveCuttingFactTimerRef.current = {};
    };
  }, [factModal?.id]);
  /** Пустые даты = «все периоды», иначе документы вне текущего месяца не попадают в таблицу */
  const [chainDateFrom, setChainDateFrom] = useState('');
  const [chainDateTo, setChainDateTo] = useState('');
  const [chainFilterStatus, setChainFilterStatus] = useState('all');
  const [chainFilterSection, setChainFilterSection] = useState('all');
  const [isPrinting, setIsPrinting] = useState(false);

  const setChainQuickRange = (range) => {
    const today = new Date();
    if (range === 'week') {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(today);
      mon.setDate(today.getDate() + diff);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setChainDateFrom(mon.toISOString().split('T')[0]);
      setChainDateTo(sun.toISOString().split('T')[0]);
    }
    if (range === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setChainDateFrom(first.toISOString().split('T')[0]);
      setChainDateTo(last.toISOString().split('T')[0]);
    }
    if (range === 'next_month') {
      const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      setChainDateFrom(first.toISOString().split('T')[0]);
      setChainDateTo(last.toISOString().split('T')[0]);
    }
  };

  const loadChainDocs = useCallback(() => {
    setChainLoading(true);
    if (import.meta.env.DEV) console.log('[Раскрой] загрузка документов…');
    api.cutting
      .documentsList()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        if (import.meta.env.DEV) {
          console.log('[Раскрой] документов:', list.length);
          if (list[0]) console.log('[Раскрой] первый:', list[0]);
        }
        setChainDocs(list);
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.error('[Раскрой] ошибка:', err?.status, err?.message, err);
        }
        setChainDocs([]);
        setChainBanner({
          type: 'err',
          text: err?.message || 'Не удалось загрузить документы раскроя',
        });
        window.setTimeout(() => setChainBanner(null), 5000);
      })
      .finally(() => setChainLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.workshops
      .list()
      .then((list) => {
        if (!cancelled) setWorkshops(list);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[Cutting.jsx]:', err?.message || err);
          setWorkshops(CHAIN_WORKSHOPS_FALLBACK);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.references
      .buildingFloors(4)
      .then((data) => {
        if (!cancelled) setChainBuildingFloors(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[Cutting.jsx]:', err?.message || err);
          setChainBuildingFloors([
            { id: 2, name: '2 этаж' },
            { id: 3, name: '3 этаж' },
            { id: 4, name: '4 этаж' },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadChainDocs();
  }, [loadChainDocs]);

  const filteredChainDocs = useMemo(() => {
    return chainDocs.filter((doc) => {
      const ws = chainDateIsoCut(doc.week_start);
      if (chainDateFrom) {
        if (!ws) return false;
        if (ws < chainDateFrom) return false;
      }
      if (chainDateTo) {
        if (!ws) return false;
        if (ws > chainDateTo) return false;
      }
      const st = doc.status || 'pending';
      if (chainFilterStatus !== 'all' && st !== chainFilterStatus) return false;
      if (!docMatchesChainSectionFilter(doc, chainFilterSection, workshops)) return false;
      return true;
    });
  }, [chainDocs, chainDateFrom, chainDateTo, chainFilterStatus, chainFilterSection, workshops]);

  const cuttingDocsByPlanWeek = useMemo(() => {
    const map = new Map();
    for (const d of filteredChainDocs) {
      const k = chainDateIsoCut(d.week_start) || '__none';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '__none') return 1;
      if (b === '__none') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => [k, map.get(k)]);
  }, [filteredChainDocs]);

  const patchCuttingChainDoc = useCallback(
    async (docId, body, { successMessage } = {}) => {
      if (!canEditChainDocs) return;
      try {
        const updated = await api.cutting.documentPatch(docId, body);
        setChainDocs((prev) => prev.map((x) => (Number(x.id) === Number(docId) ? { ...x, ...updated } : x)));
        if (successMessage) {
          setChainBanner({ type: 'ok', text: successMessage });
          window.setTimeout(() => setChainBanner(null), 3500);
        }
      } catch (e) {
        setChainBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
        window.setTimeout(() => setChainBanner(null), 4000);
      }
    },
    [canEditChainDocs]
  );

  const saveCuttingFactWeek = (docId, dateStr) => {
    if (!dateStr) {
      patchCuttingChainDoc(docId, { actual_week_start: null });
      return;
    }
    patchCuttingChainDoc(docId, { actual_week_start: getMonday(dateStr) });
  };

  const handleCuttingStatusChange = (doc, value) => {
    patchCuttingChainDoc(doc.id, { status: value });
  };

  const changeCuttingPlanWeek = (docId, dateStr) => {
    if (!dateStr || !canEditChainDocs) return;
    const monday = getMonday(dateStr);
    patchCuttingChainDoc(
      docId,
      { week_start: monday, actual_week_start: monday },
      { successMessage: `Неделя изменена на ${formatWeekRangeLabel(monday)}` }
    );
  };

  const updateCuttingSection = (docId, sectionId) => {
    patchCuttingChainDoc(docId, {
      section_id: sectionId === '' ? null : sectionId,
    });
  };

  const updateCuttingFloor = (docId, floorId) => {
    if (!canEditChainDocs) return;
    const raw = floorId === '' || floorId == null ? null : parseInt(floorId, 10);
    patchCuttingChainDoc(docId, {
      floor_id: Number.isFinite(raw) ? raw : null,
    });
  };

  const effectiveCuttingSectionId = (doc) => effectiveChainSectionKey(doc);

  const saveCuttingComment = (docId, value) => {
    patchCuttingChainDoc(docId, { comment: value || null });
  };

  const openFactModal = async (doc) => {
    const orderId = doc.order_id ?? doc.Order?.id;
    if (!orderId) {
      setChainBanner({ type: 'err', text: 'У документа нет привязки к заказу' });
      window.setTimeout(() => setChainBanner(null), 4000);
      return;
    }
    setFactModal({
      ...doc,
      specification: [],
      cutting_facts: [...(doc.cutting_facts || [])].map((f) => ({ ...f })),
      _orderSpecLoading: true,
    });
    try {
      const [orderRes, factsRes] = await Promise.all([
        api.orders.get(orderId),
        api.cutting.documentFactsList(doc.id),
      ]);
      const specification = (orderRes.variants || []).map((v) => ({
        color: v.color != null ? String(v.color).trim() : '',
        size: v.size != null ? String(v.size).trim() : '',
        quantity: Math.max(0, parseInt(v.quantity, 10) || 0),
      }));
      const gridNums = orderRes.size_grid?.numeric || orderRes.size_grid_numeric || [];
      const factsFromApi = (factsRes || []).map((f) => ({ ...f }));
      let cutting_facts = factsFromApi;
      if (factsFromApi.length === 0 && Array.isArray(gridNums) && gridNums.length > 0) {
        const defaultColor =
          (specification.find((s) => String(s.color || '').trim()) || {}).color?.trim() || 'Основной';
        cutting_facts = gridNums.map((num) => ({
          color: defaultColor,
          size: String(num),
          quantity: 0,
          isNew: true,
        }));
      }
      setFactModal((prev) =>
        prev && Number(prev.id) === Number(doc.id)
          ? {
              ...prev,
              Order: orderRes,
              specification,
              cutting_facts,
              _orderSpecLoading: false,
            }
          : prev
      );
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Не удалось загрузить заказ или факты раскроя' });
      window.setTimeout(() => setChainBanner(null), 4000);
      setFactModal(null);
    }
  };

  const updateFactQty = (color, size, quantity) => {
    const c = String(color ?? '').trim();
    const s = String(size ?? '').trim();
    const q = Math.max(0, parseInt(quantity, 10) || 0);

    const prev = factModalSyncRef.current;
    if (!prev || prev._orderSpecLoading) return;

    const facts = [...(prev.cutting_facts || [])];
    const idx = facts.findIndex(
      (f) => String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
    );
    if (idx >= 0) {
      facts[idx] = { ...facts[idx], quantity: q };
    } else {
      facts.push({ color: c, size: s, quantity: q, isNew: true });
    }
    const nextModal = { ...prev, cutting_facts: facts };
    factModalSyncRef.current = nextModal;
    setFactModal(nextModal);

    const docId = prev.id;
    const timerKey = `${c}\u0000${s}`;
    const timers = saveCuttingFactTimerRef.current;
    if (timers[timerKey]) {
      clearTimeout(timers[timerKey]);
    }
    const expectedQ = q;

    timers[timerKey] = setTimeout(async () => {
      delete saveCuttingFactTimerRef.current[timerKey];
      const cur = factModalSyncRef.current;
      if (!cur || Number(cur.id) !== Number(docId) || cur._orderSpecLoading) return;
      const r = (cur.cutting_facts || []).find(
        (f) => String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
      );
      const curQ = Math.max(0, parseInt(r?.quantity, 10) || 0);
      if (curQ !== expectedQ) return;

      try {
        if (r?.id && !r.isNew) {
          await api.cutting.factPatch(r.id, { quantity: curQ });
          console.log('[Cutting] автосохранено:', c, s, curQ);
          refreshOrderProgress();
        } else if (curQ > 0) {
          const created = await api.cutting.documentFactCreate(docId, {
            color: c,
            size: s,
            quantity: curQ,
          });
          const withId = { ...created, isNew: false };
          setFactModal((p) => {
            if (!p || Number(p.id) !== Number(docId)) return p;
            const nf = (p.cutting_facts || []).map((f) =>
              !f?.id && String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
                ? { ...withId }
                : f
            );
            const merged = { ...p, cutting_facts: nf };
            factModalSyncRef.current = merged;
            return merged;
          });
          console.log('[Cutting] автосохранено (создан факт):', c, s, curQ);
          refreshOrderProgress();
        }
      } catch (err) {
        console.error('[Cutting] ошибка автосохранения:', err);
      }
    }, 800);
  };

  const saveFacts = async () => {
    if (!factModal || factModal._orderSpecLoading) return;
    if (isSavingFactsRef.current) {
      console.log('[Cutting] saveFacts уже выполняется, пропуск');
      return;
    }
    isSavingFactsRef.current = true;

    Object.values(saveCuttingFactTimerRef.current).forEach((t) => {
      if (t) clearTimeout(t);
    });
    saveCuttingFactTimerRef.current = {};

    const docId = factModal.id;
    const rows = factModal.cutting_facts || [];
    try {
      for (const f of rows) {
        const q = Math.max(0, parseInt(f.quantity, 10) || 0);
        if (f.isNew && q > 0 && f.id == null) {
          await api.cutting.documentFactCreate(docId, {
            color: String(f.color ?? '').trim(),
            size: String(f.size ?? '').trim(),
            quantity: q,
          });
        }
      }
      const toPatch = rows.filter((f) => f.id != null);
      await Promise.all(
        toPatch.map((f) =>
          api.cutting.factPatch(f.id, {
            quantity: Math.max(0, parseInt(f.quantity, 10) || 0),
          })
        )
      );
      const refreshed = await api.cutting.documentFactsList(docId);
      setChainDocs((prev) =>
        prev.map((d) => (Number(d.id) === Number(docId) ? { ...d, cutting_facts: refreshed } : d))
      );
      setChainBanner({ type: 'ok', text: 'Факт раскроя сохранён → передан в пошив' });
      window.setTimeout(() => setChainBanner(null), 3500);
      setFactModal(null);
      refreshOrderProgress();
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
      window.setTimeout(() => setChainBanner(null), 4000);
    } finally {
      isSavingFactsRef.current = false;
    }
  };

  const printCuttingDocWithData = useCallback(
    async (doc) => {
      const orderId = doc.order_id ?? doc.Order?.id;
      if (!orderId) {
        setChainBanner({ type: 'err', text: 'Нет заказа для печати' });
        window.setTimeout(() => setChainBanner(null), 4000);
        return;
      }
      try {
        const [orderRes, factsRes] = await Promise.all([
          api.orders.get(orderId),
          api.cutting.documentFactsList(doc.id),
        ]);
        const specification = (orderRes.variants || []).map((v) => ({
          color: v.color != null ? String(v.color).trim() : '',
          size: v.size != null ? String(v.size).trim() : '',
          quantity: Math.max(0, parseInt(v.quantity, 10) || 0),
        }));
        const sectionKey = effectiveChainSectionKey(doc);
        const workshopLabel =
          workshops.find((w) => String(w.id) === String(sectionKey))?.name ||
          LEGACY_SECTION_LABELS[sectionKey] ||
          doc.workshop ||
          String(sectionKey || '') ||
          '—';
        const printFloorName = resolvePrintFloorName(doc, chainBuildingFloors);
        const mergedOrder = {
          ...(doc.Order || {}),
          ...orderRes,
          Client: orderRes.Client || doc.Order?.Client,
        };
        const photoRawForPrint = firstPhotoSrcCutting(mergedOrder);
        const photoBase64 =
          photoRawForPrint != null && photoRawForPrint !== ''
            ? await cuttingPhotoUrlToDataUrl(photoRawForPrint)
            : null;
        const ok = printCuttingDoc({
          ...doc,
          Order: {
            ...mergedOrder,
            ...(photoBase64 ? { photoBase64 } : {}),
          },
          specification,
          cutting_facts: Array.isArray(factsRes) ? factsRes : [],
          print_workshop_name: workshopLabel,
          print_floor_name: printFloorName,
          _print_building_floors: chainBuildingFloors,
        });
        if (!ok) {
          setChainBanner({ type: 'err', text: 'Браузер заблокировал окно печати' });
          window.setTimeout(() => setChainBanner(null), 4000);
        }
      } catch (e) {
        setChainBanner({ type: 'err', text: e?.message || 'Не удалось подготовить печать' });
        window.setTimeout(() => setChainBanner(null), 4000);
      }
    },
    [workshops, chainBuildingFloors]
  );

  const printAllCuttingDocs = useCallback(async () => {
    const docs = filteredChainDocs;
    if (!docs.length) {
      setChainBanner({ type: 'err', text: 'Нет документов для печати по фильтрам' });
      window.setTimeout(() => setChainBanner(null), 3500);
      return;
    }
    try {
      const fullDocs = (
        await Promise.all(
          docs.map(async (doc) => {
            const orderId = doc.order_id ?? doc.Order?.id;
            if (!orderId) return null;
            const [orderRes, factsRes] = await Promise.all([
              api.orders.get(orderId).catch(() => null),
              api.cutting.documentFactsList(doc.id).catch(() => []),
            ]);
            const specification = orderRes?.variants
              ? (orderRes.variants || []).map((v) => ({
                  color: v.color != null ? String(v.color).trim() : '',
                  size: v.size != null ? String(v.size).trim() : '',
                  quantity: Math.max(0, parseInt(v.quantity, 10) || 0),
                }))
              : [];
            const cutting_facts = Array.isArray(factsRes) ? factsRes : [];
            const floorHit = chainBuildingFloors.find(
              (f) => String(f.id) === String(doc.floor_id)
            );
            const floor_name =
              floorHit?.name || resolvePrintFloorName(doc, chainBuildingFloors);
            const mergedOrder = orderRes
              ? { ...(doc.Order || {}), ...orderRes, Client: orderRes.Client || doc.Order?.Client }
              : doc.Order || {};
            const photoRawForPrint = firstPhotoSrcCutting(mergedOrder);
            const photoBase64 =
              photoRawForPrint != null && photoRawForPrint !== ''
                ? await cuttingPhotoUrlToDataUrl(photoRawForPrint)
                : null;
            return {
              ...doc,
              Order: { ...mergedOrder, ...(photoBase64 ? { photoBase64 } : {}) },
              specification,
              cutting_facts,
              floor_name,
              _print_building_floors: chainBuildingFloors,
            };
          })
        )
      ).filter(Boolean);
      const html = buildPrintAllCuttingSimpleTableHtml(fullDocs);
      const win = window.open('', '_blank');
      if (!win) {
        setChainBanner({ type: 'err', text: 'Браузер заблокировал окно печати' });
        window.setTimeout(() => setChainBanner(null), 4000);
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      window.setTimeout(() => win.print(), 600);
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Не удалось подготовить печать списка' });
      window.setTimeout(() => setChainBanner(null), 4000);
    }
  }, [filteredChainDocs, chainBuildingFloors]);

  return (
    <div>
      <div className="no-print relative flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6 pr-0">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#ECECEC] dark:text-dark-text">Раскрой</h1>
        <div className="no-print flex flex-wrap gap-2 sm:absolute sm:top-0 sm:right-0 shrink-0">
          <button
            type="button"
            onClick={async () => {
              setIsPrinting(true);
              try {
                await printAllCuttingDocs();
              } finally {
                setIsPrinting(false);
              }
            }}
            disabled={isPrinting}
            className="inline-flex items-center gap-1.5 px-[18px] py-2 rounded-md text-[13px] font-semibold text-white border-0 cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: '#1a237e' }}
          >
            {isPrinting ? '⏳ Подготовка...' : '🖨 Печать'}
          </button>
        </div>
      </div>

      <>
          {chainBanner ? (
            <div
              className={`no-print mb-3 px-4 py-2 rounded-lg text-sm ${
                chainBanner.type === 'ok'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}
            >
              {chainBanner.text}
            </div>
          ) : null}
          {!chainLoading ? (
            <div
              className="no-print"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#888' }}>От:</span>
                <input
                  type="date"
                  value={chainDateFrom}
                  onChange={(e) => setChainDateFrom(e.target.value)}
                  style={CHAIN_FILTER_INPUT}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#888' }}>До:</span>
                <input
                  type="date"
                  value={chainDateTo}
                  onChange={(e) => setChainDateTo(e.target.value)}
                  style={CHAIN_FILTER_INPUT}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setChainQuickRange('week')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '0.5px solid #444',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  Эта неделя
                </button>
                <button
                  type="button"
                  onClick={() => setChainQuickRange('month')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '0.5px solid #444',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  Этот месяц
                </button>
                <button
                  type="button"
                  onClick={() => setChainQuickRange('next_month')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '0.5px solid #444',
                    background: 'transparent',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  Следующий месяц
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChainDateFrom('');
                    setChainDateTo('');
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    border: '0.5px solid #c8ff00',
                    background: 'transparent',
                    color: '#c8ff00',
                    cursor: 'pointer',
                  }}
                >
                  Все периоды
                </button>
                {import.meta.env.DEV ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const data = await api.cutting.syncToSewing();
                        const n = data?.synced ?? 0;
                        window.alert(`Синхронизировано: ${n} строк`);
                        loadChainDocs();
                      } catch (e) {
                        window.alert(e?.message || 'Ошибка синхронизации');
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      border: '0.5px solid #888',
                      background: 'transparent',
                      color: '#888',
                      cursor: 'pointer',
                    }}
                  >
                    [DEV] Синхронизировать с пошивом
                  </button>
                ) : null}
              </div>
              <select
                value={chainFilterStatus}
                onChange={(e) => setChainFilterStatus(e.target.value)}
                style={CHAIN_FILTER_INPUT}
              >
                <option value="all">Все статусы</option>
                <option value="pending">Не начато</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Раскроено</option>
              </select>
              <select
                value={chainFilterSection}
                onChange={(e) => setChainFilterSection(e.target.value)}
                style={CHAIN_FILTER_INPUT}
              >
                <option value="all">Все цеха</option>
                {workshops.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 13, color: '#666', marginLeft: 'auto' }}>
                Показано: {filteredChainDocs.length} заказов
              </span>
            </div>
          ) : null}
          {chainLoading ? (
            <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
          ) : chainDocs.length === 0 ? (
            <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет документов из плана цеха</p>
          ) : filteredChainDocs.length === 0 ? (
            <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет документов по выбранным фильтрам</p>
          ) : (
            <div className="no-print overflow-x-auto rounded-lg border border-white/15 max-h-[min(70vh,calc(100vh-14rem))] overflow-y-auto mb-6">
              <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    background: '#1a237e',
                  }}
                >
                  <tr style={{ color: '#fff' }}>
                    {CHAIN_TABLE_HEADERS.map((h) => (
                      <th
                        key={h.label}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          ...h.thStyle,
                        }}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cuttingDocsByPlanWeek.map(([weekKey, docs]) => (
                    <Fragment key={weekKey}>
                      <tr style={{ background: '#1a1a24' }}>
                        <td
                          colSpan={CHAIN_COLS}
                          style={{
                            padding: '8px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#94a3b8',
                            borderBottom: '1px solid #2a2a2a',
                          }}
                        >
                          Неделя: {weekKey === '__none' ? '—' : formatWeekRangeLabel(weekKey)} — {docs.length}{' '}
                          заказов
                        </td>
                      </tr>
                      {docs.map((doc) => {
                        const o = doc.Order;
                        const photo = firstPhotoSrcCutting(o);
                        const client = o?.Client?.name || '—';
                        const st = doc.status || 'pending';
                        const weekS = chainDateIsoCut(doc.week_start);
                        const origWeek = chainDateIsoCut(doc.original_week_start);
                        const factW = chainDateIsoCut(doc.actual_week_start) || '';
                        const sectionVal = effectiveCuttingSectionId(doc);
                        const overdue = isOverdueCuttingFactWeek(doc.week_start, doc.actual_week_start);
                        const doneRow = st === 'done';
                        let rowBg = 'transparent';
                        if (overdue) rowBg = 'rgba(255,68,68,0.08)';
                        else if (doneRow) rowBg = 'rgba(200,255,0,0.05)';
                        return (
                          <tr
                            key={doc.id}
                            style={{
                              background: rowBg,
                              borderBottom: '1px solid #222',
                            }}
                          >
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              {photo ? (
                                <img
                                  src={photo}
                                  alt=""
                                  width={48}
                                  height={48}
                                  style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 4,
                                    background: '#222',
                                  }}
                                />
                              )}
                              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>#{doc.order_id}</div>
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <div style={{ color: '#c8ff00', fontWeight: 500 }}>{orderTzModelLineCutting(o)}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>#{doc.id}</div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                {planQtyCuttingOrder(o)}
                              </div>
                              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>шт</div>
                            </td>
                            <td style={{ padding: '4px 8px', verticalAlign: 'top', minWidth: 120 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 4,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: getTotalFact(doc) > 0 ? '#c8ff00' : '#666',
                                  }}
                                >
                                  {getTotalFact(doc) || '0'} шт
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openFactModal(doc)}
                                  style={{
                                    fontSize: 10,
                                    color: '#4a9eff',
                                    background: 'transparent',
                                    border: '0.5px solid #4a9eff',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Детали
                                </button>
                              </div>
                              {(doc.cutting_facts || []).slice(0, 2).map((f) => (
                                <div
                                  key={f.id}
                                  style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}
                                >
                                  {f.color || '—'} / {f.size || '—'}: {f.quantity ?? 0}шт
                                </div>
                              ))}
                              {(doc.cutting_facts || []).length > 2 ? (
                                <div style={{ fontSize: 10, color: '#555' }}>
                                  +{(doc.cutting_facts || []).length - 2} ещё...
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#4a9eff', verticalAlign: 'top' }}>{client}</td>
                            <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 13, verticalAlign: 'top' }}>
                              {formatWeekRangeLabel(doc.week_start)}
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              {origWeek && origWeek !== weekS ? (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: '#555',
                                    textDecoration: 'line-through',
                                    marginBottom: 2,
                                  }}
                                >
                                  {formatWeekRangeLabel(doc.original_week_start)}
                                </div>
                              ) : null}
                              <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>
                                {formatWeekRangeLabel(doc.week_start)}
                              </div>
                              <input
                                type="date"
                                value={weekS}
                                disabled={!canEditChainDocs}
                                title="Изменить неделю плана"
                                onChange={(e) => changeCuttingPlanWeek(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: '0.5px solid #444',
                                  color: '#c8ff00',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: canEditChainDocs ? 'pointer' : 'not-allowed',
                                  width: 150,
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', verticalAlign: 'top', minWidth: 130 }}>
                              <input
                                type="date"
                                value={factW}
                                disabled={!canEditChainDocs}
                                onChange={(e) => saveCuttingFactWeek(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: factW ? '0.5px solid #c8ff00' : '0.5px solid #333',
                                  color: factW ? '#c8ff00' : '#555',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: canEditChainDocs ? 'pointer' : 'not-allowed',
                                  width: 130,
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                              <select
                                value={doc.floor_id != null && doc.floor_id !== '' ? String(doc.floor_id) : ''}
                                disabled={!canEditChainDocs}
                                onChange={(e) => updateCuttingFloor(doc.id, e.target.value)}
                                style={{
                                  background: '#1a1a1a',
                                  border: doc.floor_id ? '0.5px solid #c8ff00' : '0.5px solid #333',
                                  color: doc.floor_id ? '#fff' : '#555',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  minWidth: 110,
                                  cursor: canEditChainDocs ? 'pointer' : 'not-allowed',
                                }}
                              >
                                <option value="">— Этаж —</option>
                                {chainBuildingFloors.map((f) => (
                                  <option key={f.id} value={String(f.id)}>
                                    {f.name}
                                  </option>
                                ))}
                                {doc.floor_id != null &&
                                doc.floor_id !== '' &&
                                !chainBuildingFloors.some((f) => String(f.id) === String(doc.floor_id)) ? (
                                  <option value={String(doc.floor_id)}>Этаж #{doc.floor_id}</option>
                                ) : null}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <select
                                value={st}
                                disabled={!canEditChainDocs}
                                onChange={(e) => handleCuttingStatusChange(doc, e.target.value)}
                                style={{
                                  background: '#1a1a1a',
                                  border: '0.5px solid #333',
                                  color: statusColorCutting(st),
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              >
                                <option value="pending">Не начато</option>
                                <option value="in_progress">В процессе</option>
                                <option value="done">Раскроено</option>
                              </select>
                              {doc.sewing_doc?.id ? (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => navigate('/sewing')}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') navigate('/sewing');
                                  }}
                                  style={{
                                    fontSize: 10,
                                    color: '#4a9eff',
                                    cursor: 'pointer',
                                    marginTop: 4,
                                    textDecoration: 'underline',
                                  }}
                                >
                                  → Пошив #{doc.sewing_doc.id}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <select
                                value={sectionVal}
                                disabled={!canEditChainDocs}
                                onChange={(e) => updateCuttingSection(doc.id, e.target.value)}
                                style={{
                                  background: '#1a1a1a',
                                  border: '0.5px solid #444',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  minWidth: 140,
                                }}
                              >
                                <option value="">— Выбрать цех —</option>
                                {workshops.map((w) => (
                                  <option key={w.id} value={String(w.id)}>
                                    {w.name}
                                  </option>
                                ))}
                                {sectionVal &&
                                !workshops.some((w) => String(w.id) === String(sectionVal)) ? (
                                  <option value={sectionVal}>
                                    {LEGACY_SECTION_LABELS[sectionVal] || sectionVal}
                                  </option>
                                ) : null}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <input
                                key={`${doc.id}-${doc.updated_at || ''}-${doc.comment || ''}`}
                                type="text"
                                placeholder="Комментарий..."
                                defaultValue={doc.comment || ''}
                                disabled={!canEditChainDocs}
                                onBlur={(e) => saveCuttingComment(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: '0.5px solid #333',
                                  color: '#aaa',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  width: 160,
                                  maxWidth: '100%',
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => printCuttingDocWithData(doc)}
                                style={{
                                  color: '#4a9eff',
                                  background: 'transparent',
                                  border: '0.5px solid #4a9eff',
                                  borderRadius: 4,
                                  padding: '4px 10px',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                🖨 Печать
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>

      {factModal &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setFactModal(null);
            }}
            role="presentation"
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '0.5px solid #333',
                borderRadius: 12,
                padding: 24,
                width: 560,
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: '80vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cutting-fact-modal-title"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  gap: 12,
                }}
              >
                <div>
                  <div
                    id="cutting-fact-modal-title"
                    style={{ fontSize: 16, fontWeight: 600, color: '#c8ff00' }}
                  >
                    {(() => {
                      const fo = factModal.Order;
                      const a = String(fo?.article || fo?.tz_code || '').trim();
                      const n = String(fo?.model_name || fo?.title || '').trim();
                      if (a && n) return `${a} — ${n}`;
                      return a || n || '—';
                    })()}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    План: {planQtyCuttingOrder(factModal.Order)} шт
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFactModal(null)}
                  style={{
                    color: '#666',
                    background: 'transparent',
                    border: 'none',
                    fontSize: 20,
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: 'rgba(200,255,0,0.08)',
                  border: '0.5px solid rgba(200,255,0,0.3)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#c8ff00',
                }}
              >
                ⚡ Данные автоматически передаются в Пошив
              </div>

              {factModal._orderSpecLoading ? (
                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#888' }}>
                  Загрузка спецификации заказа…
                </div>
              ) : (factModal.specification || []).length === 0 ? (
                <div style={{ padding: '16px 0', fontSize: 13, color: '#888' }}>
                  В заказе нет матрицы цвет/размер (варианты). Добавьте варианты в карточке заказа.
                </div>
              ) : (
                (() => {
                  const spec = factModal.specification || [];
                  const colors = [
                    ...new Set(spec.map((s) => String(s.color ?? '').trim()).filter(Boolean)),
                  ].sort((a, b) => a.localeCompare(b, 'ru'));
                  const sizes = [
                    ...new Set(spec.map((s) => String(s.size ?? '').trim()).filter(Boolean)),
                  ].sort((a, b) => a.localeCompare(b, 'ru'));

                  const getPlanQty = (color, size) => {
                    const row = spec.find(
                      (s) =>
                        String(s.color ?? '').trim() === String(color ?? '').trim() &&
                        String(s.size ?? '').trim() === String(size ?? '').trim()
                    );
                    return row ? Math.max(0, parseInt(row.quantity, 10) || 0) : 0;
                  };

                  const getFactQty = (color, size) => {
                    const f = findCuttingFactForSpec(factModal.cutting_facts, color, size);
                    return parseInt(f?.quantity, 10) || 0;
                  };

                  const getRowTotal = (color) =>
                    sizes.reduce((sum, size) => sum + getFactQty(color, size), 0);

                  const getRowPlan = (color) =>
                    sizes.reduce((sum, size) => sum + getPlanQty(color, size), 0);

                  const getColTotal = (size) =>
                    colors.reduce((sum, color) => sum + getFactQty(color, size), 0);

                  const getColPlan = (size) =>
                    colors.reduce((sum, color) => sum + getPlanQty(color, size), 0);

                  const getGrandTotal = () =>
                    colors.reduce((sum, color) => sum + getRowTotal(color), 0);

                  const getGrandPlan = () =>
                    colors.reduce((sum, color) => sum + getRowPlan(color), 0);

                  const orderForHead = factModal.Order;

                  return (
                    <div style={{ overflowX: 'auto' }}>
                        <table
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={FACT_HEAD_COLOR_TOP}>Цвет</th>
                              {sizes.map((size) => (
                                <th key={size} style={factMatrixHeadNumStyle(size, orderForHead)}>
                                  {size}
                                </th>
                              ))}
                              <th style={FACT_HEAD_TOTAL_TOP}>Итого</th>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #333' }}>
                              <th style={FACT_HEAD_COLOR_BOTTOM} aria-hidden />
                              {sizes.map((size) => (
                                <th key={`letter-${size}`} style={factMatrixHeadLetterStyle(size, orderForHead)}>
                                  {getSizeLetter(size)}
                                </th>
                              ))}
                              <th style={FACT_HEAD_TOTAL_BOTTOM} aria-hidden />
                            </tr>
                          </thead>
                          <tbody>
                            {colors.map((color) => (
                              <tr key={color} style={{ borderBottom: '0.5px solid #1e1e1e' }}>
                                <td style={{ padding: '8px 12px', color: '#fff', fontSize: 13 }}>{color}</td>
                                {sizes.map((size) => {
                                  const planQty = getPlanQty(color, size);
                                  const factQty = getFactQty(color, size);
                                  const over = planQty > 0 && factQty > planQty;
                                  const complete = planQty > 0 && factQty === planQty;

                                  return (
                                    <td key={size} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      {planQty > 0 ? (
                                        canEditChainDocs ? (
                                          <input
                                            type="number"
                                            min={0}
                                            value={numInputValue(factQty)}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              const n =
                                                raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                              updateFactQty(color, size, n);
                                            }}
                                            style={{
                                              width: 72,
                                              textAlign: 'center',
                                              background:
                                                factQty > planQty
                                                  ? 'rgba(255,68,68,0.15)'
                                                  : factQty === planQty && planQty > 0
                                                    ? 'rgba(200,255,0,0.1)'
                                                    : factQty > 0
                                                      ? 'rgba(245,158,11,0.1)'
                                                      : '#1a1a1a',
                                              border: `0.5px solid ${
                                                factQty > planQty
                                                  ? '#ff4444'
                                                  : factQty === planQty && planQty > 0
                                                    ? '#c8ff00'
                                                    : factQty > 0
                                                      ? '#F59E0B'
                                                      : '#333'
                                              }`,
                                              color: factQty > planQty ? '#ff6b6b' : '#fff',
                                              padding: '6px 8px',
                                              borderRadius: 6,
                                              fontSize: 13,
                                              fontWeight: 600,
                                            }}
                                          />
                                        ) : (
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              minWidth: 72,
                                              textAlign: 'center',
                                              color: over
                                                ? '#ff6b6b'
                                                : complete
                                                  ? '#c8ff00'
                                                  : '#fff',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {factQty}
                                          </span>
                                        )
                                      ) : (
                                        <span style={{ color: '#333', fontSize: 12 }}>—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td
                                  style={{
                                    padding: '8px 12px',
                                    textAlign: 'right',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    borderLeft: '0.5px solid #333',
                                  }}
                                >
                                  {(() => {
                                    const rowFact = getRowTotal(color);
                                    const rowPlan = getRowPlan(color);
                                    return (
                                      <>
                                        <div
                                          style={{
                                            color:
                                              rowFact > rowPlan
                                                ? '#ff6b6b'
                                                : rowFact === rowPlan
                                                  ? '#c8ff00'
                                                  : '#fff',
                                          }}
                                        >
                                          {rowFact}
                                        </div>
                                        {rowFact !== rowPlan && rowPlan > 0 ? (
                                          <div
                                            style={{
                                              fontSize: 10,
                                              color: rowFact > rowPlan ? '#ff6b6b' : '#888',
                                              marginTop: 2,
                                            }}
                                          >
                                            {rowFact > rowPlan
                                              ? `+${rowFact - rowPlan} сверх`
                                              : `−${rowPlan - rowFact} остаток`}
                                          </div>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '2px solid #444' }}>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: '#888',
                                }}
                              >
                                Итого:
                              </td>
                              {sizes.map((size) => {
                                const colFact = getColTotal(size);
                                const colPlan = getColPlan(size);
                                return (
                                  <td
                                    key={size}
                                    style={{
                                      padding: '10px 8px',
                                      textAlign: 'center',
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color:
                                          colFact > colPlan
                                            ? '#ff6b6b'
                                            : colFact === colPlan
                                              ? '#c8ff00'
                                              : '#aaa',
                                      }}
                                    >
                                      {colFact}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#555' }}>план: {colPlan}</div>
                                  </td>
                                );
                              })}
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'right',
                                  borderLeft: '0.5px solid #333',
                                }}
                              >
                                {(() => {
                                  const gt = getGrandTotal();
                                  const gp = getGrandPlan();
                                  return (
                                    <>
                                      <div
                                        style={{
                                          fontSize: 15,
                                          fontWeight: 700,
                                          color:
                                            gt > gp ? '#ff6b6b' : gt === gp ? '#c8ff00' : '#fff',
                                        }}
                                      >
                                        {gt}
                                      </div>
                                      <div style={{ fontSize: 10, color: '#555' }}>план: {gp}</div>
                                      {gt !== gp ? (
                                        <div
                                          style={{
                                            fontSize: 10,
                                            color: gt > gp ? '#ff6b6b' : '#888',
                                          }}
                                        >
                                          {gt > gp ? `+${gt - gp}` : `−${gp - gt}`}
                                        </div>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                    </div>
                  );
                })()
              )}

              {(() => {
                const spec = factModal.specification || [];
                const matrixReady = spec.length > 0 && !factModal._orderSpecLoading;
                let planTotal = 0;
                let factTotal = 0;
                if (matrixReady) {
                  const colors = [
                    ...new Set(spec.map((s) => String(s.color ?? '').trim()).filter(Boolean)),
                  ].sort((a, b) => a.localeCompare(b, 'ru'));
                  const sizes = [
                    ...new Set(spec.map((s) => String(s.size ?? '').trim()).filter(Boolean)),
                  ].sort((a, b) => a.localeCompare(b, 'ru'));
                  planTotal = spec.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0) || 0;
                  factTotal = colors.reduce(
                    (acc, color) =>
                      acc +
                      sizes.reduce(
                        (rowSum, size) =>
                          rowSum +
                          (parseInt(
                            findCuttingFactForSpec(factModal.cutting_facts, color, size)?.quantity,
                            10
                          ) || 0),
                        0
                      ),
                    0
                  );
                } else {
                  planTotal = planQtyCuttingNumber(factModal.Order);
                  factTotal = getTotalFact(factModal);
                }
                const percentRaw =
                  planTotal > 0 ? Math.round((factTotal / planTotal) * 100) : 0;
                const barWidthPct = Math.min(100, Math.max(0, percentRaw));
                const barBg = !matrixReady
                  ? '#c8ff00'
                  : percentRaw > 100
                    ? '#ff4444'
                    : percentRaw === 100
                      ? '#c8ff00'
                      : '#F59E0B';
                const trackBg = matrixReady ? '#222' : '#333';
                return (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        position: 'relative',
                        background: trackBg,
                        borderRadius: 4,
                        height: 6,
                      }}
                    >
                      <div
                        style={{
                          background: barBg,
                          borderRadius: 4,
                          height: 6,
                          width: `${barWidthPct}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
                      {matrixReady && percentRaw > 100 ? (
                        <div
                          style={{
                            position: 'absolute',
                            top: -2,
                            left: '100%',
                            transform: 'translateX(-1px)',
                            width: 2,
                            height: 10,
                            background: '#ff4444',
                            borderRadius: 1,
                          }}
                        />
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      <span
                        style={{
                          color: !matrixReady
                            ? '#888'
                            : percentRaw > 100
                              ? '#ff6b6b'
                              : percentRaw === 100
                                ? '#c8ff00'
                                : '#888',
                        }}
                      >
                        {matrixReady
                          ? `Выполнено ${percentRaw}%${
                              percentRaw > 100 ? ' (перевыполнение)' : ''
                            }`
                          : 'Выполнено'}
                      </span>
                      <span
                        style={{
                          color: !matrixReady
                            ? undefined
                            : percentRaw > 100
                              ? '#ff6b6b'
                              : percentRaw === 100
                                ? '#c8ff00'
                                : '#aaa',
                        }}
                      >
                        {factTotal} / {matrixReady ? planTotal : planQtyCuttingOrder(factModal.Order)} шт
                        {matrixReady && factTotal > planTotal
                          ? ` (+${factTotal - planTotal})`
                          : ''}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 16,
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setFactModal(null)}
                  style={{
                    padding: '8px 20px',
                    background: 'transparent',
                    border: '0.5px solid #444',
                    color: '#888',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Закрыть
                </button>
                {canEditChainDocs ? (
                  <button
                    type="button"
                    onClick={() => saveFacts()}
                    disabled={!!factModal._orderSpecLoading}
                    style={{
                      padding: '8px 20px',
                      background: '#c8ff00',
                      border: 'none',
                      color: '#000',
                      fontWeight: 600,
                      borderRadius: 6,
                      cursor: factModal._orderSpecLoading ? 'not-allowed' : 'pointer',
                      opacity: factModal._orderSpecLoading ? 0.5 : 1,
                    }}
                  >
                    Сохранить
                  </button>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
