/**
 * Задания на пошив из плана цеха (после завершённого раскроя).
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useOrderProgress } from '../../context/OrderProgressContext';
import { formatWeekRangeLabel } from '../planChain/PlanChainDocumentCard';
import { getMonday } from '../../utils/cycleWeekLabels';
import { numInputValue } from '../../utils/numInput';
import {
  CHAIN_WORKSHOPS_FALLBACK,
  LEGACY_SECTION_LABELS,
  docMatchesChainSectionFilter,
  effectiveChainSectionKey,
} from '../../utils/planChainWorkshops';
import {
  getSizeLetter,
  FACT_HEAD_COLOR_TOP,
  FACT_HEAD_COLOR_BOTTOM,
  factMatrixHeadNumStyle,
  factMatrixHeadLetterStyle,
} from '../../utils/sizeGridHeader';

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

function getCuttingTotalFromDoc(doc) {
  return (doc?.sewing_facts || []).reduce((s, f) => s + (parseInt(f.cutting_quantity, 10) || 0), 0);
}

function getSewingTotalFromDoc(doc) {
  return (doc?.sewing_facts || []).reduce((s, f) => s + (parseInt(f.sewing_quantity, 10) || 0), 0);
}

function findSewingFact(facts, color, size) {
  const c = String(color ?? '').trim();
  const s = String(size ?? '').trim();
  return (facts || []).find(
    (f) => String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
  );
}

function statusColorSewing(status) {
  return (
    {
      pending: '#ff6b6b',
      in_progress: '#F59E0B',
      done: '#c8ff00',
    }[status] || '#666'
  );
}

const CHAIN_FILTER_INPUT = {
  background: '#1a1a1a',
  border: '0.5px solid #444',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 13,
};

export default function SewingChainPanel() {
  const { user } = useAuth();
  const { refresh: refreshOrderProgress } = useOrderProgress();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('chain_doc');

  const canEdit = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [workshops, setWorkshops] = useState([]);
  const [buildingFloors, setBuildingFloors] = useState([]);
  /** Пустые даты = «все периоды» (как в Раскрое); иначе задания с week_start вне месяца не видны */
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [modal, setModal] = useState(null);
  const modalSyncRef = useRef(null);
  const sewingFactPersistChainRef = useRef(Promise.resolve());

  useEffect(() => {
    modalSyncRef.current = modal;
  }, [modal]);

  const loadDocs = useCallback(() => {
    setLoading(true);
    console.log('[Пошив] загрузка...');
    api.sewing
      .documentsList()
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        console.log('[Пошив] документов:', arr.length);
        console.log('[Пошив] первый:', arr[0]);
        setDocs(arr);
      })
      .catch((err) => {
        console.error('[Пошив] ошибка:', err?.status, err?.message, err?.error);
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    let cancelled = false;
    api.workshops
      .list()
      .then((list) => {
        if (!cancelled) setWorkshops(list);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[SewingChainPanel.jsx]:', err?.message || err);
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
        if (!cancelled) setBuildingFloors(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[SewingChainPanel.jsx]:', err?.message || err);
          setBuildingFloors([
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

  const setQuickRange = (range) => {
    const today = new Date();
    if (range === 'week') {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(today);
      mon.setDate(today.getDate() + diff);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setDateFrom(mon.toISOString().split('T')[0]);
      setDateTo(sun.toISOString().split('T')[0]);
    }
    if (range === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateFrom(first.toISOString().split('T')[0]);
      setDateTo(last.toISOString().split('T')[0]);
    }
    if (range === 'next_month') {
      const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      setDateFrom(first.toISOString().split('T')[0]);
      setDateTo(last.toISOString().split('T')[0]);
    }
  };

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const ws = chainDateIso(doc.week_start);
      if (dateFrom) {
        if (!ws) return false;
        if (ws < dateFrom) return false;
      }
      if (dateTo) {
        if (!ws) return false;
        if (ws > dateTo) return false;
      }
      const st = doc.status || 'pending';
      if (filterStatus !== 'all' && st !== filterStatus) return false;
      if (!docMatchesChainSectionFilter(doc, filterSection, workshops)) return false;
      return true;
    });
  }, [docs, dateFrom, dateTo, filterStatus, filterSection, workshops]);

  const docsByWeek = useMemo(() => {
    const map = new Map();
    for (const d of filteredDocs) {
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
  }, [filteredDocs]);

  const patchDoc = useCallback(
    async (docId, body, okText) => {
      if (!canEdit) return;
      try {
        const updated = await api.sewing.documentPatch(docId, body);
        setDocs((prev) => prev.map((x) => (Number(x.id) === Number(docId) ? { ...x, ...updated } : x)));
        if (modal && Number(modal.id) === Number(docId)) {
          setModal((m) => (m ? { ...m, ...updated, sewing_facts: updated.sewing_facts || m.sewing_facts } : m));
        }
        if (okText) {
          setBanner({ type: 'ok', text: okText });
          window.setTimeout(() => setBanner(null), 3500);
        }
        refreshOrderProgress();
      } catch (e) {
        setBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
        window.setTimeout(() => setBanner(null), 4000);
      }
    },
    [canEdit, modal, refreshOrderProgress]
  );

  const openModal = async (doc) => {
    setModal({ ...doc, _factsLoading: true, _localFacts: null });
    try {
      const facts = await api.sewing.documentFactsList(doc.id);
      const list = Array.isArray(facts) ? facts.map((f) => ({ ...f })) : [];
      setModal({ ...doc, _factsLoading: false, _localFacts: list });
    } catch (e) {
      setBanner({ type: 'err', text: e?.message || 'Не удалось загрузить факты' });
      window.setTimeout(() => setBanner(null), 4000);
      setModal(null);
    }
  };

  const saveModalFacts = async () => {
    if (!modal?._localFacts || !canEdit) return;
    try {
      const tasks = [];
      for (const f of modal._localFacts) {
        const orig = (modal.sewing_facts || []).find((x) => Number(x.id) === Number(f.id));
        const prev = orig ? parseInt(orig.sewing_quantity, 10) || 0 : 0;
        const next = Math.max(0, parseInt(f.sewing_quantity, 10) || 0);
        if (prev !== next) {
          tasks.push(api.sewing.chainFactPatch(f.id, { sewing_quantity: next }));
        }
      }
      await Promise.all(tasks);
      const refreshed = await api.sewing.documentFactsList(modal.id);
      const list = Array.isArray(refreshed) ? refreshed.map((f) => ({ ...f })) : [];
      setDocs((prev) =>
        prev.map((d) => (Number(d.id) === Number(modal.id) ? { ...d, sewing_facts: refreshed } : d))
      );
      setModal((m) => (m ? { ...m, sewing_facts: refreshed, _localFacts: list } : m));
      setBanner({ type: 'ok', text: 'Факт пошива сохранён' });
      window.setTimeout(() => setBanner(null), 3500);
      refreshOrderProgress();
    } catch (e) {
      setBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
      window.setTimeout(() => setBanner(null), 4000);
    }
  };

  const updateLocalSewingQty = (factId, qty) => {
    const q = Math.max(0, parseInt(qty, 10) || 0);
    setModal((m) => {
      if (!m?._localFacts) return m;
      const nf = m._localFacts.map((f) =>
        Number(f.id) === Number(factId) ? { ...f, sewing_quantity: q } : f
      );
      const next = { ...m, _localFacts: nf };
      modalSyncRef.current = next;
      return next;
    });
    sewingFactPersistChainRef.current = sewingFactPersistChainRef.current
      .then(async () => {
        const cur = modalSyncRef.current;
        if (!cur?._localFacts || !canEdit) return;
        const f = cur._localFacts.find((x) => Number(x.id) === Number(factId));
        const curQ = Math.max(0, parseInt(f?.sewing_quantity, 10) || 0);
        if (curQ !== q) return;
        try {
          await api.sewing.chainFactPatch(factId, { sewing_quantity: curQ });
          refreshOrderProgress();
        } catch (err) {
          console.error('[Пошив] ошибка сохранения:', err);
        }
      })
      .catch(() => {});
  };

  return (
    <div className="mb-10">
      <h2 className="text-lg font-semibold text-neon-text mb-3">План цеха — пошив</h2>
      {banner ? (
        <div
          className={`mb-3 px-4 py-2 rounded-lg text-sm ${
            banner.type === 'ok'
              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
              : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {!loading ? (
        <div
          className="no-print flex flex-wrap items-center gap-4 mb-4"
          style={{ flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#888' }}>От:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={CHAIN_FILTER_INPUT}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#888' }}>До:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
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
              onClick={() => {
                setDateFrom('');
                setDateTo('');
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
                    const data = await api.sewing.syncToOtk();
                    window.alert(`Синхронизировано: ${data?.synced ?? 0} строк`);
                    loadDocs();
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
                [DEV] Синхронизировать с ОТК
              </button>
            ) : null}
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={CHAIN_FILTER_INPUT}
          >
            <option value="all">Все статусы</option>
            <option value="pending">Не начато</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Завершено</option>
          </select>
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
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
            Показано: {filteredDocs.length}
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-center text-[#ECECEC]/70">Загрузка…</div>
      ) : docs.length === 0 ? (
        <p className="text-[#ECECEC]/70 text-sm">
          Нет заданий на пошив. Введите данные факта в модуле «Раскрой» — они автоматически появятся здесь.
        </p>
      ) : filteredDocs.length === 0 ? (
        <p className="text-[#ECECEC]/70 text-sm">Нет документов по выбранным фильтрам.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/15 max-h-[min(65vh,calc(100vh-12rem))] overflow-y-auto">
          <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse' }}>
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
                  'TZ — MODEL',
                  'Раскроено',
                  'Пошито',
                  'Клиент',
                  'Неделя план',
                  'Дата план',
                  'Дата факт',
                  'Статус',
                  'Этаж',
                  'Цех',
                  'Комментарий',
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docsByWeek.map(([weekKey, weekDocs]) => (
                <Fragment key={weekKey}>
                  <tr style={{ background: '#1a1a24' }}>
                    <td
                      colSpan={12}
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#94a3b8',
                        borderBottom: '1px solid #2a2a2a',
                      }}
                    >
                      Неделя: {weekKey === '__none' ? '—' : formatWeekRangeLabel(weekKey)} — {weekDocs.length}{' '}
                      заказов
                    </td>
                  </tr>
                  {weekDocs.map((doc) => {
                    const o = doc.Order;
                    const photo = firstPhotoSrc(o);
                    const client = o?.Client?.name || '—';
                    const st = doc.status || 'pending';
                    const sectionVal = effectiveChainSectionKey(doc);
                    const cutTot = getCuttingTotalFromDoc(doc);
                    const sewTot = getSewingTotalFromDoc(doc);
                    const weekS = chainDateIso(doc.week_start);
                    const actualD = chainDateIso(doc.actual_date);
                    const rowHighlight =
                      highlightId && String(doc.id) === String(highlightId)
                        ? 'rgba(200,255,0,0.08)'
                        : 'transparent';
                    return (
                      <tr
                        key={doc.id}
                        style={{
                          borderBottom: '1px solid #222',
                          background: rowHighlight,
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
                            <div style={{ width: 48, height: 48, borderRadius: 4, background: '#222' }} />
                          )}
                          <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>#{doc.order_id}</div>
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <div style={{ color: '#c8ff00', fontWeight: 500 }}>{orderTzModelLine(o)}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>пошив #{doc.id}</div>
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>{cutTot} шт</div>
                          <div style={{ fontSize: 10, color: '#555' }}>раскроено</div>
                        </td>
                        <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color:
                                  sewTot >= cutTot && cutTot > 0
                                    ? '#c8ff00'
                                    : sewTot > 0
                                      ? '#F59E0B'
                                      : '#666',
                              }}
                            >
                              {sewTot} шт
                            </span>
                            <button
                              type="button"
                              onClick={() => openModal(doc)}
                              style={{
                                fontSize: 11,
                                color: '#4a9eff',
                                background: 'transparent',
                                border: '0.5px solid #4a9eff',
                                borderRadius: 4,
                                padding: '2px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              Детали
                            </button>
                          </div>
                          {(doc.sewing_facts || [])
                            .filter((f) => (parseInt(f.sewing_quantity, 10) || 0) > 0)
                            .slice(0, 2)
                            .map((f) => (
                              <div key={f.id} style={{ fontSize: 10, color: '#888' }}>
                                {f.color || '—'} / {f.size || '—'}: {f.sewing_quantity}шт
                              </div>
                            ))}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#4a9eff', verticalAlign: 'top' }}>{client}</td>
                        <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 13, verticalAlign: 'top' }}>
                          {formatWeekRangeLabel(doc.week_start)}
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <input
                            type="date"
                            value={weekS}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const mon = getMonday(e.target.value);
                              if (mon) patchDoc(doc.id, { week_start: mon });
                            }}
                            style={{
                              background: 'transparent',
                              border: '0.5px solid #444',
                              color: '#c8ff00',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              width: 150,
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <input
                            type="date"
                            value={actualD}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchDoc(doc.id, {
                                actual_date: e.target.value || null,
                              })
                            }
                            style={{
                              background: 'transparent',
                              border: '0.5px solid #333',
                              color: '#fff',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              cursor: canEdit ? 'pointer' : 'not-allowed',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <select
                            value={st}
                            disabled={!canEdit}
                            onChange={(e) => patchDoc(doc.id, { status: e.target.value })}
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #333',
                              color: statusColorSewing(st),
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                            }}
                          >
                            <option value="pending">Не начато</option>
                            <option value="in_progress">В процессе</option>
                            <option value="done">Завершено</option>
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <select
                            value={doc.floor_id != null && doc.floor_id !== '' ? String(doc.floor_id) : ''}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchDoc(doc.id, {
                                floor_id: e.target.value === '' ? null : e.target.value,
                              })
                            }
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #333',
                              color: '#fff',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              minWidth: 110,
                            }}
                          >
                            <option value="">— Этаж —</option>
                            {buildingFloors.map((f) => (
                              <option key={f.id} value={String(f.id)}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <select
                            value={sectionVal}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchDoc(doc.id, {
                                section_id: e.target.value === '' ? null : e.target.value,
                              })
                            }
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #444',
                              color: '#fff',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              minWidth: 130,
                            }}
                          >
                            <option value="">— Цех —</option>
                            {workshops.map((w) => (
                              <option key={w.id} value={String(w.id)}>
                                {w.name}
                              </option>
                            ))}
                            {sectionVal && !workshops.some((w) => String(w.id) === String(sectionVal)) ? (
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
                            disabled={!canEdit}
                            onBlur={(e) => patchDoc(doc.id, { comment: e.target.value || null })}
                            style={{
                              background: 'transparent',
                              border: '0.5px solid #333',
                              color: '#aaa',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                              width: 140,
                              maxWidth: '100%',
                            }}
                          />
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

      {modal &&
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
              if (e.target === e.currentTarget) setModal(null);
            }}
            role="presentation"
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '0.5px solid #333',
                borderRadius: 12,
                padding: 24,
                width: 'min(96vw, 720px)',
                maxHeight: '85vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#c8ff00' }}>
                  Детализация пошива — заказ #{modal.order_id}
                </div>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={{
                    color: '#666',
                    background: 'transparent',
                    border: 'none',
                    fontSize: 20,
                    cursor: 'pointer',
                  }}
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
                ⚡ Данные автоматически передаются в ОТК
              </div>
              {modal._factsLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Загрузка…</div>
              ) : !modal._localFacts?.length ? (
                <div style={{ color: '#888', fontSize: 13 }}>Нет строк факта (раскрой без детализации).</div>
              ) : (
                (() => {
                  const facts = modal._localFacts;
                  const colors = [...new Set(facts.map((f) => String(f.color ?? '').trim()).filter(Boolean))].sort(
                    (a, b) => a.localeCompare(b, 'ru')
                  );
                  const sizes = [...new Set(facts.map((f) => String(f.size ?? '').trim()).filter(Boolean))].sort(
                    (a, b) => a.localeCompare(b, 'ru')
                  );
                  const orderForHead = modal.Order;
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={FACT_HEAD_COLOR_TOP}>Цвет</th>
                            {sizes.map((sz) => (
                              <th key={sz} style={factMatrixHeadNumStyle(sz, orderForHead)}>
                                {sz}
                              </th>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid #333' }}>
                            <th style={FACT_HEAD_COLOR_BOTTOM} aria-hidden />
                            {sizes.map((sz) => (
                              <th key={`letter-${sz}`} style={factMatrixHeadLetterStyle(sz, orderForHead)}>
                                {getSizeLetter(sz)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {colors.map((color) => (
                            <tr key={color} style={{ borderBottom: '0.5px solid #1e1e1e' }}>
                              <td style={{ padding: 8, color: '#fff' }}>{color}</td>
                              {sizes.map((size) => {
                                const f = findSewingFact(facts, color, size);
                                if (!f) {
                                  return (
                                    <td key={size} style={{ padding: 6, textAlign: 'center', color: '#333' }}>
                                      —
                                    </td>
                                  );
                                }
                                const plan = parseInt(f.cutting_quantity, 10) || 0;
                                const sew = Math.max(0, parseInt(f.sewing_quantity, 10) || 0);
                                const rem = plan - sew;
                                return (
                                  <td key={size} style={{ padding: 6, textAlign: 'center', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>план {plan}</div>
                                    {canEdit ? (
                                      <input
                                        type="number"
                                        min={0}
                                        value={numInputValue(f.sewing_quantity)}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const n = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                          updateLocalSewingQty(f.id, n);
                                        }}
                                        style={{
                                          width: 64,
                                          textAlign: 'center',
                                          background: '#111',
                                          border: '0.5px solid #444',
                                          color: '#fff',
                                          padding: '4px 6px',
                                          borderRadius: 4,
                                          fontSize: 13,
                                          fontWeight: 600,
                                        }}
                                      />
                                    ) : (
                                      <div style={{ fontWeight: 600 }}>{sew}</div>
                                    )}
                                    <div
                                      style={{
                                        fontSize: 10,
                                        marginTop: 4,
                                        color: rem < 0 ? '#ff6b6b' : rem === 0 ? '#c8ff00' : '#888',
                                      }}
                                    >
                                      ост. {rem}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '0.5px solid #444',
                    color: '#888',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Закрыть
                </button>
                {canEdit && modal._localFacts?.length ? (
                  <button
                    type="button"
                    onClick={() => saveModalFacts()}
                    style={{
                      padding: '8px 16px',
                      background: '#c8ff00',
                      border: 'none',
                      color: '#000',
                      fontWeight: 600,
                      borderRadius: 6,
                      cursor: 'pointer',
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
