/**
 * Страница закупа — список заявок + завершение (куплено + цена)
 * План (материал + план) редактируется только в карточке заказа.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { MONTH_SHORT_RU, getMonday } from '../utils/cycleWeekLabels';
import {
  CHAIN_WORKSHOPS_FALLBACK,
  LEGACY_SECTION_LABELS,
  docMatchesChainSectionFilter,
  effectiveChainSectionKey,
  orderQuantityShown,
} from '../utils/planChainWorkshops';

function formatDate(iso) {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  return d[2] && d[1] ? `${d[2]}.${d[1]}.${d[0]}` : iso;
}

function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function formatWeekRange(dateStr) {
  if (!dateStr) return '—';
  const iso = chainDateIso(dateStr);
  if (!iso) return '—';
  const start = new Date(`${iso}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => `${d.getDate()} ${MONTH_SHORT_RU[d.getMonth()] || ''}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${MONTH_SHORT_RU[end.getMonth()] || ''}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** TZ — модель без дублирования артикула в названии */
function orderTzModelLine(order) {
  if (!order) return '—';
  const article = String(order.article || order.tz_code || '').trim();
  let rawName = String(order.model_name || '').trim();
  const title = String(order.title || '').trim();
  if (!rawName) rawName = title;
  if (article && rawName) {
    rawName = rawName.replace(new RegExp(`^${escapeRegExp(article)}\\s*[—\\-·]\\s*`, 'i'), '').trim();
  }
  const name = rawName || title || order.model_name || '—';
  if (article) return `${article} — ${name}`;
  return name || `Заказ #${order.id}`;
}

function statusColor(status) {
  return (
    {
      pending: '#ff6b6b',
      in_progress: '#F59E0B',
      done: '#c8ff00',
    }[status] || '#666'
  );
}

