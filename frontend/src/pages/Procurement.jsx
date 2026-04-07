/**
 * Страница закупа — список заявок + завершение (куплено + цена)
 * План (материал + план) редактируется только в карточке заказа.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { NeonCard, NeonInput, NeonSelect } from '../components/ui';
import ProcurementCompleteModal from '../components/procurement/ProcurementCompleteModal';
import ModelPhoto from '../components/ModelPhoto';
import PrintButton from '../components/PrintButton';
import { MONTH_SHORT_RU, getMonday } from '../utils/cycleWeekLabels';
import {
  CHAIN_WORKSHOPS_FALLBACK,
  LEGACY_SECTION_LABELS,
  docMatchesChainSectionFilter,
  effectiveChainSectionKey,
  orderQuantityShown,
} from '../utils/planChainWorkshops';

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'sent', label: 'Отправлено' },
  { value: 'received', label: 'Закуплено' },
];

const STATUS_LABELS = { sent: 'Отправлено', received: 'Закуплено' };

const PROCUREMENT_FILTERS_KEY = 'procurement_filters';

function loadProcurementFilters() {
  try {
    const s = sessionStorage.getItem(PROCUREMENT_FILTERS_KEY);
    return s ? { ...JSON.parse(s) } : { q: '', status: '', date_from: '', date_to: '' };
  } catch {
    return { q: '', status: '', date_from: '', date_to: '' };
  }
}

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
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(loadProcurementFilters);
  const [selectedProcurementId, setSelectedProcurementId] = useState(null);
  const [listTab, setListTab] = useState('manual');
  const [chainDocs, setChainDocs] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainBanner, setChainBanner] = useState(null);
  const [chainDateFrom, setChainDateFrom] = useState(initialChainDateFrom);
  const [chainDateTo, setChainDateTo] = useState(initialChainDateTo);
  const [chainFilterStatus, setChainFilterStatus] = useState('all');
  const [chainFilterSection, setChainFilterSection] = useState('all');
  const [chainWorkshops, setChainWorkshops] = useState([]);

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

  const loadData = (nextFilters = filters) => {
    setLoading(true);
    api.procurement
      .list(nextFilters)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
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
    loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listTab === 'chain') loadChainDocs();
  }, [listTab, loadChainDocs]);

  useEffect(() => {
    try {
      sessionStorage.setItem(PROCUREMENT_FILTERS_KEY, JSON.stringify(filters));
    } catch (_) {}
  }, [filters]);

  const rows = useMemo(() => list || [], [list]);

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
  const getOrderName = (row) => {
    const tzCode = String(row?.tz_code || '').trim();
    const modelName = String(row?.model_name || '').trim();
    return (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || row?.title || tzCode || modelName || '—';
  };

  const handleRowClick = (pr) => {
    const pid = pr.procurement_id ?? pr.procurement?.id ?? pr.order_id;
    if (pid) setSelectedProcurementId(pid);
  };

  const handleModalClose = () => {
    setSelectedProcurementId(null);
    loadData(filters);
  };

  return (
    <div>
      <div className="no-print flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text">Закуп</h1>
        <PrintButton />
      </div>

      <div className="no-print flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setListTab('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            listTab === 'manual'
              ? 'border-primary-400/60 bg-primary-500/15 text-[#ECECEC]'
              : 'border-white/20 bg-transparent text-[#ECECEC]/70 hover:border-white/35'
          }`}
        >
          Ручные
        </button>
        <button
          type="button"
          onClick={() => setListTab('chain')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            listTab === 'chain'
              ? 'border-primary-400/60 bg-primary-500/15 text-[#ECECEC]'
              : 'border-white/20 bg-transparent text-[#ECECEC]/70 hover:border-white/35'
          }`}
        >
          Из плана цеха ✦
        </button>
      </div>

      {listTab === 'manual' ? (
      <NeonCard className="p-4 mb-4 flex flex-col md:flex-row flex-wrap gap-3 md:items-end">
        <div className="min-w-0 w-full md:min-w-[220px] md:flex-1">
          <label className="block text-sm text-[#ECECEC]/80 mb-1">Поиск</label>
          <NeonInput
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            placeholder="TZ / MODEL / клиент"
          />
        </div>
        <div className="w-full md:w-[180px]">
          <label className="block text-sm text-[#ECECEC]/80 mb-1">Статус</label>
          <NeonSelect
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value || 'all'} value={s.value}>
                {s.label}
              </option>
            ))}
          </NeonSelect>
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC]/80 mb-1">С даты</label>
          <NeonInput
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC]/80 mb-1">По дату</label>
          <NeonInput
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
          />
        </div>
        <button
          type="button"
          onClick={() => loadData(filters)}
          className="h-10 px-4 rounded-lg bg-accent-1/30 hover:bg-accent-1/40 text-[#ECECEC]"
        >
          Применить
        </button>
      </NeonCard>
      ) : null}

      {listTab === 'chain' ? (
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
      ) : loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : rows.length === 0 ? (
        <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет закупов</p>
      ) : (
        <NeonCard className="print-area rounded-card overflow-hidden overflow-x-auto p-0">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">TZ — MODEL</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дедлайн</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Сумма</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Обновлено</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 no-print">Печать</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pr) => (
                <tr
                  key={pr.order_id}
                  onClick={() => handleRowClick(pr)}
                  className="border-b border-white/15 hover:bg-accent-2/30 dark:hover:bg-dark-800 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <ModelPhoto
                      photo={pr.order_photos?.[0]}
                      modelName={getOrderName(pr)}
                      size={48}
                    />
                    <div className="text-xs text-[#ECECEC]/60 mt-0.5">#{pr.order_id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{pr.client_name || '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                    {formatDate(pr.procurement?.due_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        pr.procurement?.status === 'received'
                          ? 'bg-green-500/20 text-green-400'
                          : pr.procurement?.status === 'sent'
                            ? 'bg-lime-500/20 text-lime-400'
                            : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {STATUS_LABELS[pr.procurement?.status] || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-primary-400 text-right">
                    {Number(pr.procurement?.total_sum || 0).toFixed(2)} ₽
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 text-sm">
                    {pr.procurement?.updated_at ? formatDate(pr.procurement.updated_at.slice(0, 10)) : '—'}
                  </td>
                  <td className="px-4 py-3 no-print">
                    {pr.procurement?.status === 'received' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const pid = pr.procurement_id ?? pr.procurement?.id;
                          if (pid) navigate(`/print/procurement/${pid}`);
                        }}
                        className="text-primary-400 hover:text-primary-300 hover:underline text-sm"
                      >
                        Печать закупа
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </NeonCard>
      )}

      <ProcurementCompleteModal
        open={!!selectedProcurementId}
        procurementId={selectedProcurementId}
        onClose={handleModalClose}
        onSaved={handleModalClose}
        canEdit={canEditProcurement}
      />
    </div>
  );
}
