/**
 * Пошив — ERP швейной фабрики.
 * Матрица цвет×размер из раскроя или заказа.
 * available = cut_fact_qty − sewn_qty
 * Валидация: grand_total <= available
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}
function getWeekEnd() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

export default function Sewing() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
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
  const [expandedItemKey, setExpandedItemKey] = useState(null); // "order_id-floor_id" или null

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadBoard = useCallback(() => {
    setLoading(true);
    setError('');
    api.sewing
      .board({
        date_from: getWeekStart(),
        date_to: getWeekEnd(),
        status: 'ALL',
        q: debouncedQ || undefined,
      })
      .then((res) =>
        setBoardData({ floors: res.floors || [], period: res.period || {} })
      )
      .catch((err) => setError(err.message || 'Ошибка'))
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const loadMatrix = useCallback(async (order_id, floor_id, options = {}) => {
    const { preserveInputs = false } = options;
    try {
      const data = await api.sewing.matrix({ order_id, floor_id });
      setMatrixData(data);
      if (!preserveInputs) {
        const init = {};
        (data.colors || []).forEach((color) => {
          (data.sizes || []).forEach((size) => {
            init[`${color}|${size}`] = '';
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
      setExpandedItemKey(null);
      setSelectedItem(null);
      setMatrixData(null);
      setFactInput('');
    } else {
      setExpandedItemKey(key);
      setSelectedItem(item);
      setMatrixData(null);
      setFactInput('');
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
    setMatrixInputs((prev) => ({ ...prev, [key]: value === '' ? '' : String(value) }));
  };

  const colors = matrixData?.colors ?? [];
  const sizes = matrixData?.sizes ?? [];
  const cutByColorSize = matrixData?.cutByColorSize ?? {};
  const cutTotal = matrixData?.cut_total ?? 0;
  const sewn = matrixData?.sewn ?? 0;
  const available = matrixData?.available ?? 0;
  const hasMatrix = colors.length > 0 && sizes.length > 0;
  const simpleInputQty = Math.max(0, parseInt(String(factInput), 10) || 0);

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
      if (grandTotal > available) {
        setError('Превышено количество раскроя.');
        return;
      }
    } else {
      if (simpleInputQty <= 0) return;
      if (simpleInputQty > available) {
        setError(`Количество (${simpleInputQty}) превышает доступное (${available}).`);
        return;
      }
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
    if (totalNewInput > available) {
      setError(hasMatrix ? 'Превышено количество раскроя.' : `Количество (${simpleInputQty}) превышает доступное (${available}).`);
      return;
    }
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
      setExpandedItemKey(null);
      setSelectedItem(null);
      setMatrixData(null);
      setFactInput('');
      loadBoard();
      if (res?.batch_id) navigate(`/qc?batch_id=${res.batch_id}`);
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
        <div className="flex gap-2">
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
        <div className="mb-3 text-sm text-green-400">{successMsg}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-white/60">Загрузка...</div>
      ) : (
        <div className="print-area overflow-x-auto rounded-xl border border-white/25 bg-[#1a1a1f]">
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
                          {item.order_title}
                          {isDone && <span className="ml-1 text-green-400">✓</span>}
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
                                <div className="space-y-2 text-sm mb-3">
                                  <p><span className="text-white/60">Раскроено:</span> {cutTotal}</p>
                                  <p><span className="text-white/60">Сшито:</span> {sewn}</p>
                                  <p><span className="text-white/60">Доступно:</span> {available}</p>
                                </div>
                                {matrixData && hasMatrix ? (
                                  <div className="overflow-x-auto mb-3">
                                    <table className="w-full text-sm border-collapse max-w-[560px]">
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
                                        {colors.map((color) => (
                                          <tr key={color} className="border-b border-white/10">
                                            <td className="px-2 py-1.5 text-white/90">{color}</td>
                                            {sizes.map((size) => (
                                              <td key={size} className="px-1 py-0.5">
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={cutByColorSize[`${color}|${size}`] ?? 9999}
                                                  className="w-14 px-1 py-1 text-center rounded bg-white/10 border border-white/20 text-white text-sm"
                                                  value={matrixInputs[`${color}|${size}`] ?? ''}
                                                  onChange={(e) => setCellValue(color, size, e.target.value)}
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
                                    {grandTotal > available && (
                                      <p className="text-red-400 text-xs mt-1">Превышено количество раскроя.</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="mb-3 max-w-[200px]">
                                    <label className="block text-white/80 font-medium mb-2">Факт пошива (шт)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={available}
                                      placeholder="0"
                                      value={factInput}
                                      onChange={(e) => setFactInput(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/30 text-white text-base placeholder-white/40 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                    {simpleInputQty > available && (
                                      <p className="text-red-400 text-xs mt-1">Превышено ({available})</p>
                                    )}
                                  </div>
                                )}
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleSave(); }}
                                    disabled={saving || (hasMatrix ? (grandTotal <= 0 || grandTotal > available) : (simpleInputQty <= 0 || simpleInputQty > available))}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {saving ? '...' : 'Сохранить'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleComplete(); }}
                                    disabled={completing || (sewn <= 0 && (hasMatrix ? (grandTotal <= 0 || grandTotal > available) : (simpleInputQty <= 0 || simpleInputQty > available)))}
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
