/**
 * План цеха — ОТК (документы из фактов пошива).
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
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

function getSewingTotalFromDoc(doc) {
  return (doc?.otk_facts || []).reduce((s, f) => s + (parseInt(f.sewing_quantity, 10) || 0), 0);
}

function getPassedTotal(doc) {
  return (doc?.otk_facts || []).reduce((s, f) => s + (parseInt(f.otk_passed, 10) || 0), 0);
}

function getRejectedTotal(doc) {
  return (doc?.otk_facts || []).reduce((s, f) => s + (parseInt(f.otk_rejected, 10) || 0), 0);
}

function findOtkFact(facts, color, size) {
  const c = String(color ?? '').trim();
  const s = String(size ?? '').trim();
  return (facts || []).find(
    (f) => String(f.color ?? '').trim() === c && String(f.size ?? '').trim() === s
  );
}

function statusColorOtk(status) {
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

export default function OtkChainPanel() {
  const { user } = useAuth();
  const { refresh: refreshOrderProgress } = useOrderProgress();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('otk_doc');

  const canEdit = ['admin', 'manager', 'technologist'].includes(user?.role);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [workshops, setWorkshops] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSection, setFilterSection] = useState('all');
  const [modal, setModal] = useState(null);
  const modalSyncRef = useRef(null);
  const otkFactPersistChainRef = useRef(Promise.resolve());

  useEffect(() => {
    modalSyncRef.current = modal;
  }, [modal]);

  const loadDocs = useCallback(() => {
    setLoading(true);
    console.log('[ОТК] загрузка...');
    api.otk
      .documentsList()
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        console.log('[ОТК] документов:', arr.length);
        setDocs(arr);
      })
      .catch((err) => {
        console.error('[ОТК] ошибка:', err?.status, err?.message, err?.error);
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
          console.error('[OtkChainPanel.jsx]:', err?.message || err);
          setWorkshops(CHAIN_WORKSHOPS_FALLBACK);
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
        const updated = await api.otk.documentPatch(docId, body);
        setDocs((prev) => prev.map((x) => (Number(x.id) === Number(docId) ? { ...x, ...updated } : x)));
        if (modal && Number(modal.id) === Number(docId)) {
          setModal((m) => (m ? { ...m, ...updated, otk_facts: updated.otk_facts || m.otk_facts } : m));
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
      const facts = await api.otk.documentFactsList(doc.id);
      const list = Array.isArray(facts) ? facts.map((f) => ({ ...f })) : [];
      setModal({ ...doc, _factsLoading: false, _localFacts: list });
    } catch (e) {
      setBanner({ type: 'err', text: e?.message || 'Не удалось загрузить факты' });
      window.setTimeout(() => setBanner(null), 4000);
      setModal(null);
    }
  };

  const updateOtkField = (factId, field, value) => {
    const v = Math.max(0, parseInt(value, 10) || 0);
    setModal((m) => {
      if (!m?._localFacts) return m;
      const nf = m._localFacts.map((f) =>
        Number(f.id) === Number(factId) ? { ...f, [field]: v } : f
      );
      const next = { ...m, _localFacts: nf };
      modalSyncRef.current = next;
      return next;
    });
    otkFactPersistChainRef.current = otkFactPersistChainRef.current
      .then(async () => {
        const cur = modalSyncRef.current;
        if (!cur?._localFacts || !canEdit) return;
        const f = cur._localFacts.find((x) => Number(x.id) === Number(factId));
        if (!f) return;
        const curV = Math.max(0, parseInt(f[field], 10) || 0);
        if (curV !== v) return;
        try {
          await api.otk.chainFactPatch(factId, {
            otk_passed: Math.max(0, parseInt(f.otk_passed, 10) || 0),
            otk_rejected: Math.max(0, parseInt(f.otk_rejected, 10) || 0),
          });
          refreshOrderProgress();
        } catch (err) {
          console.error('[ОТК] ошибка сохранения:', err);
        }
      })
      .catch(() => {});
  };

  const saveModalFacts = async () => {
    if (!modal?._localFacts || !canEdit) return;
    try {
      for (const f of modal._localFacts) {
        const orig = (modal.otk_facts || []).find((x) => Number(x.id) === Number(f.id));
        const patch = {};
        if ((parseInt(orig?.otk_passed, 10) || 0) !== (parseInt(f.otk_passed, 10) || 0)) {
          patch.otk_passed = Math.max(0, parseInt(f.otk_passed, 10) || 0);
        }
        if ((parseInt(orig?.otk_rejected, 10) || 0) !== (parseInt(f.otk_rejected, 10) || 0)) {
          patch.otk_rejected = Math.max(0, parseInt(f.otk_rejected, 10) || 0);
        }
        if (Object.keys(patch).length) {
          await api.otk.chainFactPatch(f.id, patch);
        }
      }
      const refreshed = await api.otk.documentFactsList(modal.id);
      const list = Array.isArray(refreshed) ? refreshed.map((f) => ({ ...f })) : [];
      setDocs((prev) =>
        prev.map((d) => (Number(d.id) === Number(modal.id) ? { ...d, otk_facts: refreshed } : d))
      );
      setModal((m) => (m ? { ...m, otk_facts: refreshed, _localFacts: list } : m));
      setBanner({ type: 'ok', text: 'ОТК сохранён' });
      window.setTimeout(() => setBanner(null), 3500);
      refreshOrderProgress();
    } catch (e) {
      setBanner({ type: 'err', text: e?.message || 'Ошибка сохранения' });
      window.setTimeout(() => setBanner(null), 4000);
    }
  };

  return (
    <div className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-neon-text">План цеха — ОТК</h2>
        <Link
          to="/qc"
          className="text-sm text-[#4a9eff] hover:underline"
        >
          Партии на ОТК (склад) →
        </Link>
      </div>
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
        <div className="no-print flex flex-wrap items-center gap-4 mb-4" style={{ flexWrap: 'wrap' }}>
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
            <button type="button" onClick={() => setQuickRange('week')} style={quickBtnStyle}>
              Эта неделя
            </button>
            <button type="button" onClick={() => setQuickRange('month')} style={quickBtnStyle}>
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
                    window.alert(e?.message || 'Ошибка');
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
            {import.meta.env.DEV ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const data = await api.otk.syncToWarehouse();
                    window.alert(`Синхронизировано: ${data?.synced ?? 0} строк`);
                    loadDocs();
                  } catch (e) {
                    window.alert(e?.message || 'Ошибка');
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
                [DEV] Синхронизировать со складом
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
          Нет документов ОТК. Введите факт пошива в модуле «Пошив» — план ОТК обновится автоматически.
        </p>
      ) : filteredDocs.length === 0 ? (
        <p className="text-[#ECECEC]/70 text-sm">Нет документов по выбранным фильтрам.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/15 max-h-[min(65vh,calc(100vh-12rem))] overflow-y-auto">
          <table style={{ width: '100%', minWidth: 1320, borderCollapse: 'collapse' }}>
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
                  'Пошито',
                  'Принято',
                  'Отклонено',
                  'Клиент',
                  'Неделя план',
                  'Дата факт',
                  'Статус',
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
                  <tr>
                    <td
                      colSpan={11}
                      style={{
                        background: '#1a237e',
                        color: '#fff',
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        borderBottom: '1px solid #2a2a2a',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Неделя ОТК: {weekKey === '__none' ? '—' : formatWeekRangeLabel(weekKey)}</span>
                        <span style={{ opacity: 0.85, fontWeight: 400 }}>
                          {weekDocs.length} заказов
                        </span>
                      </div>
                    </td>
                  </tr>
                  {weekDocs.map((doc) => {
                    const o = doc.Order;
                    const photo = firstPhotoSrc(o);
                    const client = o?.Client?.name || '—';
                    const st = doc.status || 'pending';
                    const sewTot = getSewingTotalFromDoc(doc);
                    const passTot = getPassedTotal(doc);
                    const rejTot = getRejectedTotal(doc);
                    const sectionVal = effectiveChainSectionKey(doc);
                    const weekS = chainDateIso(doc.week_start);
                    const actualD = chainDateIso(doc.actual_date);
                    const rowHighlight =
                      highlightId && String(doc.id) === String(highlightId)
                        ? 'rgba(200,255,0,0.08)'
                        : 'transparent';
                    let rowBg = rowHighlight;
                    let rowBorder = '1px solid #222';
                    if (rejTot > 0) {
                      rowBorder = '2px solid #ef4444';
                    } else if (sewTot > 0 && passTot === sewTot) {
                      rowBg = rowHighlight || 'rgba(34,197,94,0.12)';
                    } else if (passTot > 0 && passTot < sewTot) {
                      rowBg = rowHighlight || 'rgba(245,158,11,0.12)';
                    }
                    return (
                      <tr
                        key={doc.id}
                        style={{
                          borderBottom: rowBorder,
                          background: rowBg,
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
                          <div style={{ fontSize: 11, color: '#666' }}>ОТК #{doc.id}</div>
                          <button
                            type="button"
                            onClick={() => openModal(doc)}
                            style={{
                              marginTop: 6,
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
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>{sewTot} шт</div>
                          <div style={{ fontSize: 10, color: '#555' }}>пошито</div>
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: passTot >= sewTot && sewTot > 0 ? '#c8ff00' : passTot > 0 ? '#22c55e' : '#666',
                            }}
                          >
                            {passTot} шт
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 12px', verticalAlign: 'top' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: rejTot > 0 ? '#ef4444' : '#666' }}>
                            {rejTot} шт
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#4a9eff', verticalAlign: 'top' }}>{client}</td>
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
                              color: statusColorOtk(st),
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
                            value={sectionVal}
                            disabled={!canEdit}
                            onChange={(e) =>
                              patchDoc(doc.id, {
                                section_id: e.target.value === '' ? null : e.target.value,
                              })
                            }
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #333',
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
                width: 'min(96vw, 840px)',
                maxHeight: '85vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#c8ff00' }}>
                  Детализация ОТК — заказ #{modal.order_id}
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
                ⚡ Принятые изделия автоматически передаются на Склад
              </div>
              {modal._factsLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Загрузка…</div>
              ) : !modal._localFacts?.length ? (
                <div style={{ color: '#888', fontSize: 13 }}>Нет строк факта.</div>
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
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
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
                              <td style={{ padding: 8, color: '#fff', verticalAlign: 'top' }}>{color}</td>
                              {sizes.map((size) => {
                                const f = findOtkFact(facts, color, size);
                                if (!f) {
                                  return (
                                    <td key={size} style={{ padding: 6, textAlign: 'center', color: '#333' }}>
                                      —
                                    </td>
                                  );
                                }
                                const sew = parseInt(f.sewing_quantity, 10) || 0;
                                return (
                                  <td key={size} style={{ padding: 6, textAlign: 'center', verticalAlign: 'top' }}>
                                    <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>пошито {sew}</div>
                                    {canEdit ? (
                                      <>
                                        <div style={{ fontSize: 9, color: '#22c55e', marginBottom: 2 }}>принято</div>
                                        <input
                                          type="number"
                                          min={0}
                                          value={numInputValue(f.otk_passed)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const n = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                            updateOtkField(f.id, 'otk_passed', n);
                                          }}
                                          style={{
                                            width: 56,
                                            textAlign: 'center',
                                            background: '#111',
                                            border: '0.5px solid #166534',
                                            color: '#86efac',
                                            padding: '4px 4px',
                                            borderRadius: 4,
                                            fontSize: 12,
                                            marginBottom: 6,
                                          }}
                                        />
                                        <div style={{ fontSize: 9, color: '#f87171', marginBottom: 2 }}>отклон.</div>
                                        <input
                                          type="number"
                                          min={0}
                                          value={numInputValue(f.otk_rejected)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const n = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                            updateOtkField(f.id, 'otk_rejected', n);
                                          }}
                                          style={{
                                            width: 56,
                                            textAlign: 'center',
                                            background: '#111',
                                            border: '0.5px solid #991b1b',
                                            color: '#fca5a5',
                                            padding: '4px 4px',
                                            borderRadius: 4,
                                            fontSize: 12,
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <div style={{ fontSize: 11 }}>
                                        <div style={{ color: '#86efac' }}>
                                          ✓ {Math.max(0, parseInt(f.otk_passed, 10) || 0)}
                                        </div>
                                        <div style={{ color: '#fca5a5' }}>
                                          ✗ {Math.max(0, parseInt(f.otk_rejected, 10) || 0)}
                                        </div>
                                      </div>
                                    )}
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

const quickBtnStyle = {
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 12,
  border: '0.5px solid #444',
  background: 'transparent',
  color: '#888',
  cursor: 'pointer',
};
