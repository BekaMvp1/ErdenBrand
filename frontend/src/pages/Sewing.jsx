/**
 * Пошив — ERP швейной фабрики.
 * Матрица цвет×размер из раскроя или заказа.
 * Раскроено, Сшито, Доступно (остаток = раскроено − сшито).
 * Система гибкая: факт может отличаться от плана — без блокировок.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import ModelPhoto from '../components/ModelPhoto';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}
const SEWING_MATRIX_STORAGE_KEY = 'sewing_matrix_inputs';
const SEWING_FACT_INPUT_STORAGE_KEY = 'sewing_fact_input';
const SEWING_SEARCH_KEY = 'sewing_search';
const SEWING_WORKSHOP_KEY = 'sewing_workshop_id';

function getWeekEnd() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export default function Sewing() {
  const navigate = useNavigate();
  const [q, setQ] = useState(() => {
    try { return sessionStorage.getItem(SEWING_SEARCH_KEY) || ''; } catch { return ''; }
  });
  const [debouncedQ, setDebouncedQ] = useState('');
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState(() => {
    try { return sessionStorage.getItem(SEWING_WORKSHOP_KEY) || ''; } catch { return ''; }
  });
  const [boardData, setBoardData] = useState({ floors: [], period: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [matrixData, setMatrixData] = useState(null);
  const [matrixInputs, setMatrixInputs] = useState({});
  const [factInput, setFactInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [expandedItemKey, setExpandedItemKey] = useState(null);
  const [completedBatchId, setCompletedBatchId] = useState(null);
  const matrixInputsCacheRef = React.useRef({});
  const factInputCacheRef = React.useRef({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    try { sessionStorage.setItem(SEWING_SEARCH_KEY, q || ''); } catch (_) {}
  }, [q]);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(SEWING_WORKSHOP_KEY, workshopId || ''); } catch (_) {}
  }, [workshopId]);

  const loadBoard = useCallback(() => {
    setLoading(true);
    setError('');
    api.sewing
      .board({
        date_from: getWeekStart(),
        date_to: getWeekEnd(),
        status: 'ALL',
        q: debouncedQ || undefined,
        workshop_id: workshopId || undefined,
      })
      .then((res) =>
        setBoardData({ floors: res.floors || [], period: res.period || {} })
      )
      .catch((err) => setError(err.message || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [debouncedQ, workshopId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const loadMatrix = useCallback(async (order_id, floor_id, options = {}) => {
    const { preserveInputs = false } = options;
    const cacheKey = `${order_id}-${floor_id}`;
    try {
      const data = await api.sewing.matrix({ order_id, floor_id });
      setMatrixData(data);
      if (!preserveInputs) {
        const sewnByColorSize = data.sewnByColorSize || {};
        let init = matrixInputsCacheRef.current[cacheKey];
        if (!init) {
          try {
            const stored = sessionStorage.getItem(SEWING_MATRIX_STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              init = parsed[cacheKey] || {};
            }
          } catch (_) {}
        }
        init = init || {};
        (data.colors || []).forEach((color) => {
          (data.sizes || []).forEach((size) => {
            const k = `${color}|${size}`;
            if (init[k] === undefined) {
              const saved = sewnByColorSize[k];
              init[k] = saved !== undefined && saved !== null && Number(saved) >= 0 ? String(saved) : '';
            }
          });
        });
        setMatrixInputs(init);
      }
    } catch (err) {
      setMatrixData(null);
      setError(err.message || 'Ошибка загрузки матрицы');
    }
  }, []);

  const allItems = (boardData.floors || []).flatMap((f) =>
    (f.items || []).map((item) => ({ ...item, floor_id: f.floor_id }))
  );

  const getItemKey = (item) => `${item.order_id}-${item.floor_id}`;

  const handleToggleExpand = (item) => {
    if (item.status === 'DONE') {
      if (item.done_batch_id) navigate(`/qc?batch_id=${item.done_batch_id}`);
      return;
    }
    const key = getItemKey(item);
    if (expandedItemKey === key) {
      if (selectedItem) {
        const k = getItemKey(selectedItem);
        factInputCacheRef.current[k] = factInput;
        try {
          const stored = sessionStorage.getItem(SEWING_FACT_INPUT_STORAGE_KEY);
          const parsed = stored ? JSON.parse(stored) : {};
          parsed[k] = factInput;
          sessionStorage.setItem(SEWING_FACT_INPUT_STORAGE_KEY, JSON.stringify(parsed));
        } catch (_) {}
      }
      setExpandedItemKey(null);
      setSelectedItem(null);
      setMatrixData(null);
      setFactInput('');
    } else {
      setExpandedItemKey(key);
      setSelectedItem(item);
      setMatrixData(null);
      let factVal = factInputCacheRef.current[key];
      if (factVal === undefined) {
        try {
          const stored = sessionStorage.getItem(SEWING_FACT_INPUT_STORAGE_KEY);
          if (stored) factVal = JSON.parse(stored)[key];
        } catch (_) {}
      }
      setFactInput(factVal ?? '');
      loadMatrix(item.order_id, item.floor_id);
    }
  };

  const getCellValue = (color, size) => {
    const key = `${color}|${size}`;
    const v = matrixInputs[key];
    return Math.max(0, parseInt(String(v), 10) || 0);
  };

  const setCellValue = (color, size, value) => {
    const key = `${color}|${size}`;
    const val = value === '' ? '' : String(value);
    setMatrixInputs((prev) => {
      const next = { ...prev, [key]: val };
      if (selectedItem) {
        const cacheKey = `${selectedItem.order_id}-${selectedItem.floor_id}`;
        if (!matrixInputsCacheRef.current[cacheKey]) matrixInputsCacheRef.current[cacheKey] = {};
        matrixInputsCacheRef.current[cacheKey] = { ...matrixInputsCacheRef.current[cacheKey], ...next };
        try {
          const stored = sessionStorage.getItem(SEWING_MATRIX_STORAGE_KEY);
          const parsed = stored ? JSON.parse(stored) : {};
          parsed[cacheKey] = matrixInputsCacheRef.current[cacheKey];
          sessionStorage.setItem(SEWING_MATRIX_STORAGE_KEY, JSON.stringify(parsed));
        } catch (_) {}
      }
      return next;
    });
  };

  const colors = matrixData?.colors ?? [];
  const sizes = matrixData?.sizes ?? [];
  const cutByColorSize = matrixData?.cutByColorSize ?? {};
  const cutTotal = matrixData?.cut_total ?? 0;
  const sewn = matrixData?.sewn ?? 0;
  const available = matrixData?.available ?? 0;
  const hasMatrix = colors.length > 0 && sizes.length > 0;
  const simpleInputQty = Math.max(0, parseInt(String(factInput), 10) || 0);
  const { registerRef, handleKeyDown } = useGridNavigation(colors.length, sizes.length);

  const rowTotals = {};
  const colTotals = {};
  let grandTotal = 0;
  colors.forEach((color) => {
    let r = 0;
    sizes.forEach((size) => {
      const v = getCellValue(color, size);
      r += v;
      colTotals[size] = (colTotals[size] || 0) + v;
      grandTotal += v;
    });
    rowTotals[color] = r;
  });

  const handleSave = async () => {
    if (!selectedItem) return;
    if (hasMatrix) {
      if (grandTotal <= 0) return;
      // Система гибкая: факт может отличаться от раскроя — без блокировки
    } else {
      if (simpleInputQty <= 0) return;
      // Система гибкая: допускаем ввод, отличающийся от доступного
    }

    setSaving(true);
    setError('');
    try {
      if (hasMatrix) {
        const items = [];
        colors.forEach((color) => {
          sizes.forEach((size) => {
            const qty = getCellValue(color, size);
            if (qty > 0) items.push({ color, size, fact_qty: qty });
          });
        });
        await api.sewing.factMatrix({
          order_id: selectedItem.order_id,
          floor_id: selectedItem.floor_id,
          items,
        });
      } else {
        await api.sewing.factAdd({
          order_id: selectedItem.order_id,
          floor_id: selectedItem.floor_id,
          add_qty: simpleInputQty,
        });
      }
      setSuccessMsg('Сохранено');
      setTimeout(() => setSuccessMsg(''), 2000);
      await loadBoard();
      await loadMatrix(selectedItem.order_id, selectedItem.floor_id, { preserveInputs: true });
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedItem) return;
    const totalNewInput = hasMatrix ? grandTotal : simpleInputQty;
    // Система гибкая: факт может отличаться от раскроя — без блокировки
    if (sewn <= 0 && totalNewInput <= 0) {
      setError('Нет сшитых единиц для отправки в ОТК.');
      return;
    }
    const items = [];
    if (hasMatrix) {
      colors.forEach((color) => {
        sizes.forEach((size) => {
          const qty = getCellValue(color, size);
          if (qty > 0) items.push({ color, size, fact_qty: qty });
        });
      });
    }

    setCompleting(true);
    setError('');
    try {
      if (totalNewInput > 0) {
        if (hasMatrix && items.length > 0) {
          await api.sewing.factMatrix({
            order_id: selectedItem.order_id,
            floor_id: selectedItem.floor_id,
            items,
          });
        } else {
          await api.sewing.factAdd({
            order_id: selectedItem.order_id,
            floor_id: selectedItem.floor_id,
            add_qty: simpleInputQty,
          });
        }
      }
      const res = await api.sewing.complete({
        order_id: selectedItem.order_id,
        floor_id: selectedItem.floor_id,
        date_from: getWeekStart(),
        date_to: getWeekEnd(),
        items: hasMatrix && items.length > 0 ? items : undefined,
      });
      setSuccessMsg('Партия отправлена в ОТК');
      setCompletedBatchId(res?.batch_id || null);
      const cacheKey = `${selectedItem.order_id}-${selectedItem.floor_id}`;
      const itemKey = getItemKey(selectedItem);
      delete matrixInputsCacheRef.current[cacheKey];
      delete factInputCacheRef.current[itemKey];
      try {
        const m = sessionStorage.getItem(SEWING_MATRIX_STORAGE_KEY);
        if (m) {
          const p = JSON.parse(m);
          delete p[cacheKey];
          sessionStorage.setItem(SEWING_MATRIX_STORAGE_KEY, JSON.stringify(p));
        }
        const f = sessionStorage.getItem(SEWING_FACT_INPUT_STORAGE_KEY);
        if (f) {
          const pf = JSON.parse(f);
          delete pf[itemKey];
          sessionStorage.setItem(SEWING_FACT_INPUT_STORAGE_KEY, JSON.stringify(pf));
        }
      } catch (_) {}
      setExpandedItemKey(null);
      setSelectedItem(null);
      setMatrixData(null);
      setFactInput('');
      loadBoard();
    } catch (err) {
      setError(err.message || err.error || 'Ошибка завершения');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="p-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-semibold text-white">Пошив</h1>
        <div className="flex gap-2 items-center">
          <select
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white min-w-[160px]"
          >
            <option value="">Все цеха</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <PrintButton />
          <Link
          to="/qc"
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15"
          >
            ОТК
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Поиск: клиент / модель"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm min-w-[200px] placeholder-white/40"
        />
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-400">{error}</div>
      )}
      {successMsg && (
        <div className="mb-3 text-sm text-green-400">
          {successMsg}
          {completedBatchId && (
            <Link
              to={`/qc?batch_id=${completedBatchId}`}
              className="ml-2 text-primary-400 hover:underline"
            >
              Перейти в ОТК →
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-white/60">Загрузка...</div>
      ) : (
        <div className="print-area overflow-x-auto rounded-xl border border-white/25 bg-[#1a1a1f]">
          {boardData.floors?.some((f) => f.capacity_per_day) && (
            <div className="flex flex-wrap gap-4 px-4 py-2 text-sm text-white/70 border-b border-white/10">
              Мощность этажей:
              {(boardData.floors || []).map((f) =>
                f.capacity_per_day ? (
                  <span key={f.floor_id}>
                    {f.floor_id} этаж — {f.capacity_per_day} шт/день
                  </span>
                ) : null
              )}
            </div>
          )}
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-white/50">Нет партий для пошива</div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/20 bg-white/5">
                  <th className="w-10 px-2 py-3" />
                  <th className="text-left px-4 py-3 font-medium text-white/80">Заказ</th>
                  <th className="text-left px-4 py-3 font-medium text-white/80">Модель</th>
                  <th className="text-right px-4 py-3 font-medium text-white/80">Раскроено</th>
                  <th className="text-right px-4 py-3 font-medium text-white/80">Доступно</th>
                  <th className="text-right px-4 py-3 font-medium text-white/80">Сшито</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const key = getItemKey(item);
                  const cut = item.actual_cut_qty ?? 0;
                  const avail = item.available_for_sewing ?? 0;
                  const sewnItem = item.totals?.fact_sum ?? 0;
                  const isDone = item.status === 'DONE';
                  const canTake = !isDone && avail > 0;
                  const isExpanded = expandedItemKey === key && !isDone;
                  return (
                    <React.Fragment key={key}>
                      <tr
                        onClick={() => handleToggleExpand(item)}
                        className={`border-b border-white/5 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-blue-500/20' : canTake ? 'hover:bg-white/5' : 'opacity-60'
                        } ${!canTake && !isDone ? 'text-white/70' : ''}`}
                      >
                        <td className="px-2 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                          {!isDone && (
                            <button
                              type="button"
                              onClick={() => handleToggleExpand(item)}
                              className="p-1 rounded hover:bg-white/10 text-white/80 transition-transform"
                              title={isExpanded ? 'Свернуть' : 'Развернуть'}
                            >
                              <svg
                                className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <ModelPhoto
                              photo={item.order_photos?.[0]}
                              inline
                              size={48}
                            />
                            <span>{item.order_title}</span>
                            {isDone && <span className="ml-1 text-green-400">✓</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/90">
                          {item.model_name || item.order_title || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">{cut}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={avail <= 0 && !isDone ? 'text-amber-400' : ''}>{avail}</span>
                        </td>
                        <td className="px-4 py-3 text-right">{sewnItem}</td>
                      </tr>
                      {isExpanded && selectedItem && (
                        <tr className="border-b border-white/15 bg-white/5">
                          <td colSpan={6} className="px-4 py-3">
                            <div
                              className="grid transition-[grid-template-rows] duration-200"
                              style={{ gridTemplateRows: '1fr' }}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-white/5 text-sm mb-3">
                                  <span><strong>Раскрой:</strong> {cutTotal}</span>
                                  <span><strong>Пошив:</strong> {sewn}</span>
                                  <span><strong>Остаток:</strong> {available}</span>
                                </div>
                                {matrixData && hasMatrix ? (
                                  <div className="flex flex-wrap gap-6 items-start mb-3">
                                  <div className="overflow-x-auto w-full md:w-1/2">
                                    <table className="w-full text-sm border-collapse">
                                      <thead>
                                        <tr className="border-b border-white/20">
                                          <th className="text-left px-2 py-2 text-white/80 font-medium">Цвет</th>
                                          {sizes.map((s) => (
                                            <th key={s} className="text-center px-2 py-2 text-white/80 font-medium">{s}</th>
                                          ))}
                                          <th className="text-right px-2 py-2 text-white/80 font-medium">Итого</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {colors.map((color, ci) => (
                                          <tr key={color} className="border-b border-white/10">
                                            <td className="px-2 py-1.5 text-white/90">{color}</td>
                                            {sizes.map((size, si) => (
                                              <td key={size} className="px-1 py-0.5">
                                                <input
                                                  ref={registerRef(ci, si)}
                                                  type="number"
                                                  min={0}
                                                  max={cutByColorSize[`${color}|${size}`] ?? 9999}
                                                  placeholder="0"
                                                  className="w-14 px-1 py-1 text-center rounded bg-white/10 border border-white/20 text-white text-sm"
                                                  value={numInputValue(matrixInputs[`${color}|${size}`])}
                                                  onChange={(e) => setCellValue(color, size, e.target.value)}
                                                  onKeyDown={handleKeyDown(ci, si)}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              </td>
                                            ))}
                                            <td className="px-2 py-1.5 text-right font-medium">{rowTotals[color] ?? 0}</td>
                                          </tr>
                                        ))}
                                        <tr className="border-t-2 border-white/20 font-semibold">
                                          <td className="px-2 py-2 text-white/90">Итого</td>
                                          {sizes.map((s) => (
                                            <td key={s} className="px-2 py-2 text-center">{colTotals[s] ?? 0}</td>
                                          ))}
                                          <td className="px-2 py-2 text-right">{grandTotal}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="shrink-0 rounded-lg bg-blue-900/30 border border-blue-500/30 overflow-hidden w-full md:w-1/2">
                                    <p className="px-3 py-2 text-sm font-medium text-white/90 border-b border-blue-500/30 bg-blue-900/40">Итог по цветам (раскрой)</p>
                                    <table className="w-full text-sm border-collapse min-w-[200px]">
                                      <thead>
                                        <tr className="border-b border-white/20 bg-white/5">
                                          <th className="text-left px-3 py-2 text-white/80 font-medium">Цвет</th>
                                          {sizes.map((s) => (
                                            <th key={s} className="text-center px-2 py-2 text-white/80 font-medium">{s}</th>
                                          ))}
                                          <th className="text-right px-3 py-2 text-white/80 font-medium">Итого</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {colors.map((color) => {
                                          let rowSum = 0;
                                          sizes.forEach((size) => { rowSum += Number(cutByColorSize[`${color}|${size}`]) || 0; });
                                          return (
                                            <tr key={color} className="border-b border-white/10">
                                              <td className="px-3 py-1.5 text-white/90">{color}</td>
                                              {sizes.map((size) => {
                                                const v = Number(cutByColorSize[`${color}|${size}`]) || 0;
                                                return <td key={size} className="px-2 py-1.5 text-center text-white/90">{v}</td>;
                                              })}
                                              <td className="px-3 py-1.5 text-right font-medium text-white">{rowSum}</td>
                                            </tr>
                                          );
                                        })}
                                        <tr className="border-t-2 border-white/20 bg-white/5 font-semibold">
                                          <td className="px-3 py-2 text-white/90">Итого по размерам</td>
                                          {sizes.map((s) => {
                                            let colSum = 0;
                                            colors.forEach((color) => { colSum += Number(cutByColorSize[`${color}|${s}`]) || 0; });
                                            return <td key={s} className="px-2 py-2 text-center text-white">{colSum}</td>;
                                          })}
                                          <td className="px-3 py-2 text-right text-white">{cutTotal}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                  </div>
                                ) : (
                                  <div className="mb-3 max-w-[200px]">
                                    <label className="block text-white/80 font-medium mb-2">Факт пошива (шт)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="0"
                                      value={factInput}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setFactInput(v);
                                        if (selectedItem) {
                                          const k = getItemKey(selectedItem);
                                          factInputCacheRef.current[k] = v;
                                          try {
                                            const stored = sessionStorage.getItem(SEWING_FACT_INPUT_STORAGE_KEY);
                                            const parsed = stored ? JSON.parse(stored) : {};
                                            parsed[k] = v;
                                            sessionStorage.setItem(SEWING_FACT_INPUT_STORAGE_KEY, JSON.stringify(parsed));
                                          } catch (_) {}
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/30 text-white text-base placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                  </div>
                                )}
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleSave(); }}
                                    disabled={saving || (hasMatrix ? grandTotal <= 0 : simpleInputQty <= 0)}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {saving ? '...' : 'Сохранить'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleComplete(); }}
                                    disabled={completing || (sewn <= 0 && (hasMatrix ? grandTotal <= 0 : simpleInputQty <= 0))}
                                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {completing ? '...' : 'Завершить → ОТК'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
