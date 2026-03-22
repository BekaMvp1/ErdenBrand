/**
 * Черновик / превью планирования производства (только UI + локальное состояние).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

const ROW_COUNT = 30;

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

function parseCellNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function orderDisplayName(o) {
  if (!o) return '';
  const parts = [o.tz_code, o.model_name, o.title].filter(Boolean);
  const s = parts.length ? parts.join(' · ') : '';
  return s || `Заказ #${o.id}`;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  return data?.rows ?? data?.data ?? data?.orders ?? data?.clients ?? [];
}

const initialRows = () =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({
    id: `r${i}`,
    num: i + 1,
    orderIdx: null,
    custIdx: null,
    weeks: [
      { pp: '', pf: '', mp: '', mf: '' },
      { pp: '', pf: '', mp: '', mf: '' },
      { pp: '', pf: '', mp: '', mf: '' },
      { pp: '', pf: '', mp: '', mf: '' },
    ],
  }));

export default function PlanningDraft() {
  const [rows, setRows] = useState(initialRows);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [weekSliceStart, setWeekSliceStart] = useState(0);
  const [workshopId, setWorkshopId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [capacityInput, setCapacityInput] = useState('');

  const [openDropdown, setOpenDropdown] = useState(null);
  const [ddSearch, setDdSearch] = useState('');
  const [ddPos, setDdPos] = useState({ top: 0, left: 0, width: 280 });
  const cellRefs = useRef({});
  const tableScrollRef = useRef(null);
  const ddSearchInputRef = useRef(null);

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
        setOrders(normalizeList(o));
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

  const allWeeks = useMemo(() => getWeeksInMonth(monthKey), [monthKey]);

  useEffect(() => {
    const maxStart = Math.max(0, allWeeks.length - 4);
    setWeekSliceStart((s) => Math.min(s, maxStart));
  }, [monthKey, allWeeks.length]);

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

  const monthNameRu = MONTH_NAMES_RU[parseInt(monthKey.split('-')[1], 10) - 1] || '';

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

  const filledCount = useMemo(() => rows.filter((r) => r.orderIdx !== null).length, [rows]);

  const updateWeekCell = (rowId, weekIdx, field, value) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              weeks: r.weeks.map((w, wi) => (wi === weekIdx ? { ...w, [field]: value } : w)),
            }
          : r
      )
    );
  };

  const rowSum = (r) => {
    let s = 0;
    r.weeks.forEach((w) => {
      s += parseCellNum(w.pp) + parseCellNum(w.mp);
    });
    return s;
  };

  const openOrderDropdown = (rowId, el) => {
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
  };

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

  const selectOrder = (rowId, idx) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, orderIdx: idx } : r))
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const clearOrder = (rowId) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, orderIdx: null } : r))
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const onCustChange = (rowId, idxStr) => {
    const idx = idxStr === '' ? null : parseInt(idxStr, 10);
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, custIdx: Number.isFinite(idx) ? idx : null } : r))
    );
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
        .planning-draft-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .planning-draft-scroll::-webkit-scrollbar-track { background: var(--bg); }
        .planning-draft-scroll::-webkit-scrollbar-thumb {
          background: var(--surface2);
          border-radius: 4px;
        }
        .planning-draft-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted); }
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
          ЧЕРНОВИК
        </span>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Планирование производства
        </h1>
      </header>

      {/* Stats */}
      <div
        className="flex flex-wrap gap-2.5 px-[18px] py-2.5"
        style={{ gap: '10px', padding: '10px 18px' }}
      >
        {[
          { label: 'Всего', value: ROW_COUNT, color: '#58a6ff' },
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
            setMonthKey(e.target.value);
            setWeekSliceStart(0);
          }}
        >
          {monthOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
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
          value={String(weekSliceStart)}
          onChange={(e) => setWeekSliceStart(parseInt(e.target.value, 10) || 0)}
        >
          {Array.from({ length: Math.max(1, allWeeks.length - 3) }, (_, i) => (
            <option key={i} value={String(i)}>
              Недели {i + 1}–{Math.min(i + 4, allWeeks.length)}
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
          onClick={goPrevWeeks}
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
          onClick={goNextWeeks}
        >
          Следующая →
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
          className="rounded px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm transition-colors"
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
          onClick={() => window.print()}
        >
          🖨 Печать
        </button>
      </div>

      {/* Table */}
      <div
        ref={tableScrollRef}
        className="planning-draft-scroll overflow-auto"
        style={{ maxHeight: 'calc(100vh - 195px)' }}
      >
        <table
          className="border-collapse"
          style={{ width: 'max-content', borderColor: 'var(--border)' }}
        >
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="sticky left-0 z-[150] border px-1 text-xs font-medium"
                style={{
                  top: 0,
                  width: 36,
                  minWidth: 36,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  zIndex: 150,
                }}
              >
                №
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] border px-1 text-xs font-medium"
                style={{
                  left: 36,
                  top: 0,
                  width: 60,
                  minWidth: 60,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  zIndex: 150,
                }}
              >
                Арт.
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] border px-1 text-left text-xs font-medium"
                style={{
                  left: 96,
                  top: 0,
                  width: 220,
                  minWidth: 220,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  zIndex: 150,
                }}
              >
                Наименование ГП
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] border px-1 text-xs font-medium"
                style={{
                  left: 316,
                  top: 0,
                  width: 100,
                  minWidth: 100,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  boxShadow: '6px 0 12px rgba(0,0,0,0.6)',
                  zIndex: 150,
                }}
              >
                Заказчик
              </th>
              {displayWeeks.map((w, wi) => (
                <th
                  key={wi}
                  colSpan={4}
                  className="border border-l-2 px-1 text-center text-xs font-medium"
                  style={{
                    borderLeftColor: 'var(--accent)',
                    borderColor: 'var(--border)',
                    background: 'var(--bg2)',
                    top: 0,
                    zIndex: 100,
                  }}
                >
                  <div>
                    {w.dateFrom
                      ? `${monthNameRu} ${w.weekNum}`
                      : '—'}
                  </div>
                  <div className="text-[10px] font-normal" style={{ color: 'var(--muted)' }}>
                    {w.dateFrom && w.dateTo
                      ? `${formatDdMm(w.dateFrom)}–${formatDdMm(w.dateTo)}`
                      : ''}
                  </div>
                </th>
              ))}
              <th
                rowSpan={3}
                className="border px-1 text-xs font-medium"
                style={{
                  width: 65,
                  minWidth: 65,
                  background: 'var(--bg2)',
                  borderColor: 'var(--border)',
                  top: 0,
                  zIndex: 100,
                }}
              >
                Итого
              </th>
            </tr>
            <tr>
              {displayWeeks.map((w, wi) => (
                <React.Fragment key={wi}>
                  <th
                    colSpan={2}
                    className="border border-l-2 px-1 text-center text-[10px] font-medium"
                    style={{
                      borderLeftColor: '#e3b341',
                      borderColor: 'var(--border)',
                      background: 'rgba(227,179,65,0.1)',
                      color: '#e3b341',
                      top: 28,
                      zIndex: 100,
                    }}
                  >
                    Подготовка
                  </th>
                  <th
                    colSpan={2}
                    className="border border-l-2 px-1 text-center text-[10px] font-medium"
                    style={{
                      borderLeftColor: 'var(--accent)',
                      borderColor: 'var(--border)',
                      background: 'var(--bg2)',
                      top: 28,
                      zIndex: 100,
                    }}
                  >
                    Основное
                  </th>
                </React.Fragment>
              ))}
            </tr>
            <tr>
              {displayWeeks.map((w, wi) => (
                <React.Fragment key={wi}>
                  <th
                    className="border border-l-2 px-0.5 text-[10px] font-normal"
                    style={{
                      borderLeftColor: '#e3b341',
                      background: 'rgba(227,179,65,0.06)',
                      color: '#e3b341',
                      width: 52,
                      minWidth: 48,
                      top: 52,
                      zIndex: 100,
                    }}
                  >
                    План
                  </th>
                  <th
                    className="border px-0.5 text-[10px] font-normal"
                    style={{
                      background: 'rgba(227,179,65,0.06)',
                      color: '#e3b341',
                      width: 52,
                      minWidth: 48,
                      top: 52,
                      zIndex: 100,
                    }}
                  >
                    Факт
                  </th>
                  <th
                    className="border border-l-2 px-0.5 text-[10px] font-normal"
                    style={{
                      borderLeftColor: 'var(--accent)',
                      background: 'var(--bg2)',
                      color: 'var(--text)',
                      width: 52,
                      minWidth: 48,
                      top: 52,
                      zIndex: 100,
                    }}
                  >
                    План
                  </th>
                  <th
                    className="border px-0.5 text-[10px] font-normal"
                    style={{
                      background: 'var(--bg2)',
                      color: 'var(--text)',
                      width: 52,
                      minWidth: 48,
                      top: 52,
                      zIndex: 100,
                    }}
                  >
                    Факт
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const order = r.orderIdx !== null ? orders[r.orderIdx] : null;
              const art = order?.article || order?.tz_code || '';
              const total = rowSum(r);
              const dim =
                debouncedSearch && !rowMatchesFilter(r) ? 0.35 : 1;
              return (
                <tr
                  key={r.id}
                  className="group/row border-b transition-colors"
                  style={{ borderColor: 'var(--border)', opacity: dim }}
                >
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky left-0 z-40 border px-1 text-center text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      width: 36,
                      minWidth: 36,
                      background: 'var(--bg)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {r.num}
                  </td>
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 border px-1 text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 36,
                      width: 60,
                      minWidth: 60,
                      background: 'var(--bg)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {art ? (
                      <span
                        className="inline-block rounded px-1 py-px text-[10px]"
                        style={{
                          background: 'var(--surface2)',
                          color: 'var(--muted)',
                        }}
                      >
                        {art}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 border p-0 transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 96,
                      width: 220,
                      minWidth: 220,
                      background: 'var(--bg)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div
                      ref={(el) => {
                        cellRefs.current[r.id] = el;
                      }}
                      role="button"
                      tabIndex={0}
                      className="flex cursor-pointer items-center gap-1 px-1 py-1"
                      onClick={(e) => openOrderDropdown(r.id, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openOrderDropdown(r.id, e.currentTarget);
                        }
                      }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-xs"
                        style={{ color: order ? 'var(--text)' : 'var(--muted)' }}
                      >
                        {order ? orderDisplayName(order) : (
                          <span className="italic">— выберите заказ —</span>
                        )}
                      </span>
                      <span
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border text-[10px] leading-none transition-all"
                        style={{
                          borderColor: openDropdown === r.id ? 'var(--accent)' : 'var(--border)',
                          background:
                            openDropdown === r.id ? 'var(--accent)' : 'var(--surface2)',
                          color: openDropdown === r.id ? '#fff' : 'var(--text)',
                          transform: openDropdown === r.id ? 'rotate(180deg)' : 'none',
                        }}
                      >
                        ▼
                      </span>
                    </div>
                  </td>
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 border p-0 transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 316,
                      width: 100,
                      minWidth: 100,
                      background: 'var(--bg)',
                      borderColor: 'var(--border)',
                      boxShadow: '6px 0 12px rgba(0,0,0,0.6)',
                    }}
                  >
                    <select
                      className="w-full cursor-pointer border-0 bg-transparent px-1 py-1.5 text-xs outline-none"
                      style={{
                        color:
                          r.custIdx === null ? 'var(--muted)' : 'var(--text)',
                      }}
                      value={r.custIdx === null ? '' : String(r.custIdx)}
                      onChange={(e) => onCustChange(r.id, e.target.value)}
                    >
                      <option value="" style={{ color: 'var(--muted)' }}>
                        —
                      </option>
                      {clients.map((c, idx) => (
                        <option key={c.id ?? idx} value={String(idx)}>
                          {c.name || c.title || `Клиент ${idx}`}
                        </option>
                      ))}
                    </select>
                  </td>
                  {r.weeks.map((w, wi) => (
                    <React.Fragment key={wi}>
                      <td
                        className="group-hover/row:bg-[var(--surface2)] border border-l-2 p-0 transition-colors"
                        style={{
                          borderLeftColor: '#e3b341',
                          borderColor: 'var(--border)',
                          background: 'rgba(227,179,65,0.06)',
                        }}
                      >
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={w.pp === '' || w.pp === '0' ? '' : w.pp}
                          onChange={(e) =>
                            updateWeekCell(r.id, wi, 'pp', e.target.value)
                          }
                        />
                      </td>
                      <td
                        className="group-hover/row:bg-[var(--surface2)] border p-0 text-center text-xs transition-colors"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'rgba(227,179,65,0.06)',
                          color: 'var(--muted)',
                        }}
                      >
                        <div className="py-1.5">{w.pf || ''}</div>
                      </td>
                      <td
                        className="group-hover/row:bg-[var(--surface2)] border border-l-2 p-0 transition-colors"
                        style={{
                          borderLeftColor: 'var(--accent)',
                          borderColor: 'var(--border)',
                        }}
                      >
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={w.mp === '' || w.mp === '0' ? '' : w.mp}
                          onChange={(e) =>
                            updateWeekCell(r.id, wi, 'mp', e.target.value)
                          }
                        />
                      </td>
                      <td
                        className="group-hover/row:bg-[var(--surface2)] border p-0 text-center text-xs transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        <div className="py-1.5">{w.mf || ''}</div>
                      </td>
                    </React.Fragment>
                  ))}
                  <td
                    className="group-hover/row:bg-[var(--surface2)] border px-1 text-center text-xs font-bold transition-colors"
                    style={{
                      borderColor: 'var(--border)',
                      color:
                        total === 0 ? 'var(--surface2)' : 'var(--accent)',
                    }}
                  >
                    {total === 0 ? '' : total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                const sel = rows.find((x) => x.id === openDropdown)?.orderIdx === idx;
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
    </div>
  );
}
