/**
 * Страница ОТК (контроль качества): проверка партий пошива.
 * Партии создаются только при завершении пошива на странице «Пошив».
 * Показываются партии со статусом DONE без проведённого ОТК; после сохранения ОТК продукция поступает на склад.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard } from '../components/ui';
import ModelPhoto from '../components/ModelPhoto';

const SEWING_FLOOR_IDS = [2, 3, 4];
const QC_FLOOR_KEY = 'qc_floor_id';
const QC_SEARCH_KEY = 'qc_search';
const QC_WORKSHOP_KEY = 'qc_workshop_id';

function getQcStored(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && v !== undefined ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function Qc() {
  const [searchParams] = useSearchParams();
  const batchIdParam = searchParams.get('batch_id') ? Number(searchParams.get('batch_id')) : null;
  const orderIdParam = searchParams.get('order_id') ? Number(searchParams.get('order_id')) : null;
  const floorIdParam = searchParams.get('floor_id') ? Number(searchParams.get('floor_id')) : null;

  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalBatch, setModalBatch] = useState(null);
  const [formItems, setFormItems] = useState([]);
  const [completedColors, setCompletedColors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQ, setSearchQ] = useState(() =>
    batchIdParam ? '' : getQcStored(QC_SEARCH_KEY, '')
  );
  const [filterFloorId, setFilterFloorId] = useState(() => {
    if (floorIdParam != null && SEWING_FLOOR_IDS.includes(Number(floorIdParam))) return String(floorIdParam);
    return getQcStored(QC_FLOOR_KEY, '');
  });
  const [workshopId, setWorkshopId] = useState(() => getQcStored(QC_WORKSHOP_KEY, ''));
  const [workshops, setWorkshops] = useState([]);
  const [debouncedQ, setDebouncedQ] = useState(() => getQcStored(QC_SEARCH_KEY, ''));

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (!modalBatch) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modalBatch]);

  useEffect(() => {
    try {
      sessionStorage.setItem(QC_FLOOR_KEY, filterFloorId || '');
      sessionStorage.setItem(QC_SEARCH_KEY, searchQ || '');
      sessionStorage.setItem(QC_WORKSHOP_KEY, workshopId || '');
    } catch (_) {}
  }, [filterFloorId, searchQ, workshopId]);

  useEffect(() => {
    let cancelled = false;
    api.workshops
      .list()
      .then((list) => {
        if (!cancelled) setWorkshops(list);
      })
      .catch(() => {
        if (!cancelled) setWorkshops([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPending = useCallback((opts = {}) => {
    setLoading(true);
    const params = {};
    if (debouncedQ) params.q = debouncedQ;
    if (filterFloorId && !opts.ignoreFloorFilter) params.floor_id = filterFloorId;
    if (workshopId) params.workshop_id = workshopId;
    api.warehouseStock
      .batchesPendingQc(params)
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, [debouncedQ, filterFloorId, workshopId]);

  useEffect(() => {
    // При переходе по batch_id сразу грузим список без фильтра по этажу, чтобы новая партия попала в список
    loadPending(batchIdParam ? { ignoreFloorFilter: true } : {});
  }, [loadPending, batchIdParam]);

  // Список: дополнительный фильтр по order_id/floor_id из URL (переход с Пошива «Открыть ОТК»)
  const displayList = useMemo(() => {
    if (!pending.length) return [];
    if (orderIdParam != null && floorIdParam != null) {
      return pending.filter((row) => row.order_id === orderIdParam && row.floor_id === floorIdParam);
    }
    return pending;
  }, [pending, orderIdParam, floorIdParam]);

  // Заполнить форму из объекта партии: цвет×размер как на раскрое/пошиве
  const setModalFromBatch = useCallback((batch) => {
    setError('');
    setModalBatch(batch);
    setCompletedColors([]);
    const variants = batch.Order?.OrderVariants || [];
    const batchItems = batch.SewingBatchItems || [];

    const colorSet = new Set();
    const sizeMap = {}; // size_name -> { model_size_id, size_id }
    for (const v of variants) {
      const color = String(v.color || '').trim() || '—';
      if (color) colorSet.add(color);
    }
    if (colorSet.size === 0) colorSet.add('—');
    for (const bi of batchItems) {
      const sizeName = bi.ModelSize?.Size?.name || bi.ModelSize?.Size?.code
        || bi.Size?.name || bi.Size?.code
        || (bi.size_id ? `Размер #${bi.size_id}` : 'Общее');
      if (sizeName && !sizeMap[sizeName]) {
        sizeMap[sizeName] = { model_size_id: bi.model_size_id, size_id: bi.size_id };
      }
    }
    const colors = [...colorSet].sort();
    const sizes = Object.keys(sizeMap).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(b);
    });

    const factBySize = {};
    for (const bi of batchItems) {
      const sizeName = bi.ModelSize?.Size?.name || bi.ModelSize?.Size?.code
        || bi.Size?.name || bi.Size?.code || '';
      if (sizeName) factBySize[sizeName] = (factBySize[sizeName] || 0) + (Number(bi.fact_qty) || 0);
    }

    // В каждом цвете автоматически заполняем «Проверено» (доля факта по размеру на цвет); «Принято» не заполняем
    const items = [];
    const numColors = colors.length;
    for (let ci = 0; ci < numColors; ci++) {
      const color = colors[ci];
      for (const sizeName of sizes) {
        const meta = sizeMap[sizeName];
        const factTotal = factBySize[sizeName] || 0;
        const perColor = numColors > 0 ? Math.floor(factTotal / numColors) : 0;
        const remainder = numColors > 0 ? factTotal % numColors : 0;
        const checkedQty = perColor + (ci < remainder ? 1 : 0);
                items.push({
          rowKey: `${color}|${sizeName}`,
          color,
          size_name: sizeName,
          model_size_id: meta?.model_size_id,
          size_id: meta?.size_id,
          checked_qty: checkedQty,
          passed_qty: 0,
          defect_qty: 0,
          touched: false,
          submitted: false,
        });
      }
    }
    setFormItems(items);
  }, []);

  const openModal = useCallback(async (row) => {
    setError('');
    if (row.noBatch) {
      setError('Партия создаётся только при завершении пошива на странице «Пошив». Завершите пошив по заказу и этажу.');
      return;
    }
    try {
      const batch = await api.warehouseStock.batchById(row.id);
      setModalFromBatch(batch);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить партию');
    }
  }, []);

  // При открытии с batch_id или order_id+floor_id (после «Завершить пошив → ОТК») — один раз открыть форму
  const openedRef = useRef(null);
  const retryCountRef = useRef(0);
  const MAX_BATCH_ID_RETRIES = 3;
  useEffect(() => {
    if (loading) return;
    const key = batchIdParam ? `batch-${batchIdParam}` : (orderIdParam != null && floorIdParam != null ? `order-${orderIdParam}-${floorIdParam}` : null);
    if (!key || openedRef.current === key) return;
    if (batchIdParam) {
      const row = pending.find((r) => Number(r.id) === Number(batchIdParam));
      if (row) {
        openedRef.current = key;
        openModal(row);
        return;
      }
      if (retryCountRef.current < MAX_BATCH_ID_RETRIES) {
        retryCountRef.current += 1;
        const t = setTimeout(() => loadPending({ ignoreFloorFilter: true }), 400);
        return () => clearTimeout(t);
      }
      openedRef.current = key;
      api.warehouseStock
        .batchById(batchIdParam)
        .then((batch) => setModalFromBatch(batch))
        .catch((err) => setError(err.message || 'Партия не найдена'));
      return;
    }
    if (orderIdParam != null && floorIdParam != null) {
      const row = pending.find((r) => r.order_id === orderIdParam && r.floor_id === floorIdParam);
      if (row) {
        openedRef.current = key;
        openModal(row);
      }
    }
  }, [batchIdParam, orderIdParam, floorIdParam, loading, pending, openModal]);

  const handleChange = (rowKey, field, value) => {
    const v = parseInt(value, 10);
    const num = Number.isNaN(v) ? 0 : Math.max(0, v);
    setFormItems((prev) =>
      prev.map((it) => {
        if (it.rowKey !== rowKey) return it;
        const base = { ...it, touched: true };
        if (field === 'checked_qty') {
          const passed = Math.min(base.passed_qty, num);
          return { ...base, checked_qty: num, passed_qty: passed, defect_qty: Math.max(0, num - passed) };
        }
        if (field === 'passed_qty') {
          const passed = Math.min(num, base.checked_qty);
          return { ...base, passed_qty: passed, defect_qty: Math.max(0, base.checked_qty - passed) };
        }
        if (field === 'defect_qty') {
          const defect = Math.min(num, base.checked_qty);
          return { ...base, defect_qty: defect, passed_qty: Math.max(0, base.checked_qty - defect) };
        }
        return base;
      })
    );
  };

  const handleInputKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const form = e.target.form;
    if (!form) return;
    const inputs = Array.from(form.querySelectorAll('input[type="number"]'));
    const idx = inputs.indexOf(e.target);
    if (idx >= 0 && idx + 1 < inputs.length) {
      inputs[idx + 1].focus();
    }
  };

  const formByColorSize = useMemo(() => {
    const m = {};
    for (const it of formItems) {
      if (!m[it.color]) m[it.color] = {};
      m[it.color][it.size_name] = it;
    }
    return m;
  }, [formItems]);

  const colors = useMemo(() => [...new Set(formItems.map((it) => it.color))].sort(), [formItems]);
  const sizes = useMemo(() => [...new Set(formItems.map((it) => it.size_name))].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  }), [formItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!modalBatch) return;
    setSaving(true);
    setError('');
    try {
      const bySize = {};
      const touchedColorsSet = new Set();
      for (const it of formItems) {
        if (it.submitted) continue;
        const isTouched = it.touched || (it.passed_qty > 0 || it.defect_qty > 0);
        if (!isTouched) continue;
        touchedColorsSet.add(it.color);
        const key = it.model_size_id ? `m${it.model_size_id}` : (it.size_id ? `s${it.size_id}` : null);
        if (!key) continue;
        if (!bySize[key]) {
          bySize[key] = {
            model_size_id: it.model_size_id,
            size_id: it.size_id,
            checked_qty: 0,
            passed_qty: 0,
            defect_qty: 0,
          };
        }
        bySize[key].checked_qty += Number(it.checked_qty) || 0;
        bySize[key].passed_qty += Number(it.passed_qty) || 0;
        bySize[key].defect_qty += Number(it.defect_qty) || 0;
      }
      const items = Object.values(bySize).filter(
        (it) => (it.model_size_id || it.size_id) && (it.passed_qty > 0 || it.defect_qty > 0)
      );
      if (items.length === 0) {
        setError('Укажите проверенное количество хотя бы по одному размеру.');
        setSaving(false);
        return;
      }
      await api.warehouseStock.postQcBatch({
        batch_id: modalBatch.id,
        items: items.map((it) => ({
          model_size_id: it.model_size_id || null,
          size_id: it.size_id || null,
          checked_qty: it.checked_qty,
          passed_qty: it.passed_qty,
          defect_qty: it.defect_qty,
        })),
      });

      const touchedColors = Array.from(touchedColorsSet);
      setCompletedColors((prev) => Array.from(new Set([...prev, ...touchedColors])));
      setFormItems((prev) =>
        prev.map((it) =>
          touchedColors.includes(it.color)
            ? { ...it, submitted: true, touched: false }
            : it
        )
      );
      loadPending();
      setSuccessMsg('ОТК сохранён. Принятое количество поступило на склад.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setError(err.error || err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const orderLabel = (row) => {
    const tz = row.tz_code ? `${row.tz_code} — ` : '';
    return `${tz}${row.model_name || row.order_title || `#${row.order_id}`}`;
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text">ОТК (контроль качества)</h1>
        <PrintButton />
      </div>
      <p className="text-sm text-neon-muted mb-4">
        Партии пошива, готовые к проверке. Партии создаются при завершении пошива на странице «Пошив». Проверьте каждую партию по размерам — после сохранения принятая продукция поступит на склад.
      </p>
      {successMsg && (
        <p className="text-sm text-green-400 mb-4">
          {successMsg}{' '}
          <Link to="/warehouse" className="text-primary-400 hover:underline">
            Открыть склад →
          </Link>
        </p>
      )}

      {/* Фильтры: поиск по заказу/модели/клиенту, этаж */}
      <div className="no-print flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-4 w-full min-w-0">
        <input
          type="text"
          placeholder="Поиск по заказу, модели, клиенту"
          value={searchQ ?? ''}
          onChange={(e) => setSearchQ(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neon-surface border border-neon-border text-neon-text w-full sm:min-w-[200px] sm:max-w-md sm:flex-1 text-sm"
        />
        <select
          value={filterFloorId ?? ''}
          onChange={(e) => setFilterFloorId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neon-surface border border-neon-border text-neon-text text-sm w-full sm:w-auto"
        >
          <option value="">Все этажи</option>
          {SEWING_FLOOR_IDS.map((fid) => (
            <option key={fid} value={fid}>{fid} этаж</option>
          ))}
        </select>
        <select
          value={workshopId ?? ''}
          onChange={(e) => setWorkshopId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-neon-surface border border-neon-border text-neon-text text-sm w-full sm:min-w-[160px] sm:w-auto"
        >
          <option value="">Все цеха</option>
          {workshops.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <NeonCard className="rounded-card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : displayList.length === 0 ? (
          <div className="p-8 text-neon-muted">
            {orderIdParam != null && floorIdParam != null ? 'По выбранному заказу и этажу партий нет' : 'Нет партий, ожидающих ОТК'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {orderIdParam != null && floorIdParam != null && (
              <p className="px-4 py-2 text-sm text-neon-muted border-b border-white/10">
                Показаны партии: заказ #{orderIdParam}, этаж #{floorIdParam}
              </p>
            )}
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-accent-3/80 border-b border-white/25">
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Партия</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Заказ (TZ — модель)</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text hidden sm:table-cell">Этаж</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text hidden md:table-cell">Дата завершения</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-neon-text">Всего (факт)</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-neon-text">Действие</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-text no-print hidden sm:table-cell">Печать</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((row) => (
                  <tr key={row.id} className="border-b border-white/15">
                    <td className="px-4 py-3 font-medium text-neon-text">{row.batch_code}</td>
                    <td className="px-4 py-3 text-neon-text">
                      <ModelPhoto
                        photo={row.order_photos?.[0]}
                        modelName={orderLabel(row)}
                        size={48}
                      />
                    </td>
                    <td className="px-4 py-3 text-neon-text hidden sm:table-cell">{row.floor_name}</td>
                    <td className="px-4 py-3 text-neon-text hidden md:table-cell">
                      {row.finished_at ? new Date(row.finished_at).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{row.total_fact}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openModal(row)}
                        className="text-primary-400 hover:underline text-sm"
                      >
                        Проверить
                      </button>
                    </td>
                    <td className="px-4 py-3 no-print hidden sm:table-cell">
                      <Link
                        to={`/print/qc/${row.id}`}
                        className="text-primary-400 hover:underline text-sm"
                      >
                        Печать
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NeonCard>

      {modalBatch &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-stretch justify-center lg:items-center p-0 lg:p-4 overflow-hidden"
            onClick={() => !saving && setModalBatch(null)}
          >
            <div
              className="bg-neon-bg2 border-0 lg:border border-neon-border rounded-none lg:rounded-card max-w-2xl w-full h-full max-h-none lg:max-h-[90vh] lg:h-auto flex flex-col shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 p-6 pb-0">
                <div className="flex items-center gap-3 mb-4">
                  <ModelPhoto
                    photo={modalBatch.Order?.photos?.[0]}
                    modelName={`ОТК — партия ${modalBatch.batch_code}`}
                    size={64}
                  />
                  <div>
                    <p className="text-sm text-neon-muted">
                      {modalBatch.Order?.title} {modalBatch.Order?.model_name && ` · ${modalBatch.Order.model_name}`}
                    </p>
                  </div>
                </div>
                {modalBatch.kit_info && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm">
                    <p className="font-medium text-neon-text mb-1">Комплект: {modalBatch.kit_info.order_title}</p>
                    <p className="text-neon-muted">
                      Части: {(modalBatch.kit_info.parts || []).map((p) => `${p.part_name}: ${p.qty}`).join(' | ')}
                      {' → '}
                      <span className="text-green-400 font-semibold">готово комплектов: {modalBatch.kit_info.kit_qty}</span>
                      {((modalBatch.kit_info.parts || []).some((p) => (p.remainder ?? 0) > 0)) && (
                        <span className="text-neon-muted ml-1">
                          (остатки: {(modalBatch.kit_info.parts || []).map((p) => `${p.part_name}: ${p.remainder ?? 0}`).join(', ')})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto px-6 pr-1 pb-2">
                <div className="overflow-x-auto">
                  <p className="text-sm text-neon-muted mb-2">Заполните количество по цветам и размерам (как на раскрое)</p>
                  {colors.length === 0 ? (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-white/25">
                          <th className="text-left py-3 px-3 text-neon-muted font-medium">Размер</th>
                          <th className="text-right py-3 px-3 text-neon-muted font-medium w-24">Проверено</th>
                          <th className="text-right py-3 px-3 text-neon-muted font-medium w-24">Принято</th>
                          <th className="text-right py-3 px-3 text-neon-muted font-medium w-24">Брак</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formItems.map((it) => (
                          <tr key={it.rowKey} className="border-b border-white/10">
                            <td className="py-2.5 px-3 text-neon-text font-medium">{it.size_name}</td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                value={it.checked_qty ?? ''}
                                onChange={(e) => handleChange(it.rowKey, 'checked_qty', e.target.value)}
                                className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                max={it.checked_qty}
                                value={it.passed_qty ?? ''}
                                onChange={(e) => handleChange(it.rowKey, 'passed_qty', e.target.value)}
                                className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                max={it.checked_qty}
                                value={it.defect_qty ?? ''}
                                onChange={(e) => handleChange(it.rowKey, 'defect_qty', e.target.value)}
                                className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    colors.map((color) => {
                      const isCompleted = completedColors.includes(color);
                      return (
                      <div key={color} className={`mb-4 last:mb-0 ${isCompleted ? 'opacity-80' : ''}`}>
                        <p className="text-sm font-medium text-neon-text mb-2">
                          Цвет: {color}{' '}
                          {isCompleted && <span className="text-green-400 text-xs align-middle">✓ на склад</span>}
                        </p>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-white/25">
                              <th className="text-left py-2 px-3 text-neon-muted font-medium">Размер</th>
                              <th className="text-right py-2 px-3 text-neon-muted font-medium w-24">Проверено</th>
                              <th className="text-right py-2 px-3 text-neon-muted font-medium w-24">Принято</th>
                              <th className="text-right py-2 px-3 text-neon-muted font-medium w-24">Брак</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sizes.map((sizeName) => {
                              const it = formByColorSize[color]?.[sizeName];
                              if (!it) return null;
                              return (
                                <tr key={it.rowKey} className="border-b border-white/10">
                                   <td className="py-2 px-3 text-neon-text">{sizeName}</td>
                                  <td className="py-2 px-3 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      value={it.checked_qty ?? ''}
                                      onChange={(e) => handleChange(it.rowKey, 'checked_qty', e.target.value)}
                                      onKeyDown={handleInputKeyDown}
                                      className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      max={it.checked_qty}
                                      value={it.passed_qty ?? ''}
                                      onChange={(e) => handleChange(it.rowKey, 'passed_qty', e.target.value)}
                                      onKeyDown={handleInputKeyDown}
                                      className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      max={it.checked_qty}
                                      value={it.defect_qty ?? ''}
                                      onChange={(e) => handleChange(it.rowKey, 'defect_qty', e.target.value)}
                                      onKeyDown={handleInputKeyDown}
                                      className="w-full max-w-[70px] ml-auto block px-2 py-1.5 rounded bg-white/10 border border-white/25 text-neon-text text-right text-sm"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                    })
                  )}
                </div>
                </div>
                <div className="shrink-0 p-4 sm:p-6 pt-4 border-t border-white/10">
                  {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
                  <div className="flex flex-col-reverse sm:flex-row gap-2 w-full">
                    <NeonButton type="submit" disabled={saving} className="w-full sm:w-auto">
                      {saving ? 'Сохранение...' : 'Сохранить (принятое поступит на склад)'}
                    </NeonButton>
                    <NeonButton type="button" variant="secondary" onClick={() => setModalBatch(null)} disabled={saving} className="w-full sm:w-auto">
                      Отмена
                    </NeonButton>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
