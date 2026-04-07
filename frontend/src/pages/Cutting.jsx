/**
 * Страница раскроя — документы из плана цеха
 */

import React, { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
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

function chainDateIsoCut(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

const CHAIN_COLS = 12;

const CHAIN_TABLE_HEADERS = [
  { label: 'Фото' },
  { label: 'TZ — MODEL' },
  { label: 'План кол-во', thStyle: { textAlign: 'right' } },
  { label: 'Факт кол-во', thStyle: { textAlign: 'right', minWidth: 120 } },
  { label: 'Клиент' },
  { label: 'Неделя план' },
  { label: 'Дата план' },
  { label: 'Дата факт' },
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
  const photoAbs = absPhotoUrlForPrint(photoRaw);
  const photoBlock = photoAbs
    ? `<img class="product-photo" src="${escapeHtmlPrint(photoAbs)}" alt="" onerror="this.style.display='none'">`
    : `<div class="product-photo-placeholder">Фото</div>`;

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
    .doc-info {
      display: grid;
      grid-template-columns: auto auto auto;
      gap: 8px 32px;
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f9f9f9;
    }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .info-value { font-size: 13px; font-weight: 600; }
    .product-block {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .product-photo {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    .product-photo-placeholder {
      width: 80px;
      height: 80px;
      background: #eee;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #999;
    }
    .product-info { flex: 1; }
    .product-name {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .product-article { font-size: 12px; color: #666; }
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
    .totals-block {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
      padding: 10px 14px;
      border: 2px solid #1a237e;
      border-radius: 4px;
    }
    .total-item { display: flex; flex-direction: column; gap: 2px; }
    .total-label { font-size: 10px; color: #888; }
    .total-value { font-size: 18px; font-weight: 700; }
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
  <div class="product-block">
    ${photoBlock}
    <div class="product-info">
      <div class="product-name">${productLine}</div>
      <div class="product-article">Заказ #${escapeHtmlPrint(String(doc.order_id ?? ''))} · Документ #${escapeHtmlPrint(String(doc.id ?? ''))}</div>
    </div>
  </div>
  <div class="doc-info">
    <div class="info-item">
      <span class="info-label">Клиент</span>
      <span class="info-value">${clientName}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Неделя план</span>
      <span class="info-value">${escapeHtmlPrint(formatWeekForPrint(doc.week_start))}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Дата план</span>
      <span class="info-value">${escapeHtmlPrint(planDateStr)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Дата факт</span>
      <span class="info-value">${escapeHtmlPrint(factDateStr)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Статус</span>
      <span class="info-value">${statusLabel}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Цех</span>
      <span class="info-value">${workshopLabel}</span>
    </div>
  </div>
  <div class="totals-block">
    <div class="total-item">
      <span class="total-label">ПЛАН</span>
      <span class="total-value">${planTotal} шт</span>
    </div>
    <div class="total-item">
      <span class="total-label">ФАКТ</span>
      <span class="total-value" style="color:${
        factTotal >= planTotal ? '#1a7e2e' : factTotal > 0 ? '#b36800' : '#000'
      }">${factTotal} шт</span>
    </div>
    <div class="total-item">
      <span class="total-label">ОСТАТОК</span>
      <span class="total-value" style="color:${
        planTotal - factTotal < 0 ? '#c00' : planTotal - factTotal === 0 ? '#1a7e2e' : '#000'
      }">${planTotal - factTotal} шт</span>
    </div>
    <div class="total-item">
      <span class="total-label">ВЫПОЛНЕНО</span>
      <span class="total-value">${planTotal > 0 ? Math.round((factTotal / planTotal) * 100) : 0}%</span>
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

/** Несколько документов раскроя в одном HTML для печати (текущий отфильтрованный список) */
function buildPrintAllCuttingHtml(fullDocs) {
  const style = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size:12px; color:#000; }
    .page-break { page-break-after: always; }
    .doc-wrap { padding-bottom: 8px; }
    .doc-header {
      display:flex; justify-content:space-between; align-items:flex-start;
      margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #000;
    }
    .doc-title { font-size:14px; font-weight:700; }
    .doc-date { font-size:11px; color:#666; margin-top:2px; }
    .product-block { display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
    .product-photo { width:70px; height:70px; object-fit:cover; border-radius:4px; border:1px solid #ddd; }
    .product-name { font-size:14px; font-weight:700; }
    .product-meta { font-size:11px; color:#666; margin-top:2px; }
    .info-row {
      display:flex; gap:24px; margin-bottom:12px; padding:8px 12px;
      background:#f5f5f5; border-radius:4px; flex-wrap:wrap;
    }
    .info-item { display:flex; flex-direction:column; gap:1px; }
    .info-label { font-size:9px; color:#999; text-transform:uppercase; }
    .info-value { font-size:12px; font-weight:600; }
    .totals {
      display:flex; gap:24px; margin-bottom:12px; padding:8px 12px;
      border:2px solid #1a237e; border-radius:4px;
    }
    .total-label { font-size:9px; color:#999; text-transform:uppercase; }
    .total-value { font-size:16px; font-weight:700; }
    .matrix-label { font-size:12px; font-weight:700; margin-bottom:6px; }
    table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:11px; }
    th {
      background:#1a237e; color:#fff; padding:5px 8px; text-align:center;
      border:1px solid #0d1564;
    }
    th:first-child { text-align:left; }
    td { padding:5px 8px; border:1px solid #ddd; text-align:center; }
    td:first-child { text-align:left; font-weight:500; background:#f9f9f9; }
    tfoot td { font-weight:700; background:#eee; }
    .cell-plan { font-size:9px; color:#888; }
    .cell-fact { font-size:12px; font-weight:700; }
    .fact-done { color:#1a7e2e; }
    .fact-partial { color:#b36800; }
    .fact-zero { color:#ccc; }
    .signatures { display:flex; gap:32px; margin-top:16px; padding-top:12px; border-top:1px solid #ccc; }
    .sig-line { border-bottom:1px solid #000; height:20px; margin-bottom:3px; }
    .sig-label { font-size:9px; color:#666; }
    @media print { @page { margin:10mm; size:A4; } }
  `;

  const sections = fullDocs.map((doc, docIdx) => {
    const spec = doc.specification || [];
    const facts = doc.cutting_facts || [];
    const colors = [
      ...new Set(spec.map((s) => String(s.color ?? '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'ru'));
    const sizes = [
      ...new Set(spec.map((s) => String(s.size ?? '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'ru'));

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

    const planTotal = spec.reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0) || 0;
    const factTotal = facts.reduce((sum, f) => sum + (parseInt(f.quantity, 10) || 0), 0) || 0;

    const O = doc.Order || {};
    const photoUrl = absPhotoUrlForPrint(firstPhotoSrcCutting(O));
    const productName = escapeHtmlPrint(orderTzModelLineCutting(O));
    const client = escapeHtmlPrint(O.Client?.name || O.client_name || '—');
    const weekIso = chainDateIsoCut(doc.week_start);
    const planDate =
      weekIso && new Date(`${weekIso}T12:00:00`).toLocaleDateString('ru-RU');
    const factIso = chainDateIsoCut(doc.actual_week_start || doc.actual_date);
    const factDate =
      factIso && new Date(`${factIso}T12:00:00`).toLocaleDateString('ru-RU');
    const st = doc.status || 'pending';
    const statusText = escapeHtmlPrint(
      st === 'done' ? 'Раскроено' : st === 'in_progress' ? 'В процессе' : 'Не начато'
    );
    const workshop = escapeHtmlPrint(
      doc.print_workshop_name || doc.workshop_name || doc.section_id || doc.workshop || '—'
    );

    const photoHtml = photoUrl
      ? `<img class="product-photo" src="${escapeHtmlPrint(photoUrl)}" alt="" onerror="this.style.display='none'">`
      : `<div style="width:70px;height:70px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999">Фото</div>`;

    let matrixHtml;
    if (!colors.length || !sizes.length) {
      matrixHtml = `<p style="margin:8px 0;font-size:11px;color:#666">Нет матрицы цвет × размер.</p>`;
    } else {
      const sizeThs = sizes.map((s) => `<th>${escapeHtmlPrint(s)}</th>`).join('');
      const tbody = colors
        .map((color) => {
          const rowFact = sizes.reduce((s, sz) => s + getFact(color, sz), 0);
          const rowPlan = sizes.reduce((s, sz) => s + getPlan(color, sz), 0);
          const cells = sizes
            .map((sz) => {
              const p = getPlan(color, sz);
              const f = getFact(color, sz);
              if (!p) return '<td style="color:#ddd">—</td>';
              const cls = f >= p ? 'fact-done' : f > 0 ? 'fact-partial' : 'fact-zero';
              return `<td><div class="cell-plan">${p}</div><div class="cell-fact ${cls}">${f}</div></td>`;
            })
            .join('');
          const rowCls = rowFact >= rowPlan ? 'fact-done' : rowFact > 0 ? 'fact-partial' : 'fact-zero';
          return `<tr><td>${escapeHtmlPrint(color)}</td>${cells}<td><div class="cell-plan">${rowPlan}</div><div class="cell-fact ${rowCls}">${rowFact}</div></td></tr>`;
        })
        .join('');
      const tfootCells = sizes
        .map((sz) => {
          const cp = colors.reduce((s, c) => s + getPlan(c, sz), 0);
          const cf = colors.reduce((s, c) => s + getFact(c, sz), 0);
          const colCls = cf >= cp ? 'fact-done' : cf > 0 ? 'fact-partial' : 'fact-zero';
          return `<td><div class="cell-plan">${cp}</div><div class="cell-fact ${colCls}">${cf}</div></td>`;
        })
        .join('');
      const grandCls = factTotal >= planTotal ? 'fact-done' : factTotal > 0 ? 'fact-partial' : 'fact-zero';
      matrixHtml = `
        <table>
          <thead><tr><th>Цвет</th>${sizeThs}<th>Итого</th></tr></thead>
          <tbody>${tbody}</tbody>
          <tfoot><tr><td>Итого</td>${tfootCells}<td><div class="cell-plan">${planTotal}</div><div class="cell-fact ${grandCls}">${factTotal}</div></td></tr></tfoot>
        </table>`;
    }

    const breakAttr = docIdx < fullDocs.length - 1 ? ' class="page-break doc-wrap"' : ' class="doc-wrap"';
    return `
<div${breakAttr}>
  <div class="doc-header">
    <div>
      <div class="doc-title">ДОКУМЕНТ РАСКРОЯ #${escapeHtmlPrint(String(doc.id ?? ''))}</div>
      <div class="doc-date">Печать: ${escapeHtmlPrint(new Date().toLocaleDateString('ru-RU'))}</div>
    </div>
    <div style="font-size:16px;font-weight:700;color:#1a237e">ERDEN</div>
  </div>
  <div class="product-block">
    ${photoHtml}
    <div>
      <div class="product-name">${productName}</div>
      <div class="product-meta">Заказ #${escapeHtmlPrint(String(doc.order_id ?? ''))}</div>
    </div>
  </div>
  <div class="info-row">
    <div class="info-item"><span class="info-label">Клиент</span><span class="info-value">${client}</span></div>
    <div class="info-item"><span class="info-label">Неделя план</span><span class="info-value">${escapeHtmlPrint(formatWeekForPrint(doc.week_start))}</span></div>
    <div class="info-item"><span class="info-label">Дата план</span><span class="info-value">${escapeHtmlPrint(planDate || '—')}</span></div>
    <div class="info-item"><span class="info-label">Дата факт</span><span class="info-value">${escapeHtmlPrint(factDate || '—')}</span></div>
    <div class="info-item"><span class="info-label">Статус</span><span class="info-value">${statusText}</span></div>
    <div class="info-item"><span class="info-label">Цех</span><span class="info-value">${workshop}</span></div>
  </div>
  <div class="totals">
    <div><div class="total-label">ПЛАН</div><div class="total-value">${planTotal} шт</div></div>
    <div><div class="total-label">ФАКТ</div><div class="total-value" style="color:${factTotal >= planTotal ? '#1a7e2e' : factTotal > 0 ? '#b36800' : '#000'}">${factTotal} шт</div></div>
    <div><div class="total-label">ОСТАТОК</div><div class="total-value" style="color:${planTotal - factTotal < 0 ? '#c00' : planTotal - factTotal === 0 ? '#1a7e2e' : '#000'}">${planTotal - factTotal} шт</div></div>
  </div>
  <div class="matrix-label">Детализация (план / факт)</div>
  ${matrixHtml}
  <div class="signatures">
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Раскройщик</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Технолог</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Дата</div></div>
  </div>
</div>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Раскрой — все документы</title><style>${style}</style></head><body>${sections.join('')}</body></html>`;
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

function initialChainDateFrom() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

function initialChainDateTo() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
}

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

function formatDateChain(iso) {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  return d[2] && d[1] ? `${d[2]}.${d[1]}.${d[0]}` : iso;
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
  const { user } = useAuth();
  const canEditChainDocs = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [workshops, setWorkshops] = useState([]);
  const [chainDocs, setChainDocs] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainBanner, setChainBanner] = useState(null);
  const [factModal, setFactModal] = useState(null);
  const [chainDateFrom, setChainDateFrom] = useState(initialChainDateFrom);
  const [chainDateTo, setChainDateTo] = useState(initialChainDateTo);
  const [chainFilterStatus, setChainFilterStatus] = useState('all');
  const [chainFilterSection, setChainFilterSection] = useState('all');

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
    api.cutting
      .documentsList()
      .then((data) => setChainDocs(Array.isArray(data) ? data : []))
      .catch(() => setChainDocs([]))
      .finally(() => setChainLoading(false));
  }, []);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops(CHAIN_WORKSHOPS_FALLBACK));
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

  const updateCuttingStatus = (docId, value) => {
    patchCuttingChainDoc(docId, { status: value });
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
      setFactModal((prev) =>
        prev && Number(prev.id) === Number(doc.id)
          ? {
              ...prev,
              Order: orderRes,
              specification,
              cutting_facts: factsRes.map((f) => ({ ...f })),
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
    const q = Math.max(0, parseInt(quantity, 10) || 0);
    setFactModal((prev) => {
      if (!prev) return prev;
      const facts = [...(prev.cutting_facts || [])];
      const idx = facts.findIndex(
        (f) => String(f.color ?? '').trim() === String(color ?? '').trim() && String(f.size ?? '').trim() === String(size ?? '').trim()
      );
      if (idx >= 0) {
        facts[idx] = { ...facts[idx], quantity: q };
      } else {
        facts.push({
          color: String(color ?? '').trim(),
          size: String(size ?? '').trim(),
          quantity: q,
          isNew: true,
        });
      }
      return { ...prev, cutting_facts: facts };
    });
  };

  const saveFacts = async () => {
    if (!factModal || factModal._orderSpecLoading) return;
    const docId = factModal.id;
    const rows = factModal.cutting_facts || [];
    try {
      const tasks = [];
      for (const f of rows) {
        const q = Math.max(0, parseInt(f.quantity, 10) || 0);
        if (f.isNew && q > 0) {
          tasks.push(
            api.cutting.documentFactCreate(docId, {
              color: String(f.color ?? '').trim(),
              size: String(f.size ?? '').trim(),
              quantity: q,
            })
          );
        } else if (f.id != null && !f.isNew) {
          tasks.push(api.cutting.factPatch(f.id, { quantity: q }));
        }
      }
      await Promise.all(tasks);
      const refreshed = await api.cutting.documentFactsList(docId);
      setChainDocs((prev) =>
        prev.map((d) => (Number(d.id) === Number(docId) ? { ...d, cutting_facts: refreshed } : d))
      );
      setChainBanner({ type: 'ok', text: 'Данные раскроя сохранены' });
      window.setTimeout(() => setChainBanner(null), 3500);
      setFactModal(null);
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
      window.setTimeout(() => setChainBanner(null), 4000);
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
        const ok = printCuttingDoc({
          ...doc,
          Order: { ...(doc.Order || {}), ...orderRes, Client: orderRes.Client || doc.Order?.Client },
          specification,
          cutting_facts: Array.isArray(factsRes) ? factsRes : [],
          print_workshop_name: workshopLabel,
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
    [workshops]
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
            return {
              ...doc,
              Order: { ...(doc.Order || {}), ...orderRes, Client: orderRes.Client || doc.Order?.Client },
              specification,
              cutting_facts: Array.isArray(factsRes) ? factsRes : [],
              print_workshop_name: workshopLabel,
            };
          })
        )
      ).filter(Boolean);
      const html = buildPrintAllCuttingHtml(fullDocs);
      const win = window.open('', '_blank');
      if (!win) {
        setChainBanner({ type: 'err', text: 'Браузер заблокировал окно печати' });
        window.setTimeout(() => setChainBanner(null), 4000);
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      window.setTimeout(() => win.print(), 800);
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Не удалось подготовить печать списка' });
      window.setTimeout(() => setChainBanner(null), 4000);
    }
  }, [filteredChainDocs, workshops]);

  return (
    <div>
      <div className="no-print relative flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6 pr-0">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#ECECEC] dark:text-dark-text">Раскрой</h1>
        <button
          type="button"
          onClick={() => printAllCuttingDocs()}
          className="no-print inline-flex items-center gap-1.5 sm:absolute sm:top-0 sm:right-0 px-[18px] py-2 rounded-md text-[13px] font-semibold text-white border-0 cursor-pointer shrink-0"
          style={{ background: '#1a237e' }}
        >
          🖨 Печать
        </button>
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
                        const factW =
                          chainDateIsoCut(doc.actual_week_start) || chainDateIsoCut(doc.week_start) || '';
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
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <input
                                type="date"
                                value={factW}
                                disabled={!canEditChainDocs}
                                onChange={(e) => saveCuttingFactWeek(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: '0.5px solid #333',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: canEditChainDocs ? 'pointer' : 'not-allowed',
                                }}
                              />
                              {factW ? (
                                <div style={{ fontSize: 11, color: '#c8ff00', marginTop: 2 }}>
                                  ✓ {formatDateChain(factW)}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <select
                                value={st}
                                disabled={!canEditChainDocs}
                                onChange={(e) => updateCuttingStatus(doc.id, e.target.value)}
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

                  const getColTotal = (size) =>
                    colors.reduce((sum, color) => sum + getFactQty(color, size), 0);

                  const getGrandTotal = () =>
                    colors.reduce((sum, color) => sum + getRowTotal(color), 0);

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
                            <tr style={{ borderBottom: '1px solid #333' }}>
                              <th
                                style={{
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  color: '#666',
                                  fontWeight: 500,
                                  minWidth: 120,
                                }}
                              >
                                Цвет
                              </th>
                              {sizes.map((size) => (
                                <th
                                  key={size}
                                  style={{
                                    textAlign: 'center',
                                    padding: '10px 16px',
                                    color: '#aaa',
                                    fontWeight: 500,
                                    minWidth: 80,
                                  }}
                                >
                                  {size}
                                </th>
                              ))}
                              <th
                                style={{
                                  textAlign: 'right',
                                  padding: '10px 12px',
                                  color: '#888',
                                  fontWeight: 500,
                                  minWidth: 80,
                                }}
                              >
                                Итого
                              </th>
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
                                  const partial = planQty > 0 && factQty > 0 && factQty < planQty;

                                  return (
                                    <td key={size} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      {planQty > 0 ? (
                                        canEditChainDocs ? (
                                          <input
                                            type="number"
                                            min={0}
                                            max={planQty}
                                            value={numInputValue(factQty)}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              const n =
                                                raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                              updateFactQty(color, size, Math.min(planQty, n));
                                            }}
                                            style={{
                                              width: 72,
                                              textAlign: 'center',
                                              background: over
                                                ? 'rgba(255,68,68,0.12)'
                                                : complete
                                                  ? 'rgba(200,255,0,0.1)'
                                                  : partial
                                                    ? 'rgba(245,158,11,0.1)'
                                                    : '#1a1a1a',
                                              border: `0.5px solid ${
                                                over
                                                  ? '#ff6b6b'
                                                  : complete
                                                    ? '#c8ff00'
                                                    : partial
                                                      ? '#F59E0B'
                                                      : '#333'
                                              }`,
                                              color: complete ? '#c8ff00' : '#fff',
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
                                              color: complete ? '#c8ff00' : '#fff',
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
                                    color: '#fff',
                                    borderLeft: '0.5px solid #333',
                                  }}
                                >
                                  {getRowTotal(color)}
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
                                Итого
                              </td>
                              {sizes.map((size) => (
                                <td
                                  key={size}
                                  style={{
                                    padding: '10px 8px',
                                    textAlign: 'center',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: '#aaa',
                                  }}
                                >
                                  {getColTotal(size)}
                                </td>
                              ))}
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'right',
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: '#c8ff00',
                                  borderLeft: '0.5px solid #333',
                                }}
                              >
                                {getGrandTotal()}
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
                const percent =
                  planTotal > 0 ? Math.min(100, Math.round((factTotal / planTotal) * 100)) : 0;
                const barBg = matrixReady
                  ? percent >= 100
                    ? '#c8ff00'
                    : '#F59E0B'
                  : '#c8ff00';
                const trackBg = matrixReady ? '#222' : '#333';
                return (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: '#666',
                        marginBottom: matrixReady ? 6 : 4,
                      }}
                    >
                      <span>{matrixReady ? `Выполнено ${percent}%` : 'Выполнено'}</span>
                      <span
                        style={{
                          color:
                            matrixReady && factTotal >= planTotal ? '#c8ff00' : matrixReady ? '#aaa' : undefined,
                        }}
                      >
                        {factTotal} / {matrixReady ? planTotal : planQtyCuttingOrder(factModal.Order)} шт
                      </span>
                    </div>
                    <div style={{ background: trackBg, borderRadius: 4, height: 6 }}>
                      <div
                        style={{
                          background: barBg,
                          borderRadius: 4,
                          height: 6,
                          width: `${percent}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
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
