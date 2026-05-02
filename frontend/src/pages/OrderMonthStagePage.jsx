/**
 * Общая страница этапа по месяцу — таблица и фильтры как на странице Раскрой (Cutting.jsx).
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatWeekRangeLabel } from '../components/planChain/PlanChainDocumentCard';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { useAuth } from '../context/AuthContext';
import { getMonday } from '../utils/cycleWeekLabels';

const LS_PD_MONTH = 'erden_pd_month';

const CHAIN_FILTER_INPUT = {
  background: '#1a1a1a',
  border: '0.5px solid #444',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
};

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Не начато' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'done', label: 'Выполнено' },
];

function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function firstPhotoSrc(order) {
  const p = order?.photos;
  if (!Array.isArray(p) || !p.length) return null;
  const x = p[0];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

/** Понедельник «опорной» недели для фильтра и группировки */
function anchorMondayIso(row, monthKey) {
  const o = row.order || {};
  const d = chainDateIso(o.deadline);
  if (d) return getMonday(d);
  const pm = o.planned_month;
  if (pm && /^\d{4}-\d{2}$/.test(String(pm))) return getMonday(`${String(pm).slice(0, 7)}-01`);
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) return getMonday(`${monthKey}-15`);
  return '';
}

function statusColorStage(st) {
  if (st === 'done') return '#c8ff00';
  if (st === 'in_progress') return '#f59e0b';
  return '#888';
}

function readSavedMonth() {
  try {
    const m = localStorage.getItem(LS_PD_MONTH);
    if (m && /^\d{4}-\d{2}$/.test(String(m).trim())) return String(m).trim().slice(0, 7);
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 7);
}

function lsDatesKey(stage, monthKey, orderId) {
  return `erden_stage_ui_dates_${stage}_${monthKey}_${orderId}`;
}

function readLsDates(stage, monthKey, orderId) {
  try {
    const raw = localStorage.getItem(lsDatesKey(stage, monthKey, orderId));
    if (!raw) return { plan_date: '', fact_date: '' };
    const j = JSON.parse(raw);
    return { plan_date: j.plan_date || '', fact_date: j.fact_date || '' };
  } catch {
    return { plan_date: '', fact_date: '' };
  }
}

