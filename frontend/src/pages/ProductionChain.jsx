/**
 * План цеха — цепочка закуп / раскрой / пошив
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { getMonday, MONTH_SHORT_RU } from '../utils/cycleWeekLabels';
import { normalizeUserRole } from '../utils/userRole';

const COL_LS = 'erden_pc_col_widths';
const DEFAULT_WIDTHS = { num: 36, art: 52, name: 200, client: 110, qty: 110, stage: 120 };

function localTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sequelize JSON: Order; при ручном JSON возможен ключ order. */
function chainRowOrder(row) {
  if (!row || typeof row !== 'object') return null;
  return row.Order ?? row.order ?? null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function orderClientLabel(order) {
  if (!order) return '—';
  const n = order.Client?.name || order.client_name || '';
  return String(n).trim() || '—';
}

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

function getOrderedQty(order) {
  if (!order) return 0;
  const q = order.total_quantity ?? order.quantity;
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}

function getCutFactFromOps(order) {
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

function getSewFact(order, sewingFactsByOrderId) {
  if (!order) return 0;
  const idKey = String(order.id);
  const raw = sewingFactsByOrderId?.[idKey] ?? sewingFactsByOrderId?.[Number(order.id)];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Дата этапа цепочки из API: YYYY-MM-DD или Date. */
function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function sundayIso(mondayIso) {
  const start = chainDateIso(mondayIso);
  if (!start) return '';
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Сегодня (календарный день) попадает в неделю пн–вс от weekStartMonday. */
function isoInCalendarWeek(dayIso, weekStartMondayIso) {
  const d = chainDateIso(dayIso);
  const wkStart = chainDateIso(weekStartMondayIso);
  if (!d || !wkStart) return false;
  const wkEnd = sundayIso(wkStart);
  return d >= wkStart && d <= wkEnd;
}

function sectionGroup(sectionId) {
  if (/^floor_[234]$/.test(sectionId)) return 'main';
  if (sectionId === 'aksy') return 'aksy';
  if (sectionId === 'outsource') return 'outsource';
  return 'other';
}

function badgeMeta(mondayIso, status, todayMonday) {
  const m = chainDateIso(mondayIso);
  const future = m > chainDateIso(todayMonday);
  if (future) {
    return { label: 'Запланировано', bg: 'rgba(148,163,184,0.25)', color: '#94a3b8' };
  }
  if (status === 'done') {
    return { label: 'Завершено', bg: 'rgba(34,197,94,0.25)', color: '#4ade80' };
  }
  if (status === 'in_progress') {
    return { label: 'В процессе', bg: 'rgba(245,158,11,0.25)', color: '#fbbf24' };
  }
  return { label: 'Не начато', bg: 'rgba(239,68,68,0.25)', color: '#f87171' };
}

function rowMatchesStatusFilter(row, filter) {
  if (filter === 'all') return true;
  const sts = [row.purchase_status, row.cutting_status, row.sewing_status];
  if (filter === 'done') return sts.every((s) => s === 'done');
  if (filter === 'in_progress') return sts.some((s) => s === 'in_progress');
  if (filter === 'pending') return sts.some((s) => s === 'pending');
  return true;
}

/** Пн–вс недели этапа: «23–29 мар» или «30 мар – 5 апр» (локальный календарь). */
function formatChainWeekRange(dateStr) {
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

function sewingWeekStartsInMonth(row, monthFirst) {
  const s = chainDateIso(row.sewing_week_start);
  if (!s) return false;
  const d = new Date(`${s}T12:00:00`);
  return d.getFullYear() === monthFirst.getFullYear() && d.getMonth() === monthFirst.getMonth();
}

function chainBadgeClassName(mondayIso, status, todayMonday) {
  const m = chainDateIso(mondayIso);
  const t = chainDateIso(todayMonday);
  const future = m && t && m > t;
  if (future && status === 'pending') return 'pc-chain-badge pc-status-future';
  if (status === 'done') return 'pc-chain-badge pc-status-done';
  if (status === 'in_progress') return 'pc-chain-badge pc-status-in_progress';
  return 'pc-chain-badge pc-status-pending';
}

export default function ProductionChain() {
  const { user } = useAuth();
  const role = normalizeUserRole(user?.role);
  const allowed = ['admin', 'manager', 'technologist'].includes(role);
  const canPatch = allowed;

  const todayIso = localTodayIso();
  const todayMonday = getMonday(todayIso);

  const [navMonth, setNavMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workshopFilter, setWorkshopFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sewingFactsByOrderId, setSewingFactsByOrderId] = useState({});
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS);
  const [dropdown, setDropdown] = useState(null);
  const resizeRef = useRef({ active: false, key: null, startX: 0, startW: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_LS);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          setColWidths((prev) => ({ ...prev, ...p }));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistWidths = useCallback((w) => {
    try {
      localStorage.setItem(COL_LS, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (import.meta.env.DEV) console.log('[ProductionChain] загрузка...');
    try {
      const [list, sew] = await Promise.all([
        api.planning.chainList(),
        api.sewing.factsByOrder().catch(() => ({})),
      ]);
      const arr = Array.isArray(list) ? list : [];
      if (import.meta.env.DEV) {
        console.log('[ProductionChain] данные:', list);
        console.log('[ProductionChain] всего записей:', arr.length);
        console.log('[ProductionChain] первая:', arr[0]);
        if (arr.length > 0) {
          console.log(
            '[ProductionChain] даты пошива:',
            arr.map((r) => chainDateIso(r.sewing_week_start))
          );
        }
      }
      setRows(arr);
      setSewingFactsByOrderId(sew && typeof sew === 'object' ? sew : {});
    } catch (err) {
      console.error('[ProductionChain] ошибка:', err?.status ?? '', err?.message ?? err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const monthNavLabel = useMemo(
    () =>
      navMonth.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      }),
    [navMonth]
  );

  const rowsWithSewingInNavMonth = useMemo(
    () => rows.filter((r) => sewingWeekStartsInMonth(r, navMonth)),
    [rows, navMonth]
  );

  const clientsInData = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const o = chainRowOrder(r);
      const id = o?.client_id ?? o?.Client?.id;
      const name = o?.Client?.name || '';
      if (id != null) m.set(Number(id), String(name || `Клиент ${id}`));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rowsWithSewingInNavMonth.filter((r) => {
      if (workshopFilter !== 'all' && sectionGroup(r.section_id) !== workshopFilter) return false;
      if (clientFilter !== 'all' && Number(chainRowOrder(r)?.client_id) !== Number(clientFilter))
        return false;
      if (statusFilter !== 'all' && !rowMatchesStatusFilter(r, statusFilter)) return false;
      return true;
    });
  }, [rowsWithSewingInNavMonth, workshopFilter, clientFilter, statusFilter]);

  /** 13 недель: −4 … +8 от текущего понедельника (локальный календарь). */
  const selectableWeeks = useMemo(() => {
    const today = new Date();
    const c = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const day = c.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    c.setDate(c.getDate() + diff);
    const weeks = [];
    for (let i = -4; i <= 8; i++) {
      const d = new Date(c);
      d.setDate(c.getDate() + i * 7);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      weeks.push({ start, label: formatChainWeekRange(start) });
    }
    return weeks;
  }, []);

  const summary = useMemo(() => {
    let buy = 0;
    let cut = 0;
    let sew = 0;
    for (const r of rows) {
      if (
        r.purchase_status === 'pending' &&
        chainDateIso(r.purchase_week_start) &&
        isoInCalendarWeek(todayIso, r.purchase_week_start)
      ) {
        buy++;
      }
      if (
        r.cutting_status === 'pending' &&
        chainDateIso(r.cutting_week_start) &&
        isoInCalendarWeek(todayIso, r.cutting_week_start)
      ) {
        cut++;
      }
      if (
        r.sewing_status === 'pending' &&
        chainDateIso(r.sewing_week_start) &&
        isoInCalendarWeek(todayIso, r.sewing_week_start)
      ) {
        sew++;
      }
    }
    return { buy, cut, sew, show: buy + cut + sew > 0 };
  }, [rows, todayIso]);

  const moveDocWeek = useCallback(async (docType, docId, chainRowId, newIso) => {
    if (!docId || !newIso) return;
    if (import.meta.env.DEV) console.log('[Move]', docType, docId, chainRowId, newIso);
    try {
      const updated =
        docType === 'purchase'
          ? await api.purchase.documentPatch(docId, { actual_week_start: newIso })
          : await api.cutting.documentPatch(docId, { actual_week_start: newIso });
      const key = docType === 'purchase' ? 'purchase_doc' : 'cutting_doc';
      const nid = Number(chainRowId);
      setRows((prev) =>
        prev.map((x) =>
          Number(x.id) === nid ? { ...x, [key]: { ...(x[key] || {}), ...updated } } : x
        )
      );
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Move] ошибка:', e?.message || e);
      alert(e?.message || 'Не удалось перенести');
    }
  }, []);

  const patchStatus = useCallback(async (chainRowId, field, value, opts = {}) => {
    const { docId, docType } = opts;
    if (import.meta.env.DEV) console.log('[Status]', chainRowId, field, value, opts);
    try {
      const nid = Number(chainRowId);
      if (docId && docType === 'purchase') {
        const updated = await api.purchase.documentPatch(docId, { status: value });
        setRows((prev) =>
          prev.map((x) =>
            Number(x.id) === nid ? { ...x, purchase_doc: { ...(x.purchase_doc || {}), ...updated } } : x
          )
        );
      } else if (docId && docType === 'cutting') {
        const updated = await api.cutting.documentPatch(docId, { status: value });
        setRows((prev) =>
          prev.map((x) =>
            Number(x.id) === nid ? { ...x, cutting_doc: { ...(x.cutting_doc || {}), ...updated } } : x
          )
        );
      } else {
        const updated = await api.planning.chainPatch(chainRowId, { [field]: value });
        if (import.meta.env.DEV) console.log('[Status] chain:', updated);
        setRows((prev) =>
          prev.map((x) => {
            if (Number(x.id) !== nid) return x;
            return {
              ...x,
              ...updated,
              Order: chainRowOrder(updated) ?? chainRowOrder(x),
              purchase_status: updated?.purchase_status ?? x.purchase_status,
              cutting_status: updated?.cutting_status ?? x.cutting_status,
              sewing_status: updated?.sewing_status ?? x.sewing_status,
              purchase_doc: updated?.purchase_doc ?? x.purchase_doc,
              cutting_doc: updated?.cutting_doc ?? x.cutting_doc,
            };
          })
        );
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Status] ошибка:', e?.message || e);
      alert(e?.message || 'Ошибка');
    }
    setDropdown(null);
  }, []);

  const startResize = (e, key) => {
    e.preventDefault();
    resizeRef.current = { active: true, key, startX: e.clientX, startW: colWidths[key] };
    const onMove = (ev) => {
      if (!resizeRef.current.active) return;
      const { key: k, startX, startW } = resizeRef.current;
      const nw = Math.max(40, startW + (ev.clientX - startX));
      setColWidths((prev) => {
        const next = { ...prev, [k]: nw };
        persistWidths(next);
        return next;
      });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const rowNeedsUrgentOutline = (row) => {
    const triple = [
      ['purchase_week_start', 'purchase_status'],
      ['cutting_week_start', 'cutting_status'],
      ['sewing_week_start', 'sewing_status'],
    ];
    return triple.some(([wk, sk]) => {
      if (row[sk] !== 'pending') return false;
      const m = chainDateIso(row[wk]);
      if (!m) return false;
      return isoInCalendarWeek(todayIso, m);
    });
  };

  if (!allowed) return <Navigate to="/" replace />;

  const prevMonth = () =>
    setNavMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () =>
    setNavMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <style>{`
        .pc-chain-cell { vertical-align: top; }
        .pc-chain-week { text-align: center; font-size: 10px; color: var(--muted, #94a3b8); line-height: 1.25; }
        .pc-chain-badge {
          display: inline-block; width: 100%; box-sizing: border-box; margin-top: 4px;
          padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
          border: none; text-align: center; cursor: pointer;
        }
        .pc-chain-badge:disabled { cursor: default; opacity: 0.7; }
        .pc-status-pending { background: rgba(255,68,68,0.2); color: #ff6b6b; }
        .pc-status-in_progress { background: rgba(245,158,11,0.2); color: #f59e0b; }
        .pc-status-done { background: rgba(200,255,0,0.2); color: #c8ff00; }
        .pc-status-future { background: rgba(255,255,255,0.08); color: #94a3b8; }
        .pc-week-select {
          width: 100%; margin-top: 3px; font-size: 10px; border-radius: 6px;
          background: var(--bg2, #1a1d24); color: var(--text, #ececec);
          border: 1px solid var(--border, #333); padding: 2px 4px;
        }
        .pc-mini-label { font-size: 9px; color: var(--muted, #94a3b8); }
      `}</style>
      <h1 className="text-xl font-bold md:text-2xl" style={{ color: 'var(--text, #ECECEC)' }}>
        План цеха
      </h1>

      {summary.show ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            background: 'rgba(245,158,11,0.15)',
            borderColor: 'rgba(245,158,11,0.4)',
            color: 'var(--text)',
          }}
        >
          <div className="font-semibold text-amber-200">⚠️ На этой неделе:</div>
          <div>
            Закупить: {summary.buy} заказ{summary.buy === 1 ? '' : summary.buy < 5 ? 'а' : 'ов'} | Раскроить:{' '}
            {summary.cut} заказ{summary.cut === 1 ? '' : summary.cut < 5 ? 'а' : 'ов'}
          </div>
          <div>Запустить пошив: {summary.sew} заказ{summary.sew === 1 ? '' : summary.sew < 5 ? 'а' : 'ов'}</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          onClick={prevMonth}
        >
          ← Предыдущий месяц
        </button>
        <span className="px-2 text-sm font-medium capitalize" style={{ color: '#c8ff00' }}>
          {monthNavLabel}
        </span>
        <button
          type="button"
          className="rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          onClick={nextMonth}
        >
          Следующий месяц →
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: 'var(--muted)' }}>Цех:</span>
        {[
          ['all', 'Все'],
          ['main', 'Наш цех'],
          ['aksy', 'Аксы'],
          ['outsource', 'Аутсорс'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className="rounded-full border px-2 py-1"
            style={{
              borderColor: workshopFilter === v ? '#c8ff00' : 'var(--border)',
              color: workshopFilter === v ? '#c8ff00' : 'var(--text)',
            }}
            onClick={() => setWorkshopFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: 'var(--muted)' }}>Заказчик:</span>
        <button
          type="button"
          className="rounded-full border px-2 py-1"
          style={{
            borderColor: clientFilter === 'all' ? '#c8ff00' : 'var(--border)',
            color: clientFilter === 'all' ? '#c8ff00' : 'var(--text)',
          }}
          onClick={() => setClientFilter('all')}
        >
          Все
        </button>
        {clientsInData.map(([id, name]) => (
          <button
            key={id}
            type="button"
            className="rounded-full border px-2 py-1 max-w-[140px] truncate"
            style={{
              borderColor: Number(clientFilter) === id ? '#c8ff00' : 'var(--border)',
              color: Number(clientFilter) === id ? '#c8ff00' : 'var(--text)',
            }}
            onClick={() => setClientFilter(id)}
            title={name}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: 'var(--muted)' }}>Статус:</span>
        {[
          ['all', 'Все'],
          ['pending', 'Не начато'],
          ['in_progress', 'В процессе'],
          ['done', 'Завершено'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className="rounded-full border px-2 py-1"
            style={{
              borderColor: statusFilter === v ? '#c8ff00' : 'var(--border)',
              color: statusFilter === v ? '#c8ff00' : 'var(--text)',
            }}
            onClick={() => setStatusFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>

      <div
        className="planning-draft-scroll min-h-0 flex-1 overflow-auto rounded-lg border"
        style={{ borderColor: 'var(--border)', maxHeight: 'calc(100vh - 280px)' }}
      >
        {loading ? (
          <p className="p-4" style={{ color: 'var(--muted)' }}>
            Загрузка…
          </p>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', color: 'var(--text)' }}>
            <thead
              className="sticky top-0 z-20"
              style={{ background: 'var(--bg2)', boxShadow: '0 1px 0 var(--border)' }}
            >
              <tr>
                {[
                  ['num', '№'],
                  ['art', 'Фото'],
                  ['name', 'Наименование ГП'],
                  ['client', 'Заказчик'],
                  ['qty', 'Кол-во'],
                ].map(([k, lab]) => (
                  <th
                    key={k}
                    className="relative border px-1 py-2 text-left font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      width: colWidths[k],
                      minWidth: colWidths[k],
                    }}
                  >
                    {lab}
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#c8ff00]/40"
                      onMouseDown={(e) => startResize(e, k)}
                      role="separator"
                      aria-hidden
                    />
                  </th>
                ))}
                {['Закуп', 'Раскрой', 'Пошив'].map((title, si) => (
                  <th
                    key={title}
                    colSpan={1}
                    className="relative border px-1 py-2 text-center font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      width: colWidths.stage * 2,
                      minWidth: colWidths.stage * 2,
                    }}
                  >
                    {title}
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#c8ff00]/40"
                      onMouseDown={(e) => startResize(e, 'stage')}
                      role="separator"
                      aria-hidden
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4" style={{ color: 'var(--muted)' }}>
                    {rows.length === 0
                      ? 'Нет записей в цепочке — сформируйте план в «Планирование месяц»'
                      : rowsWithSewingInNavMonth.length === 0
                        ? 'Нет записей с пошивом в выбранном месяце — переключите месяц стрелками'
                        : 'Нет записей по выбранным фильтрам'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const o = chainRowOrder(row);
                  const cut = getCutFactFromOps(o);
                  const sew = getSewFact(o, sewingFactsByOrderId);
                  const ordered = getOrderedQty(o);
                  const remainder = cut != null ? cut - sew : null;
                  const urgent = rowNeedsUrgentOutline(row);
                  const img = orderModelImageSrc(o);
                  return (
                    <tr
                      key={row.id}
                      style={{
                        border: urgent ? '1px solid #ff4444' : undefined,
                        outline: urgent ? 'none' : undefined,
                      }}
                    >
                      <td className="border px-1 py-1" style={{ borderColor: 'var(--border)' }}>
                        {idx + 1}
                      </td>
                      <td className="border p-0" style={{ borderColor: 'var(--border)' }}>
                        <div className="group relative flex justify-center p-0.5">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              className="h-10 w-10 rounded object-cover transition-transform group-hover:scale-[2.5] group-hover:z-30"
                            />
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td className="border px-1 py-1 truncate" style={{ borderColor: 'var(--border)' }} title={orderDisplayName(o)}>
                        {orderDisplayName(o)}
                      </td>
                      <td className="border px-1 py-1 truncate" style={{ borderColor: 'var(--border)' }}>
                        {orderClientLabel(o)}
                      </td>
                      <td className="border px-0.5 py-1 text-center" style={{ borderColor: 'var(--border)' }}>
                        <div className="grid grid-cols-2 gap-0.5 text-[10px] leading-tight">
                          <span style={{ color: 'var(--muted)' }}>Зак</span>
                          <span>{ordered || '—'}</span>
                          <span style={{ color: 'var(--muted)' }}>Рас</span>
                          <span>{cut != null ? cut : '—'}</span>
                          <span style={{ color: 'var(--muted)' }}>Пош</span>
                          <span>{sew}</span>
                          <span style={{ color: 'var(--muted)' }}>Ост</span>
                          <span>{remainder != null ? remainder : '—'}</span>
                        </div>
                      </td>
                      {(() => {
                        const pd = row.purchase_doc;
                        const planP = chainDateIso(row.purchase_week_start);
                        const actP = chainDateIso(pd?.actual_week_start) || planP;
                        const movedP = !!(pd && planP && actP && planP !== actP);
                        const stP = pd?.status ?? row.purchase_status;
                        const metaP = badgeMeta(planP, stP, todayMonday);
                        const badgeP = chainBadgeClassName(planP, stP, todayMonday);
                        const cd = row.cutting_doc;
                        const planC = chainDateIso(row.cutting_week_start);
                        const actC = chainDateIso(cd?.actual_week_start) || planC;
                        const movedC = !!(cd && planC && actC && planC !== actC);
                        const stC = cd?.status ?? row.cutting_status;
                        const metaC = badgeMeta(planC, stC, todayMonday);
                        const badgeC = chainBadgeClassName(planC, stC, todayMonday);
                        const monS = chainDateIso(row.sewing_week_start);
                        const stS = row.sewing_status;
                        const metaS = badgeMeta(monS, stS, todayMonday);
                        const badgeS = chainBadgeClassName(monS, stS, todayMonday);
                        return (
                          <>
                            <td
                              className="pc-chain-cell border px-1 py-1"
                              style={{ borderColor: 'var(--border)', width: colWidths.stage * 2 }}
                            >
                              <div className="pc-mini-label">План:</div>
                              <div
                                className="pc-chain-week"
                                style={
                                  movedP
                                    ? { textDecoration: 'line-through', color: '#64748b' }
                                    : undefined
                                }
                              >
                                {planP ? formatChainWeekRange(planP) : '—'}
                              </div>
                              {pd ? (
                                <>
                                  <div className="pc-mini-label mt-0.5">Факт:</div>
                                  <select
                                    className="pc-week-select"
                                    value={actP}
                                    disabled={!canPatch}
                                    onChange={(e) =>
                                      moveDocWeek('purchase', pd.id, row.id, e.target.value)
                                    }
                                  >
                                    {selectableWeeks.map((w) => (
                                      <option key={w.start} value={w.start}>
                                        {w.label}
                                      </option>
                                    ))}
                                  </select>
                                  {movedP ? (
                                    <div className="mt-0.5 text-[10px]" style={{ color: '#f59e0b' }}>
                                      ↗ {formatChainWeekRange(actP)}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              <button
                                type="button"
                                disabled={!canPatch}
                                className={badgeP}
                                onClick={(e) => {
                                  if (!canPatch) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDropdown({
                                    chainRowId: row.id,
                                    field: 'purchase_status',
                                    current: stP,
                                    docId: pd?.id ?? null,
                                    docType: pd ? 'purchase' : null,
                                    left: rect.left,
                                    top: rect.bottom + 4,
                                  });
                                }}
                              >
                                {metaP.label}
                              </button>
                            </td>
                            <td
                              className="pc-chain-cell border px-1 py-1"
                              style={{ borderColor: 'var(--border)', width: colWidths.stage * 2 }}
                            >
                              <div className="pc-mini-label">План:</div>
                              <div
                                className="pc-chain-week"
                                style={
                                  movedC
                                    ? { textDecoration: 'line-through', color: '#64748b' }
                                    : undefined
                                }
                              >
                                {planC ? formatChainWeekRange(planC) : '—'}
                              </div>
                              {cd ? (
                                <>
                                  <div className="pc-mini-label mt-0.5">Факт:</div>
                                  <select
                                    className="pc-week-select"
                                    value={actC}
                                    disabled={!canPatch}
                                    onChange={(e) =>
                                      moveDocWeek('cutting', cd.id, row.id, e.target.value)
                                    }
                                  >
                                    {selectableWeeks.map((w) => (
                                      <option key={w.start} value={w.start}>
                                        {w.label}
                                      </option>
                                    ))}
                                  </select>
                                  {movedC ? (
                                    <div className="mt-0.5 text-[10px]" style={{ color: '#f59e0b' }}>
                                      ↗ {formatChainWeekRange(actC)}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              <button
                                type="button"
                                disabled={!canPatch}
                                className={badgeC}
                                onClick={(e) => {
                                  if (!canPatch) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDropdown({
                                    chainRowId: row.id,
                                    field: 'cutting_status',
                                    current: stC,
                                    docId: cd?.id ?? null,
                                    docType: cd ? 'cutting' : null,
                                    left: rect.left,
                                    top: rect.bottom + 4,
                                  });
                                }}
                              >
                                {metaC.label}
                              </button>
                            </td>
                            <td
                              className="pc-chain-cell border px-1 py-1"
                              style={{ borderColor: 'var(--border)', width: colWidths.stage * 2 }}
                            >
                              <div className="pc-chain-week">{monS ? formatChainWeekRange(monS) : '—'}</div>
                              <button
                                type="button"
                                disabled={!canPatch}
                                className={badgeS}
                                onClick={(e) => {
                                  if (!canPatch) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDropdown({
                                    chainRowId: row.id,
                                    field: 'sewing_status',
                                    current: stS,
                                    docId: null,
                                    docType: null,
                                    left: rect.left,
                                    top: rect.bottom + 4,
                                  });
                                }}
                              >
                                {metaS.label}
                              </button>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {dropdown &&
        canPatch &&
        createPortal(
          <div
            className="fixed z-[3000] min-w-[160px] rounded-lg border py-1 shadow-xl"
            style={{
              left: dropdown.left,
              top: dropdown.top,
              background: 'var(--bg2)',
              borderColor: 'var(--border)',
            }}
          >
            {[
              ['pending', 'Не начато'],
              ['in_progress', 'В процессе'],
              ['done', 'Завершено'],
            ].map(([v, lab]) => (
              <button
                key={v}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/10"
                style={{ color: dropdown.current === v ? '#c8ff00' : 'var(--text)' }}
                onClick={() =>
                  patchStatus(dropdown.chainRowId, dropdown.field, v, {
                    docId: dropdown.docId,
                    docType: dropdown.docType,
                  })
                }
              >
                {dropdown.current === v ? '✓ ' : ''}
                {lab}
              </button>
            ))}
            <button
              type="button"
              className="block w-full border-t px-3 py-1.5 text-left text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              onClick={() => setDropdown(null)}
            >
              Закрыть
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
