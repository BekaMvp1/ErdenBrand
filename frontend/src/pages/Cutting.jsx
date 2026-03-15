/**
 * Страница раскроя
 * Вкладки по типу: Аксы, Аутсорс + динамические из справочника cutting_types
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import ModelPhoto from '../components/ModelPhoto';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';

const DEFAULT_TYPES = ['Аксы', 'Аутсорс', 'Наш цех'];

// Этажи: 1 = ФИНИШ, 2–4 = ПОШИВ
const FLOOR_OPTIONS = [
  { value: 1, label: '1 этаж (Финиш)' },
  { value: 2, label: '2 этаж (Пошив)' },
  { value: 3, label: '3 этаж (Пошив)' },
  { value: 4, label: '4 этаж (Пошив)' },
];

const formatFloor = (floor) => {
  if (floor == null) return '—';
  const opt = FLOOR_OPTIONS.find((o) => o.value === floor);
  return opt ? opt.label : `${floor} этаж`;
};

/** Pivot actual_variants to { sizes, rows: [{ color, bySize }] } — Table 1: раскрой по партиям (export for OrderDetails) */
export function buildBatchPivot(actualVariants) {
  const variants = actualVariants || [];
  const sizeSet = new Set();
  const byColor = {};
  for (const v of variants) {
    const size = String(v.size || '').trim() || '—';
    const color = String(v.color || '').trim() || '—';
    sizeSet.add(size);
    if (!byColor[color]) byColor[color] = {};
    byColor[color][size] = (byColor[color][size] || 0) + (parseInt(v.quantity_actual, 10) || 0);
  }
  const sizes = [...sizeSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const rows = Object.entries(byColor).map(([color, bySize]) => ({ color, bySize }));
  return { sizes, rows };
}

/** Aggregate batches into totals by color — Table 2: итог по цветам (export for OrderDetails) */
export function buildTotalsPivot(batchesData) {
  const allSizes = new Set();
  const totalsByColor = {};
  for (const { sizes, rows } of batchesData) {
    sizes.forEach((s) => allSizes.add(s));
    for (const { color, bySize } of rows) {
      if (!totalsByColor[color]) totalsByColor[color] = {};
      for (const [size, qty] of Object.entries(bySize)) {
        totalsByColor[color][size] = (totalsByColor[color][size] || 0) + qty;
      }
    }
  }
  const sizes = [...allSizes].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const rows = Object.entries(totalsByColor).map(([color, bySize]) => {
    let total = 0;
    for (const q of Object.values(bySize)) total += q;
    return { color, bySize, total };
  });
  return { sizes, rows };
}

export function CompleteByFactModal({ task, onClose, onSave, isEditMode }) {
  const today = new Date().toISOString().slice(0, 10);
  const variants = task.Order?.OrderVariants || [];
  const actualMap = (task.actual_variants || []).reduce(
    (acc, v) => { acc[`${v.color}|${v.size}`] = v.quantity_actual; return acc; },
    {}
  );
  const colorSet = new Set();
  const sizeSet = new Set();
  const pivot = {};
  for (const v of variants) {
    const color = String(v.color || '').trim() || '—';
    const size = (v.Size?.name || v.Size?.code || '').toString().trim() || '—';
    if (color && size) {
      colorSet.add(color);
      sizeSet.add(size);
      const key = `${color}|${size}`;
      if (!pivot[color]) pivot[color] = {};
      pivot[color][size] = actualMap[key] ?? v.quantity ?? 0;
    }
  }
  const colors = [...colorSet].sort();
  const sizes = [...sizeSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
  const [pivotState, setPivotState] = useState(() => JSON.parse(JSON.stringify(pivot)));
  const [endDate, setEndDate] = useState(task.end_date || today);
  const { registerRef, handleKeyDown } = useGridNavigation(colors.length, sizes.length);

  const handleChange = (color, size, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setPivotState((prev) => ({
      ...prev,
      [color]: { ...(prev[color] || {}), [size]: n },
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const actualVariants = [];
    for (const color of colors) {
      for (const size of sizes) {
        const q = pivotState[color]?.[size] || 0;
        if (q > 0) {
          actualVariants.push({ color, size, quantity_planned: 0, quantity_actual: q });
        }
      }
    }
    onSave(actualVariants, endDate);
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden" onClick={onClose}>
      <div
        className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text p-4 sm:p-6 pb-0 shrink-0">
          {isEditMode ? 'Редактировать по факту' : 'Завершить по факту'} — #{task.order_id} {task.Order?.title}
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 pt-4">
            <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Заполните количество по факту (цвет × размер)</p>
            <div className="overflow-x-auto -mx-1 mb-4">
              <table className="w-full text-sm table-fixed min-w-[280px]">
                <thead>
                  <tr className="bg-accent-2/50 dark:bg-dark-800">
                    <th className="text-left px-4 py-2.5 font-medium w-[120px]">Цвет</th>
                    {sizes.map((s) => (
                      <th key={s} className="text-center px-2 py-2.5 font-medium">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color, ci) => (
                    <tr key={color} className="border-t border-white/10">
                      <td className="px-4 py-2.5">{color}</td>
                      {sizes.map((size, si) => (
                        <td key={size} className="px-2 py-2.5">
                          <input
                            ref={registerRef(ci, si)}
                            type="number"
                            min="0"
                            placeholder="0"
                            value={numInputValue(pivotState[color]?.[size])}
                            onChange={(e) => handleChange(color, size, e.target.value)}
                            onKeyDown={handleKeyDown(ci, si)}
                            className="w-full min-w-[3rem] px-2 py-1.5 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Дата окончания</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
            </div>
            <div className="flex gap-2 justify-end flex-wrap shrink-0 pt-4">
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">
                {isEditMode ? 'Сохранить' : 'Сохранить и завершить'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text">
                Отмена
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

const isOurWorkshopType = (t) => t === 'Наш цех';

export default function Cutting() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [cuttingTypes, setCuttingTypes] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeType, setActiveType] = useState(type || 'Аксы');
  const [addTaskModalOrder, setAddTaskModalOrder] = useState(null);
  const [completeModalTask, setCompleteModalTask] = useState(null);
  const isOurWorkshop = isOurWorkshopType(activeType);
  const CUTTING_EXPANDED_KEY = 'cutting_expanded';
  const loadExpandedFor = (t) => {
    try {
      const s = sessionStorage.getItem(`${CUTTING_EXPANDED_KEY}_${t}`);
      if (!s) return new Set();
      const arr = JSON.parse(s);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  };
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => loadExpandedFor(type || 'Аксы'));
  const [newTask, setNewTask] = useState({
    order_id: '',
    floor: '',
    operation: '',
    status: 'Ожидает',
    responsible: '',
    start_date: '',
    height_type: 'PRESET',
    height_value: 170,
  });

  // Аксы и Аутсорс — по умолчанию; остальные — из справочника (без дублей)
  const dynamicTypes = cuttingTypes
    .filter((t) => !DEFAULT_TYPES.includes(t.name))
    .map((t) => t.name);
  const allTypes = [...DEFAULT_TYPES, ...dynamicTypes];

  useEffect(() => {
    api.references.cuttingTypes().then(setCuttingTypes).catch(() => setCuttingTypes([]));
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    if (activeType) {
      setLoading(true);
      api.cutting
        .tasks(activeType)
        .then(setTasks)
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }
  }, [activeType]);

  // Заказы только выбранного цеха (тип раскроя = название цеха). Сопоставление без учёта регистра и пробелов.
  const activeTypeNorm = String(activeType || '').trim().toLowerCase();
  const workshopIdForType =
    workshops.find((w) => String(w.name || '').trim().toLowerCase() === activeTypeNorm)?.id ?? null;

  useEffect(() => {
    setOrdersLoading(true);
    if (workshopIdForType != null) {
      api.orders
        .list({ workshop_id: workshopIdForType, limit: 500 })
        .then((list) => setOrders(Array.isArray(list) ? list : []))
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    } else if (workshops.length > 0) {
      // Цеха загружены, но тип не совпал с цехом — показываем пустой список (не все заказы)
      setOrders([]);
      setOrdersLoading(false);
    } else {
      // Цеха ещё не загружены — не грузим заказы, чтобы не показать все по ошибке
      setOrders([]);
      setOrdersLoading(false);
    }
  }, [workshopIdForType, workshops.length]);

  // При выборе заказа подставляем рост из заказа (для раскроя)
  useEffect(() => {
    if (!newTask.order_id) return;
    api.orders
      .get(newTask.order_id)
      .then((o) => {
        const type = o.order_height_type === 'CUSTOM' ? 'CUSTOM' : 'PRESET';
        const value = o.order_height_value ?? 170;
        setNewTask((prev) => ({ ...prev, height_type: type, height_value: value }));
      })
      .catch(() => {});
  }, [newTask.order_id]);

  const openAddTaskModal = (order) => {
    setAddTaskModalOrder(order);
    setNewTask({
      order_id: String(order.id),
      floor: isOurWorkshop ? '' : '1',
      operation: '',
      status: 'Ожидает',
      responsible: '',
      start_date: '',
      height_type: 'PRESET',
      height_value: 170,
    });
  };

  const closeAddTaskModal = () => {
    setAddTaskModalOrder(null);
    setNewTask({ order_id: '', floor: '', operation: '', status: 'Ожидает', responsible: '', start_date: '', height_type: 'PRESET', height_value: 170 });
  };

  useEffect(() => {
    if (type && allTypes.includes(type)) {
      setActiveType(type);
    } else if (!type && allTypes.length > 0) {
      navigate(`/cutting/${encodeURIComponent(allTypes[0])}`, { replace: true });
    }
  }, [type, allTypes, navigate]);

  useEffect(() => {
    setExpandedTaskIds(loadExpandedFor(activeType));
  }, [activeType]);

  const saveExpanded = (ids) => {
    try {
      sessionStorage.setItem(`${CUTTING_EXPANDED_KEY}_${activeType}`, JSON.stringify([...ids]));
    } catch (_) {}
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.order_id) {
      alert('Выберите заказ');
      return;
    }
    const floorNum = isOurWorkshop ? (newTask.floor ? parseInt(newTask.floor, 10) : null) : 1;
    if (isOurWorkshop && !floorNum) {
      alert('Выберите этаж');
      return;
    }
    try {
      const heightVal = newTask.height_type === 'CUSTOM' ? Math.min(220, Math.max(120, parseInt(newTask.height_value, 10) || 170)) : (newTask.height_value === 165 ? 165 : 170);
      await api.cutting.addTask({
        order_id: parseInt(newTask.order_id, 10),
        cutting_type: activeType,
        floor: floorNum ?? 1,
        operation: newTask.operation?.trim() || undefined,
        status: newTask.status,
        responsible: newTask.responsible?.trim() || undefined,
        start_date: newTask.start_date || undefined,
        height_type: newTask.height_type,
        height_value: heightVal,
      });
      setNewTask({ order_id: '', floor: '', operation: '', status: 'Ожидает', responsible: '', start_date: '', height_type: 'PRESET', height_value: 170 });
      setAddTaskModalOrder(null);
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!confirm('Удалить задачу?')) return;
    try {
      await api.cutting.deleteTask(task.id);
      setTasks((t) => t.filter((x) => x.id !== task.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await api.cutting.updateTask(task.id, { status: newStatus });
      setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, status: newStatus } : x)));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFloorChange = async (task, newFloor) => {
    try {
      await api.cutting.updateTask(task.id, { floor: parseInt(newFloor, 10) });
      setTasks((t) => t.map((x) => (x.id === task.id ? { ...x, floor: parseInt(newFloor, 10) } : x)));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteByFact = async (task, actualVariants, endDate) => {
    try {
      await api.cutting.updateTask(task.id, {
        status: 'Готово',
        actual_variants: actualVariants,
        end_date: endDate || undefined,
      });
      await api.cutting.complete({ order_id: task.order_id });
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
      setCompleteModalTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditActualVariants = async (task, actualVariants, endDate) => {
    try {
      await api.cutting.updateTask(task.id, {
        actual_variants: actualVariants,
        end_date: endDate || undefined,
      });
      const updated = await api.cutting.tasks(activeType);
      setTasks(updated);
      setCompleteModalTask(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleTaskExpand = (taskId) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      saveExpanded(next);
      return next;
    });
  };

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[#ECECEC] dark:text-dark-text">Раскрой</h1>
        <PrintButton />
      </div>

      <p className="no-print text-[#ECECEC]/80 dark:text-dark-text/80 mb-4">
        Тип: <span className="font-medium text-[#ECECEC] dark:text-dark-text">{activeType}</span>
      </p>

      {/* Заказы цеха — только те, что ещё не добавлены в раскрой; после добавления строка исчезает */}
      <div className="no-print mb-6 rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto">
        <h2 className="text-sm font-medium text-[#ECECEC]/80 dark:text-dark-text/80 mb-2 px-1">Заказы цеха «{activeType}» (ещё не в раскрое)</h2>
        {ordersLoading ? (
          <div className="p-6 text-[#ECECEC]/60 dark:text-dark-text/60">Загрузка заказов...</div>
        ) : (() => {
          const orderIdsInCutting = new Set((tasks || []).map((t) => t.order_id));
          const ordersNotInCutting = orders.filter((o) => !orderIdsInCutting.has(o.id));
          if (orders.length === 0) {
            return <div className="p-6 text-[#ECECEC]/60 dark:text-dark-text/60">Нет заказов по цеху «{activeType}»</div>;
          }
          if (ordersNotInCutting.length === 0) {
            return <div className="p-6 text-[#ECECEC]/60 dark:text-dark-text/60">Все заказы цеха уже добавлены в раскрой</div>;
          }
          return (
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">ТЗ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Название</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Кол-во</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дата поступления</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Дедлайн</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
              </tr>
            </thead>
            <tbody>
              {ordersNotInCutting.map((o) => (
                <tr
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openAddTaskModal(o)}
                  onKeyDown={(e) => e.key === 'Enter' && openAddTaskModal(o)}
                  className="border-b border-white/10 dark:border-white/10 hover:bg-white/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-primary-400 dark:text-primary-400 font-medium">
                    {o.tz_code || o.id || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ModelPhoto photo={o.photos?.[0]} modelName={o.title} size={48} className="shrink-0" />
                      <span className="text-[#ECECEC] dark:text-dark-text">{o.title || o.model_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{o.Client?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{o.total_quantity ?? o.quantity ?? '—'}</td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 whitespace-nowrap">
                    {o.receipt_date ? String(o.receipt_date).slice(0, 10) : (o.created_at ? String(o.created_at).slice(0, 10) : '—')}
                  </td>
                  <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 whitespace-nowrap">{o.deadline ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-accent-1/30 text-[#ECECEC]/90 dark:text-dark-text/90">
                      {o.OrderStatus?.name ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          );
        })()}
      </div>

      {/* Модалка: подготовка к раскрою (заказ выбран, заполняем этаж, рост, дату и т.д.) */}
      {addTaskModalOrder && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={closeAddTaskModal}>
          <div
            className="bg-accent-3 dark:bg-dark-900 rounded-xl border border-white/25 max-w-2xl w-full my-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-white/15">
              <h3 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text">Подготовить к раскрою</h3>
              <p className="mt-1 text-sm text-[#ECECEC]/80 dark:text-dark-text/80">
                Заказ: #{addTaskModalOrder.id} {addTaskModalOrder.Client?.name} — {addTaskModalOrder.title}
              </p>
            </div>
            <form onSubmit={handleAddTask} className="p-4 sm:p-6 flex flex-wrap gap-3 sm:gap-4 items-end">
              {isOurWorkshop && (
                <div>
                  <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Этаж</label>
                  <select
                    value={newTask.floor}
                    onChange={(e) => setNewTask({ ...newTask, floor: e.target.value })}
                    className="px-3 sm:px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[160px]"
                    required
                  >
                    <option value="">— Выберите этаж —</option>
                    {FLOOR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Рост</label>
                <select
                  value={newTask.height_type === 'CUSTOM' ? 'CUSTOM' : String(newTask.height_value)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'CUSTOM') setNewTask({ ...newTask, height_type: 'CUSTOM', height_value: 170 });
                    else setNewTask({ ...newTask, height_type: 'PRESET', height_value: v === '165' ? 165 : 170 });
                  }}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                >
                  <option value="170">170</option>
                  <option value="165">165</option>
                  <option value="CUSTOM">Другое (ручной ввод)</option>
                </select>
                {newTask.height_type === 'CUSTOM' && (
                  <input
                    type="number"
                    min={120}
                    max={220}
                    value={newTask.height_value}
                    onChange={(e) => setNewTask({ ...newTask, height_value: e.target.value })}
                    className="mt-1 w-24 px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC]"
                    placeholder="120–220"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Начало раскроя</label>
                <input
                  type="date"
                  value={newTask.start_date}
                  onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })}
                  className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Операция</label>
                <input
                  type="text"
                  value={newTask.operation}
                  onChange={(e) => setNewTask({ ...newTask, operation: e.target.value })}
                  placeholder="Операция"
                  className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Статус</label>
                <select
                  value={newTask.status}
                  onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                  className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                >
                  <option value="Ожидает">Ожидает</option>
                  <option value="В работе">В работе</option>
                  <option value="Готово">Готово</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-1">Ответственный</label>
                <input
                  type="text"
                  value={newTask.responsible}
                  onChange={(e) => setNewTask({ ...newTask, responsible: e.target.value })}
                  placeholder="ФИО"
                  className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={isOurWorkshop ? !newTask.floor : false}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Добавить
                </button>
                <button type="button" onClick={closeAddTaskModal} className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text">
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Таблица задач (с падающим блоками размеров и кол-ва) */}
      <div className="print-area rounded-xl border border-white/25 dark:border-white/25 overflow-hidden overflow-x-auto">
        <h1 className="print-title print-only">Раскрой — {activeType}</h1>
        {loading ? (
          <div className="p-6 sm:p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
        ) : tasks.length === 0 ? (
          <div className="p-6 sm:p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет задач по типу «{activeType}»</div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-accent-3/80 dark:bg-dark-900 border-b border-white/25 dark:border-white/25">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Заказ</th>
                {isOurWorkshop && (
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Этаж</th>
                )}
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Рост</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Операция</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Ответственный</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">По факту</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Действия</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 no-print">Печать</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const actualVariants = task.status === 'Готово' ? (task.actual_variants || []) : [];
                const batchPivot = buildBatchPivot(actualVariants);
                const totalQty = batchPivot.rows.reduce((s, r) => {
                  s += Object.values(r.bySize).reduce((a, b) => a + b, 0);
                  return s;
                }, 0);
                const planTotal = (task.Order?.OrderVariants || []).reduce((s, v) => s + (v.quantity || 0), 0);
                const isExpanded = expandedTaskIds.has(task.id);
                return (
                  <React.Fragment key={task.id}>
                  <tr className="border-b border-white/10 dark:border-white/10">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <ModelPhoto
                          photo={task.Order?.photos?.[0]}
                          inline
                          size={48}
                          className="shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => toggleTaskExpand(task.id)}
                          className="p-1 rounded hover:bg-accent-2/50 dark:hover:bg-dark-800 text-[#ECECEC]/80 dark:text-dark-text/80 transition-transform duration-200"
                          title={isExpanded ? 'Свернуть' : 'Развернуть детали'}
                        >
                          <svg
                            className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => navigate(`/orders/${task.order_id}`)}
                          className="text-primary-400 hover:underline"
                        >
                          #{task.order_id} {task.Order?.Client?.name} — {task.Order?.title}
                        </button>
                      </div>
                    </td>
                    {isOurWorkshop && (
                      <td className="px-4 py-3 align-top">
                        {task.status === 'Готово' ? (
                          <span className="text-[#ECECEC]/90 dark:text-dark-text/80">{formatFloor(task.floor)}</span>
                        ) : (
                          <select
                            value={task.floor ?? ''}
                            onChange={(e) => handleFloorChange(task, e.target.value)}
                            className="px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                          >
                            {FLOOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">
                      {task.height_value != null ? String(task.height_value) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.operation || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value)}
                        className="px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm"
                      >
                        <option value="Ожидает">Ожидает</option>
                        <option value="В работе">В работе</option>
                        <option value="Готово">Готово</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80 align-top">{task.responsible || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      {batchPivot.rows.length > 0 || planTotal > 0 ? (
                        isExpanded ? (
                          <button
                            onClick={() => setCompleteModalTask(task)}
                            className="min-w-[260px] px-2.5 py-1 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                          >
                            {task.status === 'Готово' ? 'Редактировать по факту' : 'Завершить по факту'}
                          </button>
                        ) : (
                          <div className="text-sm text-[#ECECEC]/90 dark:text-dark-text/90">
                            <span>План: {planTotal}</span>
                            {task.status === 'Готово' && (
                              <>
                                <span className="mx-2">|</span>
                                <span>Факт: {totalQty}</span>
                              </>
                            )}
                          </div>
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => handleDeleteTask(task)}
                        className="text-red-500 hover:text-red-400 text-sm"
                      >
                        Удалить
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top no-print">
                      <Link
                        to={`/print/cutting/${task.id}`}
                        className="text-primary-400 hover:text-primary-300 hover:underline text-sm"
                      >
                        Печать
                      </Link>
                    </td>
                  </tr>
                  <tr className="border-b border-white/15 dark:border-white/15 bg-accent-2/20 dark:bg-dark-900/50">
                    <td colSpan={isOurWorkshop ? 9 : 8} className="px-4 py-0 overflow-hidden">
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-out`}
                        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                      >
                        <div className="min-h-0 overflow-hidden">
                            <div className="px-4 py-2 flex flex-wrap gap-6">
                              {(() => {
                                const pivot = buildBatchPivot(actualVariants);
                                const hasTotals = pivot.sizes?.length && pivot.rows?.length;
                                let totalsByColor = {};
                                let totalsBySize = {};
                                let grandTotal = 0;
                                if (hasTotals) {
                                  pivot.rows.forEach(({ color, bySize }) => {
                                    let t = 0;
                                    Object.values(bySize || {}).forEach((q) => { t += q; });
                                    totalsByColor[color] = { bySize: bySize || {}, total: t };
                                  });
                                  pivot.sizes.forEach((s) => {
                                    let t = 0;
                                    pivot.rows.forEach(({ bySize }) => { t += (bySize && bySize[s]) || 0; });
                                    totalsBySize[s] = t;
                                    grandTotal += t;
                                  });
                                }
                                return (
                                  <>
                                    <div className="min-w-0">
                                      <table className="text-sm border border-white/15 dark:border-white/15 rounded overflow-hidden max-w-[480px]">
                                        <thead>
                                          <tr className="bg-accent-2/50 dark:bg-dark-800">
                                            <th className="text-left px-4 py-2 font-medium">Цвет</th>
                                            <th className="text-left px-4 py-2 font-medium">Размер</th>
                                            <th className="text-center px-4 py-2 font-medium">Кол-во план</th>
                                            <th className="text-center px-4 py-2 font-medium">Кол-во факт</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(() => {
                                            const planVariants = task.Order?.OrderVariants || [];
                                            const factMap = {};
                                            (actualVariants || []).forEach((v) => {
                                              const k = `${String(v.color || '').trim()}|${String(v.size || '').trim()}`;
                                              factMap[k] = parseInt(v.quantity_actual, 10) || 0;
                                            });
                                            const rows = planVariants.map((v) => {
                                              const color = String(v.color || '').trim() || '—';
                                              const size = (v.Size?.name || v.Size?.code || '').toString().trim() || '—';
                                              const plan = parseInt(v.quantity, 10) || 0;
                                              const factKey = `${color}|${size}`;
                                              const fact = factMap[factKey] !== undefined ? factMap[factKey] : null;
                                              return { color, size, plan, fact };
                                            });
                                            if (rows.length === 0) {
                                              return (
                                                <tr>
                                                  <td colSpan={4} className="px-4 py-2 text-[#ECECEC]/60">Нет данных</td>
                                                </tr>
                                              );
                                            }
                                            return rows.map((r, i) => (
                                              <tr key={`${r.color}-${r.size}-${i}`} className="border-t border-white/10">
                                                <td className="px-4 py-2">{r.color}</td>
                                                <td className="px-4 py-2">{r.size}</td>
                                                <td className="px-4 py-2 text-center">{r.plan}</td>
                                                <td className="px-4 py-2 text-center">{r.fact !== null ? r.fact : '—'}</td>
                                              </tr>
                                            ));
                                          })()}
                                        </tbody>
                                      </table>
                                    </div>
                                    {hasTotals && (
                                      <div className="shrink-0">
                                        <p className="text-sm text-[#ECECEC]/80 dark:text-dark-text/80 mb-2">Итог по цветам</p>
                                        <table className="text-sm border border-white/15 dark:border-white/15 rounded overflow-hidden min-w-[200px]">
                                          <thead>
                                            <tr className="bg-accent-2/50 dark:bg-dark-800">
                                              <th className="text-left px-4 py-2 font-medium">Цвет</th>
                                              {pivot.sizes.map((s) => (
                                                <th key={s} className="text-center px-2 py-2 font-medium">{s}</th>
                                              ))}
                                              <th className="text-right px-4 py-2 font-medium">Итого</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Object.entries(totalsByColor).map(([color, { bySize, total }]) => (
                                              <tr key={color} className="border-t border-white/10">
                                                <td className="px-4 py-2">{color}</td>
                                                {pivot.sizes.map((s) => (
                                                  <td key={s} className="px-2 py-2 text-center">{bySize[s] ?? 0}</td>
                                                ))}
                                                <td className="px-4 py-2 text-right font-medium">{total}</td>
                                              </tr>
                                            ))}
                                            <tr className="border-t-2 border-white/20 bg-accent-2/30 dark:bg-dark-800 font-semibold">
                                              <td className="px-4 py-2">Итого по размерам</td>
                                              {pivot.sizes.map((s) => (
                                                <td key={s} className="px-2 py-2 text-center">{totalsBySize[s] ?? 0}</td>
                                              ))}
                                              <td className="px-4 py-2 text-right">{grandTotal}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {completeModalTask && (
        <CompleteByFactModal
          task={completeModalTask}
          onClose={() => setCompleteModalTask(null)}
          onSave={(actualVariants, endDate) =>
            completeModalTask.status === 'Готово'
              ? handleEditActualVariants(completeModalTask, actualVariants, endDate)
              : handleCompleteByFact(completeModalTask, actualVariants, endDate)
          }
          isEditMode={completeModalTask.status === 'Готово'}
        />
      )}
    </div>
  );
}
