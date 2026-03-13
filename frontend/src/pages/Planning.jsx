/**
 * Планирование — производственный календарь по дням.
 * ERP швейной фабрики: план по дням, мощность, inline editing.
 * Таблица: Заказ | Модель | Клиент | Пн | Вт | Ср | Чт | Пт | Сб | Итого
 * Summary: МОЩНОСТЬ, ЗАГРУЗКА, СВОБОДНО (красный при перегрузке).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const PLANNING_WORKSHOP_KEY = 'planning_workshop_id';
const PLANNING_FLOOR_KEY = 'planning_floor_id';

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
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [cellEdits, setCellEdits] = useState({});
  const saveTimeoutRef = useRef(null);

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const canEdit = ['admin', 'manager', 'technologist'].includes(user?.role);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

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
    (selectedWorkshop?.floors_count === 1 ||
      (selectedWorkshop?.floors_count === 4 && floorId));

  const loadData = useCallback(() => {
    if (!canLoad) return;
    setLoading(true);
    setErrorMsg('');
    const params = { month: monthKey, workshop_id: workshopId };
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
  }, [canLoad, monthKey, workshopId, floorId, selectedWorkshop?.floors_count, debouncedQ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getCellValue = (orderId, date) => {
    const key = `${orderId}_${date}`;
    if (cellEdits[key] !== undefined) return cellEdits[key];
    const row = data?.rows?.find((r) => r.order_id === orderId);
    const day = row?.days?.find((d) => d.date === date);
    return day?.planned_qty ?? 0;
  };

  const setCellValue = (orderId, date, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setCellEdits((prev) => ({ ...prev, [`${orderId}_${date}`]: num }));
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

  const monthLabel = monthKey
    ? new Date(monthKey + '-01').toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      })
    : '';

  const selectClass = (disabled) =>
    `px-3 py-2 rounded-lg border text-sm ${
      disabled
        ? 'bg-white/5 border-white/20 cursor-not-allowed text-white/50'
        : 'bg-white/10 border-white/25 text-white hover:border-white/40'
    }`;

  return (
    <div className="min-h-screen p-4">
      {/* Верхняя панель */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-semibold text-white">
          Планирование
        </h1>
        <div className="flex items-center gap-2">
          {canEdit && Object.keys(cellEdits).length > 0 && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? '...' : 'Сохранить'}
            </button>
          )}
          <Link
            to={`/print/planning/${monthKey}${workshopId ? `?workshop_id=${workshopId}` : ''}${floorId ? `&floor_id=${floorId}` : ''}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-1/40 text-white hover:bg-accent-1/50 font-medium text-sm"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2h-2m-4-1v8m0 0l-4-4m4 4l4-4"
              />
            </svg>
            Печать
          </Link>
        </div>
      </div>

      {/* Фильтры */}
      <div className="no-print flex flex-wrap items-center gap-4 mb-4">
        <div>
          <label className="block text-xs text-white/60 mb-0.5">Месяц</label>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className={selectClass(false)}
          />
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
            <label className="block text-xs text-white/60 mb-0.5">
              Этаж
            </label>
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
          <label className="block text-xs text-white/60 mb-0.5">
            Поиск
          </label>
          <input
            type="text"
            placeholder="клиент / модель"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="px-3 py-2 rounded-lg border border-white/25 bg-white/10 text-white placeholder-white/40 text-sm min-w-[180px]"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="no-print mb-3 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {!workshopId && (
        <div className="p-12 text-center text-white/60 rounded-xl border border-white/10">
          Выберите цех
        </div>
      )}

      {workshopId && !canLoad && selectedWorkshop?.floors_count === 4 && (
        <div className="p-12 text-center text-white/60 rounded-xl border border-white/10">
          Выберите этаж
        </div>
      )}

      {canLoad && (
        <div className="rounded-xl border border-white/25 overflow-hidden bg-[#1a1a1f]">
          {loading ? (
            <div className="p-12 text-center text-white/60">Загрузка...</div>
          ) : !data ? (
            <div className="p-12 text-center text-white/60">Нет данных</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/20 bg-white/5">
                    <th className="sticky left-0 z-20 bg-[#1a1a1f] px-3 py-2.5 text-left font-medium text-white/80 whitespace-nowrap border-r border-white/10 min-w-[120px]">
                      Заказ
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-white/80 min-w-[120px]">
                      Модель
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-white/80 min-w-[100px]">
                      Клиент
                    </th>
                    {dates.map((d) => (
                      <th
                        key={d.date}
                        className="px-2 py-2.5 text-center font-medium text-white/80 border-l border-white/10 min-w-[56px]"
                      >
                        <span className="block text-xs text-white/60">
                          {d.label}
                        </span>
                        <span>{d.dayNum}</span>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-medium text-white/80 border-l-2 border-white/20 min-w-[64px]">
                      Итого
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    let rowTotal = 0;
                    return (
                      <tr
                        key={row.order_id}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        <td className="sticky left-0 z-10 bg-[#1a1a1f] px-3 py-2 text-white border-r border-white/10">
                          {row.order_title}
                        </td>
                        <td className="px-3 py-2 text-white/90">
                          {row.model_name || '—'}
                        </td>
                        <td className="px-3 py-2 text-white/90">
                          {row.client_name}
                        </td>
                        {dates.map((d) => {
                          const val = getCellValue(row.order_id, d.date);
                          rowTotal += val;
                          return (
                            <td
                              key={d.date}
                              className="px-1 py-0.5 border-l border-white/10 align-middle"
                            >
                              {canEdit &&
                              data?.period?.status !== 'CLOSED' ? (
                                <input
                                  type="number"
                                  min="0"
                                  className="w-full min-w-[48px] px-1 py-1.5 text-center rounded bg-white/10 border border-white/20 text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  value={val}
                                  onChange={(e) =>
                                    setCellValue(
                                      row.order_id,
                                      d.date,
                                      e.target.value
                                    )
                                  }
                                  onBlur={() =>
                                    handleBlur(row.order_id, d.date)
                                  }
                                />
                              ) : (
                                <span className="block py-1.5 text-center">
                                  {val || '—'}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-semibold border-l-2 border-white/20 bg-white/5">
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })}
                  {/* МОЩНОСТЬ / ЗАГРУЗКА / СВОБОДНО */}
                  <tr className="border-t-2 border-white/20 bg-white/10 font-semibold">
                    <td
                      colSpan={3}
                      className="sticky left-0 z-10 bg-[#252530] px-3 py-2 text-white border-r border-white/10"
                    >
                      МОЩНОСТЬ
                    </td>
                    {dates.map((d) => (
                      <td
                        key={`cap_${d.date}`}
                        className="px-2 py-2 text-center border-l border-white/10"
                      >
                        {summary.capacity[d.date] ?? '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 border-l-2 border-white/20">—</td>
                  </tr>
                  <tr className="bg-white/5 font-semibold">
                    <td
                      colSpan={3}
                      className="sticky left-0 z-10 bg-[#252530] px-3 py-2 text-white border-r border-white/10"
                    >
                      ЗАГРУЗКА
                    </td>
                    {dates.map((d) => (
                      <td
                        key={`load_${d.date}`}
                        className="px-2 py-2 text-center border-l border-white/10"
                      >
                        {summary.load[d.date] ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 border-l-2 border-white/20">
                      {Object.values(summary.load || {}).reduce(
                        (a, b) => a + (b || 0),
                        0
                      )}
                    </td>
                  </tr>
                  <tr className="bg-white/5 font-semibold">
                    <td
                      colSpan={3}
                      className="sticky left-0 z-10 bg-[#252530] px-3 py-2 text-white border-r border-white/10"
                    >
                      СВОБОДНО
                    </td>
                    {dates.map((d) => {
                      const free = summary.free[d.date];
                      const isOverload = free != null && free < 0;
                      return (
                        <td
                          key={`free_${d.date}`}
                          className={`px-2 py-2 text-center border-l border-white/10 ${
                            isOverload
                              ? 'bg-red-500/30 text-red-300'
                              : ''
                          }`}
                        >
                          {free != null ? free : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-l-2 border-white/20">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