function firstPhotoSrc(order) {
  const p = order?.photos;
  if (!Array.isArray(p) || !p.length) return null;
  const x = p[0];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

/** Просрочка: фактическая дата позже конца плановой недели (week_start + 7 дней) */
function isOverdueActualDate(weekStartIso, actualDateIso) {
  if (!weekStartIso || !actualDateIso) return false;
  const ws = new Date(`${chainDateIso(weekStartIso)}T12:00:00`);
  const limit = new Date(ws);
  limit.setDate(limit.getDate() + 7);
  const ad = new Date(`${chainDateIso(actualDateIso)}T12:00:00`);
  return ad > limit;
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
  if (t.startsWith('//'))
    return `${typeof window !== 'undefined' ? window.location.protocol : 'https:'}${t}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${t.startsWith('/') ? '' : '/'}${t}`;
}

async function purchasePhotoUrlToDataUrl(url) {
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

const PRINT_MONTHS_SHORT = [
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

function formatWeekForPrint(dateStr) {
  if (!dateStr || dateStr === 'unknown') return '—';
  const iso = chainDateIso(dateStr);
  if (!iso) return '—';
  const start = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(start.getTime())) return '—';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const months = PRINT_MONTHS_SHORT;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

function groupPurchasePrintDocsByWeek(docs) {
  const groups = {};
  for (const doc of docs) {
    const week = chainDateIso(doc.week_start) || 'unknown';
    if (!groups[week]) groups[week] = [];
    groups[week].push(doc);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return a.localeCompare(b);
  });
}

function resolvePrintWorkshopName(doc, workshops) {
  const sec = effectiveChainSectionKey(doc);
  if (!sec) return doc.workshop_name || '—';
  const hit = (workshops || []).find((w) => String(w.id) === String(sec));
  if (hit?.name) return hit.name;
  return LEGACY_SECTION_LABELS[sec] || sec;
}

function purchasePrintQtyNumber(order) {
  const q = orderQuantityShown(order);
  const n = parseInt(String(q).replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function buildPurchasePlanPrintHtml(fullDocs, chainWorkshops) {
  const printDate = escapeHtmlPrint(new Date().toLocaleDateString('ru-RU'));

  const weeksHtml = groupPurchasePrintDocsByWeek(fullDocs)
    .map(([weekStart, weekDocs]) => {
      const weekTotal = weekDocs.reduce((s, d) => s + purchasePrintQtyNumber(d.Order), 0);
      const weekLabel = escapeHtmlPrint(formatWeekForPrint(weekStart));

      const rowsHtml = weekDocs
        .map((doc) => {
          const O = doc.Order || {};
          const article = String(O.article || O.tz_code || '').trim();
          const art3 = escapeHtmlPrint(article.slice(0, 3) || '?');
          const displayName = escapeHtmlPrint(orderTzModelLine(O));
          const qtyStr = escapeHtmlPrint(orderQuantityShown(O));
          const clientName = escapeHtmlPrint(O.Client?.name || O.client_name || '—');
          const planWeekLabel = escapeHtmlPrint(formatWeekForPrint(doc.week_start));
          const weekIso = chainDateIso(doc.week_start);
          const planDateStr = weekIso
            ? escapeHtmlPrint(new Date(`${weekIso}T12:00:00`).toLocaleDateString('ru-RU'))
            : '—';
          const actualIso = chainDateIso(doc.actual_date);
          const actualDateHtml = actualIso
            ? escapeHtmlPrint(new Date(`${actualIso}T12:00:00`).toLocaleDateString('ru-RU'))
            : '<span class="date-line"></span>';
          const st = doc.status || 'pending';
          const statusText =
            st === 'done' ? 'Закуплено' : st === 'in_progress' ? 'В процессе' : 'Не начато';
          const workshopLabel = escapeHtmlPrint(resolvePrintWorkshopName(doc, chainWorkshops));
          const comment = escapeHtmlPrint(doc.comment || '');

          const photoB64 =
            O.photoBase64 != null && typeof O.photoBase64 === 'string' && O.photoBase64.startsWith('data:')
              ? O.photoBase64
              : null;
          const photoRaw = firstPhotoSrc(O);
          const photoUrl = photoB64 ? '' : photoRaw ? absPhotoUrlForPrint(photoRaw) : '';
          const rowImgSrc = photoB64 || photoUrl;

          let photoCell;
          if (rowImgSrc) {
            if (photoB64) {
              photoCell = `<img src="${escapeHtmlPrint(photoB64)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:3px;border:1px solid #ddd">`;
            } else {
              photoCell = `<img src="${escapeHtmlPrint(photoUrl)}" crossorigin="anonymous" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:3px;border:1px solid #ddd" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'"><div style="display:none;width:36px;height:36px;background:#e8eaf6;border-radius:3px;align-items:center;justify-content:center;font-size:8px;color:#3949ab;border:1px solid #c5cae9;font-weight:700">${art3}</div>`;
            }
          } else {
            photoCell = `<div style="width:36px;height:36px;background:#e8eaf6;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#3949ab;font-weight:700;border:1px solid #c5cae9">${art3}</div>`;
          }

          return `
      <div class="doc-row">
        <div class="col-photo">${photoCell}</div>
        <div class="col-name">
          <div class="name-main">${displayName}</div>
          <div class="name-sub">#${escapeHtmlPrint(String(doc.order_id ?? ''))}</div>
        </div>
        <div class="col-qty">${qtyStr} шт</div>
        <div class="col-client">${clientName}</div>
        <div>${planWeekLabel}</div>
        <div>${planDateStr}</div>
        <div>${actualDateHtml}</div>
        <div>
          <span class="status-badge status-${escapeHtmlPrint(st)}">${escapeHtmlPrint(statusText)}</span>
        </div>
        <div>${workshopLabel}</div>
        <div style="color:#666;font-style:italic">${comment}</div>
      </div>`;
        })
        .join('');

      return `
    <div class="week-header">
      <span>Неделя закупа: ${weekLabel}</span>
      <span class="week-header-meta">
        ${weekDocs.length} заказов · ${weekTotal} шт
      </span>
    </div>
    <div class="table-header">
      <div>Фото</div>
      <div>TZ — MODEL</div>
      <div style="text-align:right">Кол-во</div>
      <div>Клиент</div>
      <div>Неделя план</div>
      <div>Дата план</div>
      <div>Дата факт</div>
      <div>Статус</div>
      <div>Цех</div>
      <div>Комментарий</div>
    </div>
    ${rowsHtml}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>План закупа</title>
  <style>
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
      align-items: flex-start;
      padding-bottom: 8px;
      margin-bottom: 12px;
      border-bottom: 2px solid #000;
    }
    .page-title { font-size:16px; font-weight:700; }
    .page-meta { font-size:10px; color:#555; margin-top:2px; }
    .week-header {
      background: #1a237e;
      color: #fff;
      padding: 7px 12px;
      margin: 10px 0 4px 0;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 2px;
    }
    .week-header-meta {
      font-size: 10px;
      font-weight: 400;
      opacity: 0.85;
    }
    .table-header {
      display: grid;
      grid-template-columns:
        44px 180px 70px 90px 80px 85px 80px 90px 120px 1fr;
      background: #e8eaf6;
      border: 1px solid #c5cae9;
      border-bottom: 2px solid #1a237e;
      padding: 4px 0;
      font-size: 9px;
      font-weight: 700;
      color: #1a237e;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .table-header > div {
      padding: 2px 6px;
      border-right: 0.5px solid #c5cae9;
    }
    .table-header > div:last-child { border-right: none; }
    .doc-row {
      display: grid;
      grid-template-columns:
        44px 180px 70px 90px 80px 85px 80px 90px 120px 1fr;
      border-bottom: 0.5px solid #ddd;
      min-height: 44px;
      align-items: center;
    }
    .doc-row:nth-child(even) { background: #f9f9f9; }
    .doc-row > div {
      padding: 4px 6px;
      border-right: 0.5px solid #eee;
      align-self: stretch;
      display: flex;
      align-items: center;
    }
    .doc-row > div:last-child { border-right: none; }
    .col-photo { justify-content: center; padding: 3px; }
    .col-name { flex-direction: column; gap: 1px; }
    .col-qty { justify-content: flex-end; font-weight:700; }
    .col-client { color: #1a237e; font-weight: 600; }
    .name-main { font-size:11px; font-weight:600; }
    .name-sub { font-size:9px; color:#999; }
    .status-badge {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
    }
    .status-pending {
      background: #ffebee; color: #c62828;
    }
    .status-in_progress {
      background: #fff8e1; color: #f57f17;
    }
    .status-done {
      background: #e8f5e9; color: #2e7d32;
    }
    .date-line {
      border-bottom: 1px solid #000;
      width: 65px;
      height: 13px;
      display: inline-block;
    }
    .signatures {
      display: flex;
      gap: 32px;
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
    }
    .sig-line {
      border-bottom: 1px solid #000;
      height: 18px;
      margin-bottom: 3px;
    }
    .sig-label { font-size: 9px; color: #666; }
    @media print {
      body { padding: 5mm; }
      @page { margin: 8mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="page-title">ПЛАН ЗАКУПА</div>
      <div class="page-meta">${printDate} · Заказов: ${fullDocs.length}</div>
    </div>
    <div style="font-size:18px;font-weight:700;color:#1a237e">ERDEN</div>
  </div>
  ${weeksHtml}
  <div class="signatures">
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Менеджер по закупу</div>
    </div>
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Руководитель</div>
    </div>
    <div style="flex:1">
      <div class="sig-line"></div>
      <div class="sig-label">Дата</div>
    </div>
  </div>
</body>
</html>`;
}

const CHAIN_COLS = 11;

const CHAIN_TABLE_HEADERS = [
  { label: 'Фото' },
  { label: 'TZ — MODEL' },
  { label: 'Кол-во', thStyle: { minWidth: 80, textAlign: 'right' } },
  { label: 'Клиент' },
  { label: 'Неделя план' },
  { label: 'Дата план' },
  { label: 'Дата факт' },
  { label: 'Статус' },
  { label: 'Цех' },
  { label: 'Комментарий' },
  { label: 'Печать' },
];

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

export default function Procurement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEditProcurement = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [chainDocs, setChainDocs] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainBanner, setChainBanner] = useState(null);
  const [chainDateFrom, setChainDateFrom] = useState(initialChainDateFrom);
  const [chainDateTo, setChainDateTo] = useState(initialChainDateTo);
  const [chainFilterStatus, setChainFilterStatus] = useState('all');
  const [chainFilterSection, setChainFilterSection] = useState('all');
  const [chainWorkshops, setChainWorkshops] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    api.workshops
      .list()
      .then((data) => setChainWorkshops(Array.isArray(data) ? data : []))
      .catch(() => setChainWorkshops(CHAIN_WORKSHOPS_FALLBACK));
  }, []);

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
    api.purchase
      .documentsList()
      .then((data) => setChainDocs(Array.isArray(data) ? data : []))
      .catch(() => setChainDocs([]))
      .finally(() => setChainLoading(false));
  }, []);

  useEffect(() => {
    loadChainDocs();
  }, [loadChainDocs]);

  const filteredChainDocs = useMemo(() => {
    return chainDocs.filter((doc) => {
      const ws = chainDateIso(doc.week_start);
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
      if (!docMatchesChainSectionFilter(doc, chainFilterSection, chainWorkshops)) return false;
      return true;
    });
  }, [chainDocs, chainDateFrom, chainDateTo, chainFilterStatus, chainFilterSection, chainWorkshops]);

  /** Группировка по плановой неделе week_start */
  const purchaseDocsByPlanWeek = useMemo(() => {
    const map = new Map();
    for (const d of filteredChainDocs) {
      const k = chainDateIso(d.week_start) || '__none';
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

  const patchPurchaseChainDoc = useCallback(
    async (docId, body, { successMessage } = {}) => {
      if (!canEditProcurement) return;
      try {
        const updated = await api.purchase.documentPatch(docId, body);
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
    [canEditProcurement]
  );

  const saveActualDate = (docId, date) => {
    patchPurchaseChainDoc(docId, { actual_date: date || null });
  };

  const updateStatus = (docId, value) => {
    patchPurchaseChainDoc(docId, { status: value });
  };

  const changePlanWeek = (docId, dateStr) => {
    if (!dateStr || !canEditProcurement) return;
    const monday = getMonday(dateStr);
    patchPurchaseChainDoc(
      docId,
      { week_start: monday, actual_week_start: monday },
      { successMessage: `Неделя изменена на ${formatWeekRange(monday)}` }
    );
  };

  const updateSection = (docId, sectionId) => {
    patchPurchaseChainDoc(docId, {
      section_id: sectionId === '' ? null : sectionId,
    });
  };

  const effectiveSectionId = (doc) => effectiveChainSectionKey(doc);

  const saveComment = (docId, value) => {
    patchPurchaseChainDoc(docId, { comment: value || null });
  };

  const printChainDoc = async (orderId) => {
    try {
      const data = await api.orders.getProcurement(orderId);
      const prId = data?.procurement?.id;
      if (prId) navigate(`/print/procurement/${prId}`);
      else {
        setChainBanner({ type: 'err', text: 'Нет заявки закупа для печати' });
        window.setTimeout(() => setChainBanner(null), 3500);
      }
    } catch (e) {
      setChainBanner({ type: 'err', text: e?.message || 'Ошибка' });
      window.setTimeout(() => setChainBanner(null), 4000);
    }
  };

  const printAllPurchaseDocs = useCallback(async () => {
    const docs = filteredChainDocs;
    if (!docs.length) {
      setChainBanner({ type: 'err', text: 'Нет документов для печати по фильтрам' });
      window.setTimeout(() => setChainBanner(null), 3500);
      return;
    }
    setIsPrinting(true);
    try {
      const fullDocs = await Promise.all(
        docs.map(async (doc) => {
          const photoUrl = firstPhotoSrc(doc.Order);
          const photoBase64 = photoUrl ? await purchasePhotoUrlToDataUrl(photoUrl) : null;
          return {
            ...doc,
            Order: {
              ...(doc.Order || {}),
              ...(photoBase64 ? { photoBase64 } : {}),
            },
          };
        })
      );
      const html = buildPurchasePlanPrintHtml(fullDocs, chainWorkshops);
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
      setChainBanner({ type: 'err', text: e?.message || 'Не удалось подготовить печать' });
      window.setTimeout(() => setChainBanner(null), 4000);
    } finally {
      setIsPrinting(false);
    }
  }, [filteredChainDocs, chainWorkshops]);

  return (
    <div>
      <div className="no-print relative flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text">Закуп</h1>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => printAllPurchaseDocs()}
            disabled={isPrinting}
            className="no-print inline-flex items-center gap-1.5 px-[18px] py-2 rounded-md text-[13px] font-semibold text-white border-0 cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: '#1a237e' }}
          >
            {isPrinting ? '⏳ Подготовка...' : '🖨 Печать'}
          </button>
          <PrintButton />
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
              </div>
              <select
                value={chainFilterStatus}
                onChange={(e) => setChainFilterStatus(e.target.value)}
                style={CHAIN_FILTER_INPUT}
              >
                <option value="all">Все статусы</option>
                <option value="pending">Не начато</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Закуплено</option>
              </select>
              <select
                value={chainFilterSection}
                onChange={(e) => setChainFilterSection(e.target.value)}
                style={CHAIN_FILTER_INPUT}
              >
                <option value="all">Все цеха</option>
                {chainWorkshops.map((w) => (
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
            <div className="no-print overflow-x-auto rounded-lg border border-white/15 max-h-[min(70vh,calc(100vh-14rem))] overflow-y-auto">
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
                  {purchaseDocsByPlanWeek.map(([weekKey, docs]) => (
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
                          Неделя: {weekKey === '__none' ? '—' : formatWeekRange(weekKey)} — {docs.length}{' '}
                          заказов
                        </td>
                      </tr>
                      {docs.map((doc) => {
                        const o = doc.Order;
                        const photo = firstPhotoSrc(o);
                        const client = o?.Client?.name || '—';
                        const st = doc.status || 'pending';
                        const actualD = chainDateIso(doc.actual_date);
                        const weekS = chainDateIso(doc.week_start);
                        const origWeek = chainDateIso(doc.original_week_start);
                        const sectionVal = effectiveSectionId(doc);
                        const overdue = isOverdueActualDate(doc.week_start, doc.actual_date);
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
                              <div style={{ color: '#c8ff00', fontWeight: 500 }}>{orderTzModelLine(o)}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>#{doc.id}</div>
                            </td>
                            <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                {orderQuantityShown(o)}
                              </div>
                              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>шт</div>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#4a9eff', verticalAlign: 'top' }}>{client}</td>
                            <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 13, verticalAlign: 'top' }}>
                              {formatWeekRange(doc.week_start)}
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
                                  {formatWeekRange(doc.original_week_start)}
                                </div>
                              ) : null}
                              <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>
                                {formatWeekRange(doc.week_start)}
                              </div>
                              <input
                                type="date"
                                value={weekS}
                                disabled={!canEditProcurement}
                                title="Изменить неделю плана"
                                onChange={(e) => changePlanWeek(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: '0.5px solid #444',
                                  color: '#c8ff00',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: canEditProcurement ? 'pointer' : 'not-allowed',
                                  width: 150,
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <input
                                type="date"
                                value={actualD}
                                disabled={!canEditProcurement}
                                onChange={(e) => saveActualDate(doc.id, e.target.value)}
                                style={{
                                  background: 'transparent',
                                  border: '0.5px solid #333',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  cursor: canEditProcurement ? 'pointer' : 'not-allowed',
                                }}
                              />
                              {actualD ? (
                                <div style={{ fontSize: 11, color: '#c8ff00', marginTop: 2 }}>✓ {formatDate(actualD)}</div>
                              ) : null}
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <select
                                value={st}
                                disabled={!canEditProcurement}
                                onChange={(e) => updateStatus(doc.id, e.target.value)}
                                style={{
                                  background: '#1a1a1a',
                                  border: '0.5px solid #333',
                                  color: statusColor(st),
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                              >
                                <option value="pending">Не начато</option>
                                <option value="in_progress">В процессе</option>
                                <option value="done">Закуплено</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <select
                                value={sectionVal}
                                disabled={!canEditProcurement}
                                onChange={(e) => updateSection(doc.id, e.target.value)}
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
                                {chainWorkshops.map((w) => (
                                  <option key={w.id} value={String(w.id)}>
                                    {w.name}
                                  </option>
                                ))}
                                {sectionVal &&
                                !chainWorkshops.some((w) => String(w.id) === String(sectionVal)) ? (
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
                                disabled={!canEditProcurement}
                                onBlur={(e) => saveComment(doc.id, e.target.value)}
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
                            <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                              <button
                                type="button"
                                onClick={() => printChainDoc(doc.order_id)}
                                style={{
                                  color: '#4a9eff',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                }}
                              >
                                Печать закупа
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
    </div>
  );
}
