/**
 * Планирование производства (таблица недель, заказы и клиенты из API).
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

/**
 * Недели месяца как на backend (getWeeksOfMonth): понедельник..воскресенье,
 * все недели с week_start <= последний день месяца (в т.ч. начинающиеся до 1-го числа).
 */
function getWeeksInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const d = new Date(firstDay);
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  const weeks = [];
  let weekNum = 1;
  while (d <= lastDay) {
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const dateFrom = d.toISOString().slice(0, 10);
    const dateTo = weekEnd.toISOString().slice(0, 10);
    weeks.push({
      weekNum,
      label: `${weekNum} неделя`,
      dateFrom,
      dateTo,
    });
    weekNum += 1;
    d.setDate(d.getDate() + 7);
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

/** Индекс клиента в списке references по заказу (client_id / Client.id) */
function clientIdxForOrder(order, clients) {
  if (!order || !clients?.length) return null;
  const id = order.client_id ?? order.Client?.id;
  if (id == null) return null;
  const idx = clients.findIndex((c) => String(c.id) === String(id));
  return idx >= 0 ? idx : null;
}

const emptyWeekCell = () => ({ wk: '', pp: '', pf: '', mp: '', mf: '' });

const initialRows = () =>
  Array.from({ length: ROW_COUNT }, (_, i) => ({
    id: `r${i}`,
    num: i + 1,
    orderId: null,
    custIdx: null,
    weeks: [emptyWeekCell(), emptyWeekCell(), emptyWeekCell(), emptyWeekCell()],
  }));

/** Независимые недели: ячейки сопоставляются по понедельнику wk, а не по индексу колонки */
function alignRowsToDisplayWeeks(prevRows, displayWeeks) {
  const slots = displayWeeks.length >= 4 ? displayWeeks.slice(0, 4) : displayWeeks;
  return prevRows.map((r) => {
    const outWeeks = [0, 1, 2, 3].map((i) => {
      const dw = slots[i];
      const mon = dw?.dateFrom ? String(dw.dateFrom).slice(0, 10) : '';
      if (!mon) return emptyWeekCell();
      const arr = Array.isArray(r.weeks) ? r.weeks : [];
      const byKey = arr.find((w) => w && String(w.wk) === mon);
      const legacy = !byKey && arr[i] && (!arr[i].wk || arr[i].wk === '') ? arr[i] : null;
      const src = byKey || legacy;
      return {
        wk: mon,
        pp: src?.pp ?? '',
        pf: src?.pf ?? '',
        mp: src?.mp ?? '',
        mf: src?.mf ?? '',
      };
    });
    return { ...r, weeks: outWeeks };
  });
}

function mergeSnapshotWithTemplate(serverRows, displayWeeks) {
  const base = initialRows();
  const src = Array.isArray(serverRows) ? serverRows : [];
  for (let i = 0; i < ROW_COUNT; i++) {
    if (src[i]) {
      base[i] = {
        ...base[i],
        id: base[i].id,
        num: base[i].num,
        orderId: src[i].orderId ?? null,
        custIdx: src[i].custIdx ?? null,
        weeks: Array.isArray(src[i].weeks) ? src[i].weeks : base[i].weeks,
      };
    }
  }
  return alignRowsToDisplayWeeks(base, displayWeeks);
}

function draftStorageKey(monthKey, weekSliceStart, workshopId, floorId) {
  return `planning_draft_v1_${monthKey}_${weekSliceStart}_${workshopId || 'all'}_${floorId || 'all'}`;
}

const PLANNING_UI_KEY = 'planning_ui_v1';

function defaultMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readSavedPlanningUi() {
  try {
    const raw = localStorage.getItem(PLANNING_UI_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export default function PlanningDraft() {
  const savedUiOnceRef = useRef(undefined);
  if (savedUiOnceRef.current === undefined) {
    savedUiOnceRef.current =
      typeof window !== 'undefined' ? readSavedPlanningUi() : null;
  }
  const savedUi = savedUiOnceRef.current;

  const [rows, setRows] = useState(initialRows);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState('');
  const [planningMsg, setPlanningMsg] = useState('');
  const [capacitySaving, setCapacitySaving] = useState(false);

  const [monthKey, setMonthKey] = useState(() => {
    const def = defaultMonthKey();
    const m = savedUi?.monthKey;
    return m && /^\d{4}-\d{2}$/.test(String(m)) ? String(m) : def;
  });
  const [weekSliceStart, setWeekSliceStart] = useState(() => {
    const n = Number(savedUi?.weekSliceStart);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  /** Индекс колонки недели 0–3 в текущем окне: для мощности и печати */
  const [primaryWeekIndex, setPrimaryWeekIndex] = useState(() => {
    const n = Number(savedUi?.primaryWeekIndex);
    if (!Number.isFinite(n)) return 0;
    return Math.min(3, Math.max(0, n));
  });
  const [workshopId, setWorkshopId] = useState(() =>
    savedUi?.workshopId != null && savedUi.workshopId !== '' ? String(savedUi.workshopId) : ''
  );
  const [floorId, setFloorId] = useState(() =>
    savedUi?.floorId != null && savedUi.floorId !== '' ? String(savedUi.floorId) : ''
  );
  const [searchQ, setSearchQ] = useState(() =>
    typeof savedUi?.searchQ === 'string' ? savedUi.searchQ : ''
  );
  const [debouncedSearch, setDebouncedSearch] = useState(() =>
    typeof savedUi?.searchQ === 'string' ? savedUi.searchQ.trim() : ''
  );
  const [capacityInput, setCapacityInput] = useState('');
  const [orderMeta, setOrderMeta] = useState({});

  const [openDropdown, setOpenDropdown] = useState(null);
  const [ddSearch, setDdSearch] = useState('');
  const [ddPos, setDdPos] = useState({ top: 0, left: 0, width: 280 });
  const cellRefs = useRef({});
  const tableScrollRef = useRef(null);
  const ddSearchInputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQ.trim()), 120);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        PLANNING_UI_KEY,
        JSON.stringify({
          monthKey,
          weekSliceStart,
          workshopId,
          floorId,
          searchQ,
          primaryWeekIndex,
        })
      );
    } catch {
      /* ignore */
    }
  }, [monthKey, weekSliceStart, workshopId, floorId, searchQ, primaryWeekIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [c, w] = await Promise.all([
          api.references.clients(),
          api.workshops.list(true),
        ]);
        if (cancelled) return;
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

  const selectedWorkshop = useMemo(
    () =>
      workshopId
        ? workshops.find((w) => String(w.id) === String(workshopId)) ?? null
        : null,
    [workshops, workshopId]
  );
  /** Цех с 4 этажами — заказы и план только после выбора этажа */
  const needsWorkshopFloor = Number(selectedWorkshop?.floors_count) === 4;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading) {
        return;
      }
      if (!workshopId || (needsWorkshopFloor && !floorId)) {
        setOrders([]);
        setOrdersLoading(false);
        return;
      }
      setOrdersLoading(true);
      try {
        const params = {
          limit: 500,
          workshop_id: workshopId,
        };
        if (floorId) params.building_floor_id = floorId;
        if (debouncedSearch) params.search = debouncedSearch.trim();
        const o = await api.orders.list(params);
        if (cancelled) return;
        const list = normalizeList(o).filter(
          (x) =>
            String(x.workshop_id ?? x.Workshop?.id ?? '') === String(workshopId)
        );
        setOrders(list);
      } catch (e) {
        console.error(e);
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, workshopId, floorId, debouncedSearch, needsWorkshopFloor]);

  useEffect(() => {
    let cancelled = false;
    if (!workshopId || (needsWorkshopFloor && !floorId)) {
      setOrderMeta({});
      return undefined;
    }
    const params = { workshop_id: workshopId };
    if (needsWorkshopFloor) params.building_floor_id = floorId;
    api.planning
      .matrixOrdersMeta(params)
      .then((data) => {
        if (cancelled) return;
        const m = {};
        for (const x of data.meta || []) {
          m[x.order_id] = x;
        }
        setOrderMeta(m);
      })
      .catch(() => {
        if (!cancelled) setOrderMeta({});
      });
    return () => {
      cancelled = true;
    };
  }, [workshopId, floorId, needsWorkshopFloor]);

  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (!r.orderId) return r;
        if (orders.some((o) => o.id === r.orderId)) return r;
        return { ...r, orderId: null, custIdx: null };
      })
    );
  }, [orders]);

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

  useEffect(() => {
    setPrimaryWeekIndex(0);
  }, [monthKey]);

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

  const displayWeekKeys = useMemo(
    () => displayWeeks.map((w) => w.dateFrom || '').join('|'),
    [displayWeeks]
  );

  const primaryWeekMonday = useMemo(() => {
    const w = displayWeeks[primaryWeekIndex];
    return w?.dateFrom ? String(w.dateFrom).slice(0, 10) : '';
  }, [displayWeeks, primaryWeekIndex]);

  useEffect(() => {
    if (!displayWeeks[primaryWeekIndex]?.dateFrom) {
      const fi = displayWeeks.findIndex((w) => w.dateFrom);
      if (fi >= 0) setPrimaryWeekIndex(fi);
    }
  }, [displayWeeks, primaryWeekIndex]);

  useEffect(() => {
    let cancelled = false;
    if (!workshopId || !primaryWeekMonday) {
      setCapacityInput('');
      return undefined;
    }
    if (needsWorkshopFloor && !floorId) {
      setCapacityInput('');
      return undefined;
    }
    (async () => {
      try {
        const params = { month: monthKey, workshop_id: workshopId };
        if (needsWorkshopFloor) params.floor_id = floorId;
        const data = await api.planning.weekly(params);
        if (cancelled) return;
        const totals = data.week_totals || data.weekTotals || [];
        const wt = totals.find(
          (t) => String(t.week_start).slice(0, 10) === primaryWeekMonday
        );
        setCapacityInput(
          wt != null && wt.capacity_week != null ? String(wt.capacity_week) : ''
        );
      } catch {
        if (!cancelled) setCapacityInput('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthKey, workshopId, floorId, needsWorkshopFloor, primaryWeekMonday]);

  const draftKey = useMemo(
    () => draftStorageKey(monthKey, weekSliceStart, workshopId, floorId),
    [monthKey, weekSliceStart, workshopId, floorId]
  );

  useEffect(() => {
    if (!workshopId) {
      setRows(mergeSnapshotWithTemplate(null, displayWeeks));
      return;
    }
    if (needsWorkshopFloor && !floorId) {
      setRows(mergeSnapshotWithTemplate(null, displayWeeks));
    }
  }, [workshopId, floorId, needsWorkshopFloor, displayWeekKeys, displayWeeks]);

  useEffect(() => {
    let cancelled = false;
    if (!workshopId || (needsWorkshopFloor && !floorId) || loading) {
      return undefined;
    }
    (async () => {
      try {
        const params = {
          month: monthKey,
          workshop_id: workshopId,
          week_slice_start: String(weekSliceStart),
        };
        if (floorId) params.floor_id = floorId;
        const snap = await api.planning.matrixSnapshotGet(params);
        if (cancelled) return;
        if (snap.rows && Array.isArray(snap.rows)) {
          setRows(mergeSnapshotWithTemplate(snap.rows, displayWeeks));
          return;
        }
      } catch (e) {
        console.warn(e);
      }
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === ROW_COUNT) {
            setRows(mergeSnapshotWithTemplate(parsed, displayWeeks));
            return;
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setRows(mergeSnapshotWithTemplate(null, displayWeeks));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    draftKey,
    displayWeekKeys,
    workshopId,
    floorId,
    needsWorkshopFloor,
    loading,
    monthKey,
    weekSliceStart,
    displayWeeks,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(rows));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [rows, draftKey]);

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

  const eligiblePickerOrders = useMemo(() => {
    const metaReady = Object.keys(orderMeta).length > 0;
    return orders.filter((o) => {
      const m = orderMeta[o.id];
      if (metaReady) {
        if (!m) return false;
        if (!m.is_active) return false;
        if (m.remainder <= 0) return false;
      }
      return true;
    });
  }, [orders, orderMeta]);

  const filteredOrders = useMemo(() => {
    const q = ddSearch.trim().toLowerCase();
    let base = eligiblePickerOrders;
    if (openDropdown) {
      base = base.filter((o) => {
        const isSet = (o.model_type || 'regular') === 'set';
        if (isSet) return true;
        return !rows.some((rr) => rr.id !== openDropdown && rr.orderId === o.id);
      });
    }
    if (!q) return base;
    return base.filter((o) => {
      const name = orderDisplayName(o).toLowerCase();
      const art = String(o.article || o.tz_code || '').toLowerCase();
      const cl = (o.Client?.name || '').toLowerCase();
      const idStr = String(o.id);
      return (
        name.includes(q) || art.includes(q) || cl.includes(q) || idStr.includes(q)
      );
    });
  }, [eligiblePickerOrders, ddSearch, openDropdown, rows]);

  const rowMatchesFilter = useCallback(
    (r) => {
      const q = debouncedSearch.trim().toLowerCase();
      if (!q) return true;
      const o = r.orderId != null ? orders.find((x) => x.id === r.orderId) : null;
      const cust = r.custIdx !== null ? clients[r.custIdx] : null;
      const hay = [
        o ? orderDisplayName(o) : '',
        o?.article || '',
        o?.tz_code || '',
        o?.id != null ? String(o.id) : '',
        cust?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    },
    [debouncedSearch, orders, clients]
  );

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
    if (!workshopId) {
      setPlanningMsg('Сначала выберите цех — в списке будут только заказы этого цеха');
      setTimeout(() => setPlanningMsg(''), 4500);
      return;
    }
    if (needsWorkshopFloor && !floorId) {
      setPlanningMsg('Выберите этаж — список заказов будет только для этого этажа');
      setTimeout(() => setPlanningMsg(''), 4500);
      return;
    }
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

  useEffect(() => {
    if (!workshopId || (needsWorkshopFloor && !floorId)) {
      setOpenDropdown(null);
      setDdSearch('');
    }
  }, [workshopId, floorId, needsWorkshopFloor]);

  const selectOrder = (rowId, order) => {
    const custIdx = clientIdxForOrder(order, clients);
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, orderId: order.id, custIdx: custIdx !== null ? custIdx : null }
          : r
      )
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const clearOrder = (rowId) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, orderId: null, custIdx: null } : r))
    );
    setOpenDropdown(null);
    setDdSearch('');
  };

  const handleSaveCapacity = async () => {
    if (!workshopId || !primaryWeekMonday) {
      setPlanningMsg('Выберите цех и неделю для мощности');
      setTimeout(() => setPlanningMsg(''), 4000);
      return;
    }
    if (needsWorkshopFloor && !floorId) {
      setPlanningMsg('Для этого цеха выберите этаж');
      setTimeout(() => setPlanningMsg(''), 4000);
      return;
    }
    setCapacitySaving(true);
    try {
      const body = {
        workshop_id: Number(workshopId),
        week_start: primaryWeekMonday,
        capacity_week: parseFloat(String(capacityInput).replace(',', '.')) || 0,
      };
      if (needsWorkshopFloor) body.floor_id = Number(floorId);
      await api.planning.saveCapacity(body);
      const capW = parseFloat(String(capacityInput).replace(',', '.')) || 0;
      const perD = capW > 0 ? Math.round(capW / 6) : 0;
      setPlanningMsg(
        perD > 0
          ? `Мощность сохранена (~${perD} шт/день на 6 р.д., календарь/печать)`
          : 'Мощность сохранена'
      );
      setTimeout(() => setPlanningMsg(''), 4000);
    } catch (e) {
      setPlanningMsg(e?.message || 'Ошибка сохранения мощности');
      setTimeout(() => setPlanningMsg(''), 5000);
    } finally {
      setCapacitySaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!workshopId || (needsWorkshopFloor && !floorId)) {
      setPlanningMsg('Выберите цех и этаж для сохранения');
      setTimeout(() => setPlanningMsg(''), 4000);
      return;
    }
    const payloadRows = rows.map((r) => ({
      id: r.id,
      num: r.num,
      orderId: r.orderId,
      custIdx: r.custIdx,
      weeks: r.weeks,
    }));
    try {
      await api.planning.matrixSnapshotSave({
        month: monthKey,
        workshop_id: Number(workshopId),
        week_slice_start: weekSliceStart,
        ...(needsWorkshopFloor ? { floor_id: Number(floorId) } : {}),
        rows: payloadRows,
      });
      try {
        localStorage.setItem(draftKey, JSON.stringify(rows));
      } catch {
        /* ignore */
      }
      setPlanningMsg('Сохранено в базе данных');
      setTimeout(() => setPlanningMsg(''), 3500);
    } catch (e) {
      setPlanningMsg(e?.message || 'Ошибка сохранения на сервер');
      setTimeout(() => setPlanningMsg(''), 5000);
    }
  };

  const handlePrint = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!workshopId) {
      setPlanningMsg('Выберите цех для печати');
      setTimeout(() => setPlanningMsg(''), 4000);
      return;
    }
    if (needsWorkshopFloor && !floorId) {
      setPlanningMsg('Для этого цеха выберите этаж');
      setTimeout(() => setPlanningMsg(''), 4000);
      return;
    }
    if (!primaryWeekMonday) {
      setPlanningMsg('Выберите неделю для печати (поле «Неделя для мощности и печати»)');
      setTimeout(() => setPlanningMsg(''), 5000);
      return;
    }
    const qs = new URLSearchParams({ workshop_id: String(workshopId), week: primaryWeekMonday });
    if (floorId) qs.set('floor_id', String(floorId));
    const qq = debouncedSearch.trim();
    if (qq) qs.set('q', qq);
    const relPath = `print/planning/${monthKey}?${qs.toString()}`;
    const base = import.meta.env.BASE_URL || '/';
    const href = new URL(relPath, `${window.location.origin}${base}`).href;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Планирование производства
        </h1>
      </header>

      {planningMsg ? (
        <div
          className="border-b px-4 py-2 text-sm"
          style={{
            background: 'rgba(107,175,0,0.12)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
        >
          {planningMsg}
        </div>
      ) : null}

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

        {needsWorkshopFloor ? (
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
        ) : null}

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

        {ordersLoading ? (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Заказы…
          </span>
        ) : null}

        <select
          className="rounded border px-2 py-1.5 text-sm outline-none"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
            maxWidth: 220,
          }}
          value={String(primaryWeekIndex)}
          onChange={(e) => setPrimaryWeekIndex(parseInt(e.target.value, 10) || 0)}
          disabled={!workshopId || (needsWorkshopFloor && !floorId)}
          title="Неделя для загрузки/сохранения мощности и для печати"
        >
          {displayWeeks.map((w, i) => (
            <option key={i} value={String(i)} disabled={!w.dateFrom}>
              {w.dateFrom
                ? `Неделя ${w.weekNum} (${formatDdMm(w.dateFrom)}–${formatDdMm(w.dateTo)}) — мощность и печать`
                : '—'}
            </option>
          ))}
        </select>

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
          title="Мощность за неделю; в календаре и печати делится на 6 рабочих дней"
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
        {(() => {
          const capN = parseFloat(String(capacityInput).replace(',', '.'));
          if (!Number.isFinite(capN) || capN <= 0) return null;
          const perDay = Math.round(capN / 6);
          return (
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>
              → {perDay} шт/день (6 р.д.)
            </span>
          );
        })()}

        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
          disabled={capacitySaving || !workshopId || !primaryWeekMonday || (needsWorkshopFloor && !floorId)}
          onClick={handleSaveCapacity}
        >
          {capacitySaving ? 'Сохранение…' : 'Сохранить мощность'}
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
          onClick={handleSaveDraft}
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
          onClick={handlePrint}
        >
          🖨 Печать
        </button>
      </div>

      {/* Table */}
      <div
        ref={tableScrollRef}
        className="planning-draft-scroll overflow-auto"
        style={{ maxHeight: 'calc(100vh - 120px)' }}
      >
        <table
          className="border-collapse"
          style={{
            width: 'max-content',
            border: '1px solid var(--border)',
            borderColor: 'var(--border)',
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="sticky left-0 z-[150] px-1 text-xs font-medium"
                style={{
                  top: 0,
                  width: 36,
                  minWidth: 36,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  zIndex: 150,
                }}
              >
                №
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] px-1 text-xs font-medium"
                style={{
                  left: 36,
                  top: 0,
                  width: 60,
                  minWidth: 60,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  zIndex: 150,
                }}
              >
                Арт.
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] px-1 text-left text-xs font-medium"
                style={{
                  left: 96,
                  top: 0,
                  width: 220,
                  minWidth: 220,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  zIndex: 150,
                }}
              >
                Наименование ГП
              </th>
              <th
                rowSpan={3}
                className="sticky z-[150] px-1 text-xs font-medium"
                style={{
                  left: 316,
                  top: 0,
                  width: 100,
                  minWidth: 100,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
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
                  className="px-1 text-center text-xs font-medium"
                  style={{
                    border: '1px solid var(--border)',
                    borderLeft: '2px solid var(--accent)',
                    background:
                      wi === primaryWeekIndex && w.dateFrom
                        ? 'rgba(107,175,0,0.12)'
                        : 'var(--bg2)',
                    boxShadow:
                      wi === primaryWeekIndex && w.dateFrom
                        ? 'inset 0 -3px 0 0 var(--accent)'
                        : undefined,
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
                className="px-1 text-xs font-medium"
                style={{
                  width: 65,
                  minWidth: 65,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
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
                    className="px-1 text-center text-[10px] font-medium"
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '2px solid #e3b341',
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
                    className="px-1 text-center text-[10px] font-medium"
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '2px solid var(--accent)',
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
                    className="px-0.5 text-[10px] font-normal"
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '2px solid #e3b341',
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
                    className="px-0.5 text-[10px] font-normal"
                    style={{
                      border: '1px solid var(--border)',
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
                    className="px-0.5 text-[10px] font-normal"
                    style={{
                      border: '1px solid var(--border)',
                      borderLeft: '2px solid var(--accent)',
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
                    className="px-0.5 text-[10px] font-normal"
                    style={{
                      border: '1px solid var(--border)',
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
              const order = r.orderId != null ? orders.find((o) => o.id === r.orderId) : null;
              const art = order?.article || order?.tz_code || '';
              const total = rowSum(r);
              const meta = order ? orderMeta[order.id] : null;
              const overRemainder =
                meta != null && total > (meta.remainder ?? 0) + 1e-6;
              const dim =
                debouncedSearch.trim() && !rowMatchesFilter(r) ? 0.35 : 1;
              return (
                <tr
                  key={r.id}
                  className="group/row transition-colors"
                  style={{ borderBottom: '1px solid var(--border)', opacity: dim }}
                >
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky left-0 z-40 px-1 text-center text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      width: 36,
                      minWidth: 36,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {r.num}
                  </td>
                  <td
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 px-1 text-xs transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 36,
                      width: 60,
                      minWidth: 60,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
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
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 p-0 transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 96,
                      width: 220,
                      minWidth: 220,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      ref={(el) => {
                        cellRefs.current[r.id] = el;
                      }}
                      role="button"
                      tabIndex={0}
                      className="flex cursor-pointer items-start gap-1 px-1 py-1"
                      onClick={(e) => openOrderDropdown(r.id, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openOrderDropdown(r.id, e.currentTarget);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-xs"
                          style={{ color: order ? 'var(--text)' : 'var(--muted)' }}
                        >
                          {order ? (
                            orderDisplayName(order)
                          ) : (
                            <span className="italic">
                              {!workshopId
                                ? '— сначала выберите цех —'
                                : needsWorkshopFloor && !floorId
                                  ? '— выберите этаж —'
                                  : '— выберите заказ —'}
                            </span>
                          )}
                        </div>
                        {order && meta ? (
                          <div
                            className="mt-0.5 text-[9px] leading-tight"
                            style={{ color: 'var(--muted)' }}
                          >
                            Всего {meta.total_quantity} · запл. {meta.planned_quantity} · ост.{' '}
                            {meta.remainder}
                            {(order.model_type || 'regular') === 'set'
                              ? ' · комплект'
                              : ' · обычный'}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border text-[10px] leading-none transition-all"
                        style={{
                          borderColor:
                            openDropdown === r.id ? 'var(--accent)' : 'var(--border)',
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
                    className="group-hover/row:bg-[var(--surface2)] sticky z-40 p-0 transition-colors group-hover/row:!bg-[#1d2229]"
                    style={{
                      left: 316,
                      width: 100,
                      minWidth: 100,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
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
                        className="group-hover/row:bg-[var(--surface2)] p-0 transition-colors"
                        style={{
                          border: '1px solid var(--border)',
                          borderLeft: '2px solid #e3b341',
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
                        className="group-hover/row:bg-[var(--surface2)] p-0 text-center text-xs transition-colors"
                        style={{
                          border: '1px solid var(--border)',
                          background: 'rgba(227,179,65,0.06)',
                          color: 'var(--muted)',
                        }}
                      >
                        <div className="py-1.5">{w.pf || ''}</div>
                      </td>
                      <td
                        className="group-hover/row:bg-[var(--surface2)] p-0 transition-colors"
                        style={{
                          border: '1px solid var(--border)',
                          borderLeft: '2px solid var(--accent)',
                          background: 'var(--bg)',
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
                        className="group-hover/row:bg-[var(--surface2)] p-0 text-center text-xs transition-colors"
                        style={{
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--muted)',
                        }}
                      >
                        <div className="py-1.5">{w.mf || ''}</div>
                      </td>
                    </React.Fragment>
                  ))}
                  <td
                    className="group-hover/row:bg-[var(--surface2)] px-1 text-center text-xs font-bold transition-colors"
                    style={{
                      border: overRemainder
                        ? '2px solid #ef4444'
                        : '1px solid var(--border)',
                      color:
                        total === 0 ? 'var(--surface2)' : overRemainder ? '#f87171' : 'var(--accent)',
                      boxShadow: overRemainder ? 'inset 0 0 0 1px rgba(239,68,68,0.35)' : undefined,
                    }}
                    title={
                      overRemainder
                        ? 'Сумма по строке больше остатка заказа (мягкое предупреждение)'
                        : undefined
                    }
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
              {ordersLoading ? (
                <p className="px-2 py-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  Загрузка заказов…
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  Нет заказов для этого цеха
                  {needsWorkshopFloor ? ' и этажа' : ''}. Измените поиск или фильтры.
                </p>
              ) : null}
              {filteredOrders.map((o) => {
                const sel = rows.find((x) => x.id === openDropdown)?.orderId === o.id;
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
                    onClick={() => selectOrder(openDropdown, o)}
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
                    <span className="min-w-0 flex-1">
                      <span className="block">{orderDisplayName(o)}</span>
                      {orderMeta[o.id] ? (
                        <span
                          className="mt-0.5 block text-[10px]"
                          style={{ color: 'var(--muted)' }}
                        >
                          №{o.id} · ост. {orderMeta[o.id].remainder}
                          {(o.model_type || 'regular') === 'set' ? ' · комплект' : ''}
                        </span>
                      ) : null}
                    </span>
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
