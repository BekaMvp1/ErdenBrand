/**
 * Планирование — производственный календарь по неделям.
 * ERP швейной фабрики: план по дням недели, мощность, inline editing.
 * Таблица: Заказ | Модель | Клиент | Пн | Вт | Ср | Чт | Пт | Сб | Итого
 * Summary: МОЩНОСТЬ, ЗАГРУЗКА, СВОБОДНО.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import ModelPhoto from '../components/ModelPhoto';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';

const PLANNING_WORKSHOP_KEY = 'planning_workshop_id';
const PLANNING_FLOOR_KEY = 'planning_floor_id';
const PLANNING_CELL_EDITS_KEY = 'planning_cell_edits';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** Понедельник недели для даты (ISO, Пн = 1) */
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Даты недели (Пн–Сб, 6 рабочих дней) */
function getWeekDates(weekStart) {
  const dates = [];
  const d = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 6; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Список недель месяца: [{ weekNum, label, dateFrom, dateTo }] */
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

/** Предыдущий/следующий месяц YYYY-MM */
function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Planning() {
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [floors, setFloors] = useState([]);
  const [floorId, setFloorId] = useState('');
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [weekNum, setWeekNum] = useState(1);
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const loadCellEdits = () => {
    try {
      const s = sessionStorage.getItem(PLANNING_CELL_EDITS_KEY);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  };
  const [cellEdits, setCellEdits] = useState(loadCellEdits);
  const saveTimeoutRef = useRef(null);
  const [capacityWeekInput, setCapacityWeekInput] = useState('');
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [splitOrder, setSplitOrder] = useState(null);
  const [splitParts, setSplitParts] = useState([]);
  const [splitSaving, setSplitSaving] = useState(false);

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const WORKING_DAYS_PER_WEEK = 6;
  const canEdit = ['admin', 'manager', 'technologist'].includes(user?.role);

  const weeks = getWeeksInMonth(monthKey);
  const selectedWeek = weeks.find((w) => w.weekNum === weekNum) || weeks[0];

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (weeks.length > 0 && !weeks.some((w) => w.weekNum === weekNum)) {
      setWeekNum(weeks[0].weekNum);
    }
  }, [monthKey, weeks, weekNum]);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLANNING_WORKSHOP_KEY);
      if (saved && workshops.some((w) => String(w.id) === saved))
        setWorkshopId(saved);
    } catch (_) {}
  }, [workshops]);

  useEffect(() => {
    if (!workshopId) {
      setSelectedWorkshop(null);
      setFloors([]);
      setFloorId('');
      return;
    }
    const w = workshops.find((x) => String(x.id) === String(workshopId));
    setSelectedWorkshop(w || null);
    if (w?.floors_count === 4) {
      api.planning.floors(workshopId).then((f) => {
        const list = f || [];
        setFloors(list);
        try {
          const saved = localStorage.getItem(PLANNING_FLOOR_KEY);
          const def =
            saved && list.some((x) => String(x.id) === saved)
              ? saved
              : list[0]?.id ?? '';
          setFloorId(String(def));
        } catch {
          setFloorId(list[0]?.id ?? '');
        }
      }).catch(() => setFloors([]));
    } else {
      setFloors([]);
      setFloorId('');
    }
  }, [workshopId, workshops]);

  useEffect(() => {
    try {
      if (workshopId) localStorage.setItem(PLANNING_WORKSHOP_KEY, workshopId);
      if (floorId) localStorage.setItem(PLANNING_FLOOR_KEY, floorId);
    } catch (_) {}
  }, [workshopId, floorId]);

  const canLoad =
    workshopId &&
    monthKey &&
    selectedWeek &&
    (selectedWorkshop?.floors_count === 1 ||
      (selectedWorkshop?.floors_count === 4 && floorId));

  const dateFrom = selectedWeek?.dateFrom;
  const dateTo = selectedWeek?.dateTo;

  const loadData = useCallback(() => {
    if (!canLoad || !dateFrom || !dateTo) return;
    setLoading(true);
    setErrorMsg('');
    const params = {
      month: monthKey,
      workshop_id: workshopId,
      date_from: dateFrom,
      date_to: dateTo,
    };
    if (selectedWorkshop?.floors_count === 4 && floorId)
      params.floor_id = floorId;
    if (debouncedQ) params.q = debouncedQ;
    api.planning
      .calendar(params)
      .then(setData)
      .catch((err) => {
        setData(null);
        setErrorMsg(err.message || 'Ошибка загрузки');
      })
      .finally(() => setLoading(false));
  }, [canLoad, monthKey, workshopId, floorId, selectedWorkshop?.floors_count, debouncedQ, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Показать текущую мощность на неделю из загруженных данных
  useEffect(() => {
    const dts = data?.dates ?? [];
    const sum = data?.summary ?? {};
    if (dts.length > 0 && sum.capacity) {
      const firstDate = typeof dts[0] === 'string' ? dts[0] : dts[0]?.date;
      const cap = firstDate != null ? (sum.capacity[firstDate] ?? 0) : 0;
      const weekCap = Math.round((Number(cap) || 0) * WORKING_DAYS_PER_WEEK);
      setCapacityWeekInput(weekCap > 0 ? String(weekCap) : '');
    } else {
      setCapacityWeekInput('');
    }
  }, [data?.dates, data?.summary]);

  const saveCapacityWeek = async () => {
    if (!canEdit || !canLoad || !dateFrom) return;
    const val = Math.max(0, parseInt(capacityWeekInput, 10) || 0);
    setCapacitySaving(true);
    setErrorMsg('');
    try {
      await api.planning.saveCapacity({
        workshop_id: Number(workshopId),
        floor_id: selectedWorkshop?.floors_count === 4 && floorId ? Number(floorId) : undefined,
        week_start: dateFrom,
        capacity_week: val,
      });
      loadData();
    } catch (err) {
      setErrorMsg(err?.message || 'Ошибка сохранения мощности');
    } finally {
      setCapacitySaving(false);
    }
  };

  const getCellValue = (orderId, date) => {
    const key = `${orderId}_${date}`;
    if (cellEdits[key] !== undefined) return cellEdits[key];
    const row = data?.rows?.find((r) => r.order_id === orderId);
    const day = row?.days?.find((d) => d.date === date);
    return day?.planned_qty ?? 0;
  };

  const setCellValue = (orderId, date, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setCellEdits((prev) => {
      const next = { ...prev, [`${orderId}_${date}`]: num };
      try { sessionStorage.setItem(PLANNING_CELL_EDITS_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() =>
      saveCell(orderId, date, num), 800
    );
  };

  const saveCell = async (orderId, date, plannedQty) => {
    if (!canEdit || (selectedWorkshop?.floors_count === 4 && !floorId)) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await api.planning.planDay({
        order_id: orderId,
        floor_id:
          selectedWorkshop?.floors_count === 4 ? floorId : null,
        date,
        planned_qty: plannedQty,
      });
      setCellEdits((prev) => {
        const next = { ...prev };
        delete next[`${orderId}_${date}`];
        try { sessionStorage.setItem(PLANNING_CELL_EDITS_KEY, JSON.stringify(next)); } catch (_) {}
        return next;
      });
      loadData();
    } catch (err) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = (orderId, date) => {
    const key = `${orderId}_${date}`;
    if (cellEdits[key] === undefined) return;
    const val = cellEdits[key];
    saveCell(orderId, date, val);
  };

  const goPrevWeek = () => {
    const idx = weeks.findIndex((w) => w.weekNum === weekNum);
    if (idx > 0) {
      setWeekNum(weeks[idx - 1].weekNum);
    } else {
      const prevMonth = addMonths(monthKey, -1);
      setMonthKey(prevMonth);
      const prevWeeks = getWeeksInMonth(prevMonth);
      setWeekNum(prevWeeks[prevWeeks.length - 1]?.weekNum ?? 1);
    }
  };

  const goNextWeek = () => {
    const idx = weeks.findIndex((w) => w.weekNum === weekNum);
    if (idx >= 0 && idx < weeks.length - 1) {
      setWeekNum(weeks[idx + 1].weekNum);
    } else {
      const nextMonth = addMonths(monthKey, 1);
      setMonthKey(nextMonth);
      const nextWeeks = getWeeksInMonth(nextMonth);
      setWeekNum(nextWeeks[0]?.weekNum ?? 1);
    }
  };

  const openSplitModal = (row) => {
    setSplitOrder(row);
    const parts = (row.order_parts || []).map((p) => ({ part_name: p.part_name, floor_id: String(p.floor_id) }));
    setSplitParts(parts.length > 0 ? parts : [{ part_name: '', floor_id: String(floors[0]?.id ?? '2') }]);
  };
  const closeSplitModal = () => {
    setSplitOrder(null);
    setSplitParts([]);
  };
  const addSplitPart = () => {
    setSplitParts((prev) => [...prev, { part_name: '', floor_id: String(floors[0]?.id ?? '') }]);
  };
  const removeSplitPart = (idx) => {
    setSplitParts((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateSplitPart = (idx, field, value) => {
    setSplitParts((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const saveSplitParts = async () => {
    if (!splitOrder) return;
    const valid = splitParts.filter((p) => String(p.part_name || '').trim());
    if (valid.length === 0 && splitParts.length > 0) {
      setErrorMsg('Укажите название для каждой части или удалите пустые');
      return;
    }
    setSplitSaving(true);
    setErrorMsg('');
    try {
      await api.orders.updateParts(splitOrder.order_id, valid.map((p) => ({
        part_name: String(p.part_name).trim(),
        floor_id: parseInt(p.floor_id, 10) || 1,
      })));
      closeSplitModal();
      loadData();
    } catch (err) {
      setErrorMsg(err?.message || 'Ошибка сохранения');
    } finally {
      setSplitSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const keys = Object.keys(cellEdits);
    if (keys.length === 0) return;
    setSaving(true);
    setErrorMsg('');
    for (const key of keys) {
      const [orderId, date] = key.split('_');
      const val = cellEdits[key];
      try {
        await api.planning.planDay({
          order_id: Number(orderId),
          floor_id:
            selectedWorkshop?.floors_count === 4 ? floorId : null,
          date,
          planned_qty: val,
        });
      } catch (err) {
        setErrorMsg(err.message || 'Ошибка сохранения');
        break;
      }
    }
    setCellEdits({});
    loadData();
    setSaving(false);
  };

  const dates = data?.dates ?? [];
  const summary = data?.summary ?? { capacity: {}, load: {}, free: {} };
  const rows = data?.rows ?? [];
  const { registerRef, handleKeyDown } = useGridNavigation(rows.length, dates.length);

  const monthLabel = monthKey
    ? new Date(monthKey + '-01').toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      })
    : '';

  const selectClass = (disabled) =>
    `px-2 py-1.5 rounded border text-sm ${
      disabled
        ? 'bg-white/5 border-white/20 cursor-not-allowed text-white/50'
        : 'bg-white/10 border-white/25 text-white hover:border-white/40'
    }`;

  return (
    <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 overflow-x-hidden">
      {/* Заголовок */}
      <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold text-white mb-3">
        Планирование
      </h1>

      {/* Фильтры: Месяц | Неделя | Цех | Этаж | Поиск */}
      <div className="no-print flex flex-col md:flex-row flex-wrap md:items-end gap-3 mb-3 overflow-visible">
        <div>
          <label className="block text-xs text-white/60 mb-0.5">Месяц</label>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className={selectClass(false)}
          />
        </div>
        <div className="relative z-[100]">
          <label className="block text-xs text-white/60 mb-0.5">Неделя</label>
          <select
            value={weekNum}
            onChange={(e) => setWeekNum(Number(e.target.value))}
            className={`${selectClass(false)} min-w-[120px] appearance-none bg-white/10`}
            style={{ colorScheme: 'dark' }}
          >
            {weeks.map((w) => (
              <option key={w.weekNum} value={w.weekNum} className="bg-[#1e293b] text-white">
                {w.label} ({w.dateFrom?.slice(5, 10)} – {w.dateTo?.slice(5, 10)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-0.5">Цех</label>
          <select
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            className={selectClass(false)}
          >
            <option value="">Выберите цех</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        {selectedWorkshop?.floors_count === 4 && (
          <div>
            <label className="block text-xs text-white/60 mb-0.5">Этаж</label>
            <select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className={selectClass(!floors.length)}
            >
              <option value="">Выберите этаж</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 1 ? '1 (Финиш)' : f.name || `Этаж ${f.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-white/60 mb-0.5">Поиск</label>
          <input
            type="text"
            placeholder="клиент / модель"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="px-2 py-1.5 rounded border border-white/25 bg-white/10 text-white placeholder-white/40 text-sm min-w-[140px]"
          />
        </div>
      </div>

      {/* Кнопки: Предыдущая | Следующая | Сохранить | Печать */}
      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={goPrevWeek}
          disabled={!canLoad}
          className="px-3 py-1.5 rounded border border-white/25 bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          <span>←</span> Предыдущая неделя
        </button>
        <button
          type="button"
          onClick={goNextWeek}
          disabled={!canLoad}
          className="px-3 py-1.5 rounded border border-white/25 bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          Следующая неделя <span>→</span>
        </button>
        {canEdit && canLoad && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-white/60 whitespace-nowrap">Мощность на неделю (шт.):</label>
            <input
              type="number"
              min={0}
              value={numInputValue(capacityWeekInput)}
              onChange={(e) => setCapacityWeekInput(e.target.value)}
              placeholder="0"
              className="w-24 px-2 py-1.5 rounded border border-white/25 bg-white/10 text-white text-sm"
            />
            <button
              type="button"
              onClick={saveCapacityWeek}
              disabled={capacitySaving}
              className="px-3 py-1.5 rounded border border-white/25 bg-blue-600/80 text-white text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {capacitySaving ? 'Сохранение...' : 'Сохранить мощность'}
            </button>
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || Object.keys(cellEdits).length === 0}
            className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        )}
        <Link
          to={(() => {
            const qs = new URLSearchParams();
            if (workshopId) qs.set('workshop_id', workshopId);
            if (floorId) qs.set('floor_id', floorId);
            if (selectedWeek?.dateFrom) qs.set('week', selectedWeek.dateFrom);
            if (debouncedQ) qs.set('q', debouncedQ);
            const qstr = qs.toString();
            return `/print/planning/${monthKey}${qstr ? `?${qstr}` : ''}`;
          })()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-1/40 text-white hover:bg-accent-1/50 font-medium text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2h-2m-4-1v8m0 0l-4-4m4 4l4-4" />
          </svg>
          Печать
        </Link>
      </div>

      {errorMsg && (
        <div className="no-print mb-2 px-3 py-1.5 rounded bg-red-500/20 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {!workshopId && (
        <div className="p-8 text-center text-white/60 rounded-lg border border-white/10 text-sm">
          Выберите цех
        </div>
      )}

      {workshopId && !canLoad && selectedWorkshop?.floors_count === 4 && (
        <div className="p-8 text-center text-white/60 rounded-lg border border-white/10 text-sm">
          Выберите этаж
        </div>
      )}

      {canLoad && (
        <div className="rounded-lg border border-white/25 overflow-hidden bg-[#1a1a1f]">
          {loading ? (
            <div className="p-8 text-center text-white/60 text-sm">Загрузка...</div>
          ) : !data ? (
            <div className="p-8 text-center text-white/60 text-sm">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/20 bg-white/5">
                    <th className="sticky left-0 z-20 bg-[#1a1a1f] px-2 py-1.5 text-left font-medium text-white/80 whitespace-nowrap border-r border-white/10 min-w-[100px]">
                      Заказ
                    </th>
                    {canEdit && selectedWorkshop?.floors_count === 4 && (
                      <th className="px-2 py-1.5 text-left font-medium text-white/80 min-w-[90px]">
                        Действия
                      </th>
                    )}
                    <th className="px-2 py-1.5 text-left font-medium text-white/80 min-w-[100px]">
                      Модель
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium text-white/80 min-w-[80px]">
                      Клиент
                    </th>
                    {dates.map((d, i) => (
                      <th
                        key={d.date}
                        className="px-1 py-1.5 text-center font-medium text-white/80 border-l border-white/10 min-w-[44px]"
                      >
                        <span className="block text-[10px] text-white/60">
                          {DAY_LABELS[i] ?? d.label}
                        </span>
                        <span>{d.dayNum}</span>
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-medium text-white/80 border-l-2 border-white/20 min-w-[52px]">
                      Итого
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4 + (canEdit && selectedWorkshop?.floors_count === 4 ? 1 : 0) + (dates?.length || 0) + 1} className="px-4 py-8 text-center text-white/60 text-sm">
                        Нет заказов для выбранного этажа. Назначьте этаж заказам в карточке заказа или выберите другой этаж.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((row, rowIdx) => {
                    let rowTotal = 0;
                    return (
                      <tr
                        key={row.order_id}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="sticky left-0 z-10 bg-[#1a1a1f] px-2 py-1.5 text-white border-r border-white/10 text-xs">
                          <ModelPhoto
                            photo={row.order_photos?.[0]}
                            modelName={row.order_title}
                            size={48}
                          />
                        </td>
                        {canEdit && selectedWorkshop?.floors_count === 4 && (
                          <td className="px-2 py-1.5 text-white/80 text-xs">
                            <button
                              type="button"
                              onClick={() => openSplitModal(row)}
                              className="text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              Разделить заказ
                            </button>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-white/90 text-xs">
                          {row.model_name || '—'}
                          {row.total_quantity != null && row.total_quantity > 0 && (
                            <span className="ml-1.5 text-white/60 font-medium">({row.total_quantity})</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-white/90 text-xs">
                          {row.client_name}
                        </td>
                        {dates.map((d, dateIdx) => {
                          const val = getCellValue(row.order_id, d.date);
                          rowTotal += val;
                          return (
                            <td
                              key={d.date}
                              className="px-0.5 py-0.5 border-l border-white/10 align-middle"
                            >
                              {canEdit && data?.period?.status !== 'CLOSED' ? (
                                <input
                                  ref={registerRef(rowIdx, dateIdx)}
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  className="w-full min-w-[36px] px-1 py-1 text-center rounded bg-white/10 border border-white/20 text-white text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  value={numInputValue(val)}
                                  onChange={(e) =>
                                    setCellValue(row.order_id, d.date, e.target.value)
                                  }
                                  onKeyDown={handleKeyDown(rowIdx, dateIdx)}
                                  onBlur={() => handleBlur(row.order_id, d.date)}
                                />
                              ) : (
                                <span className="block py-1 text-center text-xs">
                                  {val || '—'}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-semibold border-l-2 border-white/20 bg-white/5 text-xs">
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })}
                  {/* МОЩНОСТЬ / ЗАГРУЗКА / СВОБОДНО */}
                  <tr className="border-t-2 border-white/20 bg-white/10 font-semibold text-xs">
                    <td colSpan={3} className="sticky left-0 z-10 bg-[#252530] px-2 py-1.5 text-white border-r border-white/10">
                      МОЩНОСТЬ
                    </td>
                    {dates.map((d) => (
                      <td key={`cap_${d.date}`} className="px-1 py-1.5 text-center border-l border-white/10">
                        {summary.capacity[d.date] ?? '—'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 border-l-2 border-white/20">—</td>
                  </tr>
                  <tr className="bg-white/5 font-semibold text-xs">
                    <td colSpan={3} className="sticky left-0 z-10 bg-[#252530] px-2 py-1.5 text-white border-r border-white/10">
                      ЗАГРУЗКА
                    </td>
                    {dates.map((d) => {
                      const load = summary.load[d.date] ?? 0;
                      const cap = summary.capacity[d.date];
                      const isOverload = cap != null && load > cap;
                      const isUnderload = cap != null && load < cap;
                      const loadClass = isOverload ? 'bg-red-500/30 text-red-300' : isUnderload ? 'bg-green-500/20 text-green-300' : '';
                      return (
                        <td
                          key={`load_${d.date}`}
                          className={`px-1 py-1.5 text-center border-l border-white/10 ${loadClass}`}
                        >
                          {load}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 border-l-2 border-white/20">
                      {Object.values(summary.load || {}).reduce((a, b) => a + (b || 0), 0)}
                    </td>
                  </tr>
                  <tr className="bg-white/5 font-semibold text-xs">
                    <td colSpan={3} className="sticky left-0 z-10 bg-[#252530] px-2 py-1.5 text-white border-r border-white/10">
                      СВОБОДНО
                    </td>
                    {dates.map((d) => {
                      const free = summary.free[d.date];
                      const cap = summary.capacity[d.date];
                      const isOverload = free != null && free < 0;
                      const hasCapacity = cap != null;
                      const isFree = hasCapacity && free != null && free > 0;
                      const cellClass = isOverload
                        ? 'bg-red-500/30 text-red-300'
                        : isFree
                          ? 'bg-green-500/20 text-green-300'
                          : '';
                      return (
                        <td
                          key={`free_${d.date}`}
                          className={`px-1 py-1.5 text-center border-l border-white/10 ${cellClass}`}
                        >
                          {free != null ? free : '—'}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 border-l-2 border-white/20">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {splitOrder && createPortal(
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={closeSplitModal}
        >
          <div
            className="bg-[#1a1a1f] rounded-xl border border-white/25 p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Разделить заказ</h3>
            <p className="text-white/70 text-sm mb-4">{splitOrder.order_title}</p>
            <div className="space-y-3 mb-4">
              {splitParts.map((p, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Название части (напр. Пиджак)"
                    value={p.part_name}
                    onChange={(e) => updateSplitPart(idx, 'part_name', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/25 text-white text-sm placeholder-white/40"
                  />
                  <select
                    value={p.floor_id}
                    onChange={(e) => updateSplitPart(idx, 'floor_id', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/25 text-white text-sm min-w-[120px]"
                  >
                    {floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.id === 1 ? '1 (Финиш)' : f.name || `Этаж ${f.id}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSplitPart(idx)}
                    className="p-2 rounded text-red-400 hover:bg-red-500/20"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplitPart}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Добавить часть
              </button>
            </div>
            <p className="text-white/50 text-xs mb-4">
              Пустой список — заказ не разделён. После сохранения каждая часть будет отображаться на своём этаже.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeSplitModal}
                className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveSplitParts}
                disabled={splitSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {splitSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