function writeLsDates(stage, monthKey, orderId, patch) {
  try {
    const cur = readLsDates(stage, monthKey, orderId);
    const next = { ...cur, ...patch };
    localStorage.setItem(lsDatesKey(stage, monthKey, orderId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function OrderMonthStagePage({ title, stage }) {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager', 'technologist'].includes(user?.role);
  const apiStage = useMemo(() => (stage === 'proverka' ? api.proverka : api.dekatirovka), [stage]);

  const [monthKey, setMonthKey] = useState(readSavedMonth);
  const [chainDateFrom, setChainDateFrom] = useState('');
  const [chainDateTo, setChainDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkshop, setFilterWorkshop] = useState('all');
  const [workshops, setWorkshops] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const loadCancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.workshops
      .list(true)
      .then((list) => {
        if (!cancelled) setWorkshops(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setWorkshops([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiStage.list({ month_key: monthKey });
      if (loadCancelledRef.current) return;
      const list = res?.rows || [];
      setRows(list);
      const nextDrafts = {};
      for (const r of list) {
        const id = r.order?.id;
        if (!id) continue;
        const ls = readLsDates(stage, monthKey, id);
        const defPlan =
          ls.plan_date ||
          (r.order?.deadline ? chainDateIso(r.order.deadline) : '') ||
          (monthKey ? `${monthKey}-15` : '');
        nextDrafts[id] = {
          actual_qty: r.actual_qty ?? 0,
          status: r.status || 'not_started',
          note: r.note || '',
          plan_date: defPlan,
          fact_date: ls.fact_date || '',
        };
      }
      setDrafts(nextDrafts);
    } catch (e) {
      if (!loadCancelledRef.current) {
        setError(e?.message || 'Ошибка загрузки');
        setRows([]);
      }
    } finally {
      if (!loadCancelledRef.current) setLoading(false);
    }
  }, [apiStage, monthKey, stage]);

  useEffect(() => {
    loadCancelledRef.current = false;
    loadRows();
    return () => {
      loadCancelledRef.current = true;
    };
  }, [loadRows]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PD_MONTH, monthKey);
    } catch {
      /* ignore */
    }
  }, [monthKey]);

  const setQuickRange = useCallback((range) => {
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
      setMonthKey(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      );
    }
    if (range === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setChainDateFrom(first.toISOString().split('T')[0]);
      setChainDateTo(last.toISOString().split('T')[0]);
      setMonthKey(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      );
    }
    if (range === 'next_month') {
      const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      setChainDateFrom(first.toISOString().split('T')[0]);
      setChainDateTo(last.toISOString().split('T')[0]);
      setMonthKey(
        `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
      );
    }
  }, []);

  const updateDraft = useCallback((orderId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], ...patch },
    }));
  }, []);

  const updateDraftAndLs = useCallback(
    (orderId, patch) => {
      updateDraft(orderId, patch);
      if (patch.plan_date !== undefined || patch.fact_date !== undefined) {
        writeLsDates(stage, monthKey, orderId, {
          ...(patch.plan_date !== undefined ? { plan_date: patch.plan_date } : {}),
          ...(patch.fact_date !== undefined ? { fact_date: patch.fact_date } : {}),
        });
      }
    },
    [monthKey, stage, updateDraft]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const ws = anchorMondayIso(row, monthKey);
      if (chainDateFrom) {
        if (!ws) return false;
        if (ws < chainDateFrom) return false;
      }
      if (chainDateTo) {
        if (!ws) return false;
        if (ws > chainDateTo) return false;
      }
      const oid = row.order?.id;
      const st = (oid && drafts[oid]?.status) || row.status || 'not_started';
      if (filterStatus !== 'all' && st !== filterStatus) return false;
      if (filterWorkshop !== 'all') {
        const wid = row.order?.workshop_id;
        if (String(wid ?? '') !== filterWorkshop) return false;
      }
      return true;
    });
  }, [rows, chainDateFrom, chainDateTo, filterStatus, filterWorkshop, monthKey, drafts]);

  const rowsByPlanWeek = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const wk = anchorMondayIso(r, monthKey) || '__none';
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(r);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '__none') return 1;
      if (b === '__none') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => [k, map.get(k)]);
  }, [filteredRows, monthKey]);

  const saveRow = useCallback(
    async (row) => {
      const oid = row.order?.id;
      if (!oid) return;
      const d = drafts[oid];
      if (!d) return;
      setSavingId(oid);
      setError('');
      try {
        const body = {
          order_id: oid,
          month_key: monthKey,
          actual_qty: Math.max(0, parseInt(d.actual_qty, 10) || 0),
          status: d.status || 'not_started',
          note: d.note || '',
        };
        if (row.fact_id) {
          await apiStage.update(row.fact_id, {
            actual_qty: body.actual_qty,
            status: body.status,
            note: body.note,
          });
        } else {
          await apiStage.create(body);
        }
        await loadRows();
      } catch (e) {
        setError(e?.message || 'Ошибка сохранения');
      } finally {
        setSavingId(null);
      }
    },
    [drafts, monthKey, apiStage, loadRows]
  );

  const TABLE_COLS = 8;

  return (
    <div>
      <div className="no-print relative flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6 pr-0">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#ECECEC] dark:text-dark-text">
          {title}
        </h1>
        <PrintButton />
      </div>

      {!loading ? (
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
            <span style={{ fontSize: 13, color: '#888' }}>Месяц данных:</span>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              style={CHAIN_FILTER_INPUT}
            />
          </div>
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
              onClick={() => setQuickRange('week')}
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
              onClick={() => setQuickRange('month')}
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
              onClick={() => setQuickRange('next_month')}
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
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={CHAIN_FILTER_INPUT}
          >
            <option value="all">Все статусы</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterWorkshop}
            onChange={(e) => setFilterWorkshop(e.target.value)}
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
            Показано: {filteredRows.length} заказов
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[#ECECEC]/80 dark:text-dark-text/80">
          Нет заказов за выбранный месяц или по фильтрам.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="text-[#ECECEC]/80 dark:text-dark-text/80">Нет заказов по выбранным фильтрам.</p>
      ) : (
        <div className="no-print overflow-x-auto rounded-lg border border-white/15 max-h-[min(70vh,calc(100vh-14rem))] overflow-y-auto mb-6">
          <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse' }}>
            <thead
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#1a237e',
              }}
            >
              <tr style={{ color: '#fff' }}>
                {[
                  'Фото',
                  'ТЗ — MODEL',
                  'Кол-во',
                  'Клиент',
                  'Неделя план',
                  'Дата план',
                  'Дата факт',
                  'Статус',
                ].map((lab) => (
                  <th
                    key={lab}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {lab}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsByPlanWeek.map(([weekKey, group]) => (
                <Fragment key={weekKey}>
                  <tr style={{ background: '#1a1a24' }}>
                    <td
                      colSpan={TABLE_COLS}
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#94a3b8',
                        borderBottom: '1px solid #2a2a2a',
                      }}
                    >
                      Неделя: {weekKey === '__none' ? '—' : formatWeekRangeLabel(weekKey)} —{' '}
                      {group.length} заказов
                    </td>
                  </tr>
                  {group.map((item) => {
                    const o = item.order || {};
                    const oid = o.id;
                    const photo = firstPhotoSrc(o);
                    const client = o.client_name || '—';
                    const isWb = /wildberries|WB\b/i.test(String(client));
                    const d = drafts[oid] || {
                      actual_qty: item.actual_qty ?? 0,
                      status: item.status || 'not_started',
                      note: item.note || '',
                      plan_date: '',
                      fact_date: '',
                    };
                    const weekMon = anchorMondayIso(item, monthKey);
                    const st = d.status || item.status || 'not_started';
                    const planDateVal = chainDateIso(d.plan_date) || '';
                    const factDateVal = chainDateIso(d.fact_date) || '';
                    return (
                      <tr
                        key={oid}
                        style={{
                          background: st === 'done' ? 'rgba(200,255,0,0.05)' : 'transparent',
                          borderBottom: '1px solid #222',
                        }}
                      >
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          {photo ? (
                            <img
                              src={photo}
                              alt=""
                              width={52}
                              height={52}
                              style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 52,
                                height: 52,
                                borderRadius: 4,
                                background: '#222',
                              }}
                            />
                          )}
                          <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>#{oid}</div>
                          <input
                            type="text"
                            placeholder="Примечание..."
                            value={d.note}
                            disabled={!canEdit}
                            onChange={(e) => updateDraft(oid, { note: e.target.value })}
                            style={{
                              marginTop: 6,
                              width: '100%',
                              maxWidth: 120,
                              fontSize: 10,
                              background: 'transparent',
                              border: '0.5px solid #333',
                              color: '#888',
                              padding: '2px 4px',
                              borderRadius: 4,
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <div style={{ color: '#c8ff00', fontWeight: 700 }}>{orderTzModelLine(o)}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>
                            #{item.fact_id != null ? item.fact_id : '—'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top', textAlign: 'right' }}>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            план:{' '}
                            <span style={{ color: '#fff', fontWeight: 600 }}>{item.planned_qty ?? 0}</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            факт:{' '}
                            <input
                              type="number"
                              min={0}
                              disabled={!canEdit}
                              value={String(d.actual_qty ?? 0)}
                              onChange={(e) =>
                                updateDraft(oid, { actual_qty: parseInt(e.target.value, 10) || 0 })
                              }
                              style={{
                                width: 72,
                                background: '#1a1a1a',
                                border: '0.5px solid #444',
                                color: '#c8ff00',
                                padding: '4px 6px',
                                borderRadius: 4,
                                fontSize: 12,
                                textAlign: 'right',
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                            заказ: {o.total_quantity ?? '—'} шт
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            verticalAlign: 'top',
                            color: isWb ? '#4a9eff' : '#fff',
                          }}
                        >
                          {client}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 13, verticalAlign: 'top' }}>
                          {weekMon ? formatWeekRangeLabel(weekMon) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <input
                            type="date"
                            value={planDateVal}
                            disabled={!canEdit}
                            onChange={(e) => updateDraftAndLs(oid, { plan_date: e.target.value })}
                            style={{
                              background: 'transparent',
                              border: planDateVal ? '0.5px solid #c8ff00' : '0.5px solid #333',
                              color: planDateVal ? '#c8ff00' : '#555',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                              width: 150,
                            }}
                          />
                        </td>
                        <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="date"
                              value={factDateVal}
                              disabled={!canEdit}
                              onChange={(e) => updateDraftAndLs(oid, { fact_date: e.target.value })}
                              style={{
                                background: 'transparent',
                                border: factDateVal ? '0.5px solid #c8ff00' : '0.5px solid #333',
                                color: factDateVal ? '#c8ff00' : '#555',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                width: 130,
                              }}
                            />
                            {factDateVal ? (
                              <span style={{ color: '#c8ff00', fontSize: 14 }} title="Заполнено">
                                ✓
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <select
                            value={st}
                            disabled={!canEdit}
                            onChange={(e) => updateDraft(oid, { status: e.target.value })}
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #333',
                              color: statusColorStage(st),
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              marginBottom: 6,
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!canEdit || savingId === oid}
                            onClick={() => saveRow(item)}
                            style={{
                              display: 'block',
                              marginTop: 4,
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              border: 'none',
                              cursor: canEdit && savingId !== oid ? 'pointer' : 'not-allowed',
                              background: '#1a237e',
                              color: '#fff',
                            }}
                          >
                            {savingId === oid ? '…' : 'Сохранить'}
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
    </div>
  );
}
