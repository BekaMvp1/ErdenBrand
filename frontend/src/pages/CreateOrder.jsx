/**
 * Создание заказа
 * Матрица цвет×размер, как было. Добавлен выбор ростовки; общее количество разделено на две части: ростовка + количество.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { numInputValue } from '../utils/numInput';
import { NeonButton, NeonInput, NeonSelect } from '../components/ui';
import PrintButton from '../components/PrintButton';
import SizeGrid, { SIZE_GRID_MAP, sizeGridNumericFromSelection } from '../components/SizeGrid';
import CreateOrderModelSections from '../components/CreateOrderModelSections';
import ModelNameFromBasePicker from '../components/ModelNameFromBasePicker';
import { applyModelsBaseToCreateOrder } from '../utils/orderModelFromModelsBase';
import { formatSom, roundCost2, sumFabricOrAccessories, sumOps } from '../utils/createOrderCosts';

const ROSTOVKI = [
  { id: '165', name: '165' },
  { id: '170', name: '170' },
  { id: 'other', name: 'Другое' },
];

const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const NUMERIC_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56'];

const GRID_NUM_SET = new Set(SIZE_GRID_MAP.map((r) => r.num));

function buildSizeGridQuantities(selectedSizes, colorList, matrix) {
  const o = {};
  for (const size of selectedSizes) {
    const n = parseInt(size, 10);
    if (String(n) !== String(size).trim() || !GRID_NUM_SET.has(n)) continue;
    let sum = 0;
    (colorList || []).forEach((color) => {
      sum += parseInt(matrix[`${color}|${size}`], 10) || 0;
    });
    o[n] = sum;
  }
  return o;
}

function sortSizesForDisplay(a, b) {
  const sa = String(a).trim();
  const sb = String(b).trim();
  const na = parseInt(sa, 10);
  const nb = parseInt(sb, 10);
  if (!Number.isNaN(na) && String(na) === sa && !Number.isNaN(nb) && String(nb) === sb) {
    return na - nb;
  }
  return sa.localeCompare(sb, 'ru');
}

function buildColorQtyMap(colors, selectedSizes, matrix) {
  const out = {};
  (colors || []).forEach((color) => {
    let sum = 0;
    (selectedSizes || []).forEach((size) => {
      sum += parseInt(matrix[`${color}|${size}`], 10) || 0;
    });
    out[color] = sum;
  });
  return out;
}

/** Строку материала по цветам разворачиваем только если есть осмысленное наименование */
function materialRowHasName(row) {
  const raw =
    row?.baseName != null && String(row.baseName).trim() !== ''
      ? String(row.baseName)
      : row?.name != null
        ? String(row.name)
        : '';
  const n = raw.trim();
  if (!n) return false;
  if (n === '—' || n === '--') return false;
  return true;
}

function syncMaterialRowsByColor(prevRows, colors, colorQtyMap, totalQty) {
  const rows = Array.isArray(prevRows) ? prevRows : [];
  const uniqueColors = (colors || []).filter(Boolean);

  const baseMap = new Map();
  rows.forEach((row, idx) => {
    if (row?.splitManaged && row?.baseRowId) {
      if (!baseMap.has(row.baseRowId)) {
        baseMap.set(row.baseRowId, {
          ...row,
          id: row.baseRowId,
          name: row.baseName || row.name || '',
          baseName: row.baseName || row.name || '',
          splitManaged: false,
          color: null,
        });
      }
      return;
    }
    const baseRowId = row?.baseRowId || row?.id || `row-${idx}`;
    baseMap.set(baseRowId, {
      ...row,
      id: baseRowId,
      baseRowId,
      baseName: row?.baseName || row?.name || '',
      splitManaged: false,
      color: null,
    });
  });
  const baseRows = Array.from(baseMap.values());

  let next = [];
  if (uniqueColors.length > 1) {
    const existingByKey = new Map();
    rows.forEach((r) => {
      if (r?.splitManaged && r?.baseRowId && r?.color) {
        existingByKey.set(`${r.baseRowId}::${r.color}`, r);
      }
    });
    baseRows.forEach((base, baseIndex) => {
      if (!materialRowHasName(base)) {
        next.push({
          ...base,
          id: base.baseRowId || base.id || `base-${baseIndex}`,
          name: base.baseName || base.name || '',
          color: null,
          qtyTotal: '',
          splitManaged: false,
        });
        return;
      }
      uniqueColors.forEach((color) => {
        const key = `${base.baseRowId || base.id || baseIndex}::${color}`;
        const existed = existingByKey.get(key);
        const qtyColor = colorQtyMap[color] || 0;
        const baseName = base.baseName || base.name || '';
        next.push({
          ...base,
          ...existed,
          id: existed?.id || key,
          baseRowId: base.baseRowId || base.id || `base-${baseIndex}`,
          baseName,
          name: `${baseName} — ${color}`,
          color,
          qtyTotal: String(qtyColor),
          splitManaged: true,
        });
      });
    });
  } else {
    const onlyColor = uniqueColors[0] || null;
    const fallbackQty = Number.isFinite(totalQty) ? totalQty : 0;
    next = baseRows.map((base, idx) => ({
      ...base,
      id: base.baseRowId || base.id || `base-${idx}`,
      name: base.baseName || base.name || '',
      color: onlyColor,
      qtyTotal: String(onlyColor ? colorQtyMap[onlyColor] || 0 : fallbackQty),
      splitManaged: false,
    }));
  }

  const prevJson = JSON.stringify(rows);
  const nextJson = JSON.stringify(next);
  return prevJson === nextJson ? rows : next;
}

function firstModelPhoto(model) {
  const p = Array.isArray(model?.photos) ? model.photos[0] : null;
  return typeof p === 'string' && p.trim() !== '' ? p : null;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [colorSuggestions, setColorSuggestions] = useState([]);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const colorInputRef = useRef(null);
  const colorDropdownRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    tz_code: '',
    model_name: '',
    total_quantity: '',
    start_date: '',
    deadline: '',
    comment: '',
    planned_month: '',
    workshop_id: '',
    model_type: 'regular',
  });
  const [rostovka, setRostovka] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newColorInput, setNewColorInput] = useState('');
  const [editingRowTotal, setEditingRowTotal] = useState(null);
  const [orderPhotos, setOrderPhotos] = useState([]);
  const [commentPhotos, setCommentPhotos] = useState([]);
  const [fabric, setFabric] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [cuttingOps, setCuttingOps] = useState([]);
  const [sewingOps, setSewingOps] = useState([]);
  const [otkOps, setOtkOps] = useState([]);

  const loadRefs = useCallback(async () => {
    const [clientsRes, workshopsRes, floorsRes] = await Promise.all([
      api.references.clients(),
      api.workshops.list(),
      api.references.floors(),
    ]);
    setClients(clientsRes || []);
    const workshops = workshopsRes || [];
    const floors = floorsRes || [];
    const byName = new Map();
    workshops.forEach((w) => byName.set(w.name, { ...w, id: w.id, _source: 'workshop' }));
    floors.forEach((f) => {
      if (!byName.has(f.name)) {
        byName.set(f.name, { id: `floor-${f.id}`, floorId: f.id, name: f.name, _source: 'floor' });
      }
    });
    setWorkshops(Array.from(byName.values()));
  }, []);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  useRefreshOnVisible(loadRefs);

  useEffect(() => {
    const term = (newColorInput || '').trim();
    if (term.length < 2) {
      setColorSuggestions([]);
      setColorDropdownOpen(false);
      return;
    }
    const t = setTimeout(() => {
      api.references
        .colors(term)
        .then((data) => {
          setColorSuggestions(data || []);
          setColorDropdownOpen((data?.length || 0) > 0);
        })
        .catch(() => setColorSuggestions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [newColorInput]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        colorDropdownRef.current &&
        !colorDropdownRef.current.contains(e.target) &&
        colorInputRef.current &&
        !colorInputRef.current.contains(e.target)
      ) {
        setColorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalQty = parseInt(form.total_quantity, 10) || 0;
  const matrixSum = Object.values(matrix).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const isValid = totalQty > 0 && selectedSizes.length > 0 && colors.length > 0 && matrixSum === totalQty;
  const colorQtyMap = useMemo(
    () => buildColorQtyMap(colors, selectedSizes, matrix),
    [colors, selectedSizes, matrix],
  );

  const costTotals = useMemo(() => {
    const tq = totalQty;
    const total_fabric_cost = roundCost2(sumFabricOrAccessories(fabric, tq));
    const total_accessories_cost = roundCost2(sumFabricOrAccessories(accessories, tq));
    const total_cutting_cost = roundCost2(sumOps(cuttingOps, tq));
    const total_sewing_cost = roundCost2(sumOps(sewingOps, tq));
    const total_otk_cost = roundCost2(sumOps(otkOps, tq));
    const total_cost = roundCost2(
      total_fabric_cost + total_accessories_cost + total_cutting_cost + total_sewing_cost + total_otk_cost,
    );
    return {
      total_fabric_cost,
      total_accessories_cost,
      total_cutting_cost,
      total_sewing_cost,
      total_otk_cost,
      total_cost,
    };
  }, [fabric, accessories, cuttingOps, sewingOps, otkOps, totalQty]);

  const setCell = (color, size, value) => {
    const key = `${color}|${size}`;
    setMatrix((prev) => {
      const v = parseInt(value, 10);
      if (isNaN(v) || v <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: v };
    });
  };

  const getCell = (color, size) => matrix[`${color}|${size}`] || '';
  const { registerRef, handleKeyDown } = useGridNavigation(colors.length, selectedSizes.length);

  useEffect(() => {
    setFabric((prev) => syncMaterialRowsByColor(prev, colors, colorQtyMap, totalQty));
    setAccessories((prev) => syncMaterialRowsByColor(prev, colors, colorQtyMap, totalQty));
  }, [fabric, accessories, colors, colorQtyMap, totalQty]);

  const addSize = (sizeName) => {
    const name = String(sizeName || '').trim();
    if (!name) return;
    if (selectedSizes.includes(name)) return;
    setSelectedSizes((prev) => [...prev, name].sort());
    setNewSizeInput('');
  };

  const removeSize = (sizeName) => {
    setSelectedSizes((prev) => prev.filter((s) => s !== sizeName));
    setMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.endsWith(`|${sizeName}`)) delete next[k];
      });
      return next;
    });
  };

  const addColor = (colorName) => {
    const name = String(colorName || '').trim();
    if (!name) return;
    if (colors.includes(name)) return;
    setColors((prev) => [...prev, name].sort());
    setNewColorInput('');
    setColorDropdownOpen(false);
  };

  const removeColor = (colorName) => {
    setColors((prev) => prev.filter((c) => c !== colorName));
    setMatrix((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${colorName}|`)) delete next[k];
      });
      return next;
    });
  };

  const clearMatrix = () => setMatrix({});
  const fillZeros = () => {
    const next = { ...matrix };
    colors.forEach((c) => {
      selectedSizes.forEach((s) => {
        const key = `${c}|${s}`;
        if (!(key in next) || next[key] === '' || next[key] === 0) next[key] = 0;
      });
    });
    setMatrix(next);
  };

  const distributeRowTotal = (color, totalStr) => {
    const total = parseInt(totalStr, 10) || 0;
    if (total <= 0 || selectedSizes.length === 0) return;
    const n = selectedSizes.length;
    const base = Math.floor(total / n);
    const remainder = total % n;
    setMatrix((prev) => {
      const next = { ...prev };
      selectedSizes.forEach((s, i) => {
        const key = `${color}|${s}`;
        next[key] = i < remainder ? base + 1 : base;
      });
      return next;
    });
  };

  const handleAddSizeFromInput = () => {
    if (newSizeInput.trim()) addSize(newSizeInput.trim());
  };

  const handleAddColorFromInput = () => {
    if (newColorInput.trim()) addColor(newColorInput.trim());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) {
      alert('Заполните матрицу: сумма должна равняться общему количеству');
      return;
    }
    setLoading(true);
    try {
      const variants = [];
      colors.forEach((color) => {
        selectedSizes.forEach((size) => {
          const q = parseInt(getCell(color, size), 10) || 0;
          if (q > 0) variants.push({ color, size, quantity: q });
        });
      });
      const size_grid_numeric = sizeGridNumericFromSelection(selectedSizes);
      const size_grid_quantities = buildSizeGridQuantities(selectedSizes, colors, matrix);
      const order = await api.orders.create({
        client_id: parseInt(form.client_id, 10),
        tz_code: form.tz_code,
        model_name: form.model_name,
        title: `${form.tz_code} — ${form.model_name}`,
        total_quantity: totalQty,
        start_date: form.start_date || undefined,
        deadline: form.deadline,
        receipt_date: form.start_date || undefined,
        comment: form.comment || undefined,
        planned_month: form.planned_month,
        workshop_id: form.workshop_id.toString().startsWith('floor-')
          ? null
          : parseInt(form.workshop_id, 10),
        model_type: form.model_type || 'regular',
        floor_id: form.workshop_id.toString().startsWith('floor-')
          ? parseInt(form.workshop_id.replace('floor-', ''), 10)
          : undefined,
        sizes: selectedSizes,
        variants,
        size_grid_numeric,
        size_grid_quantities,
        photos: orderPhotos,
        total_fabric_cost: costTotals.total_fabric_cost,
        total_accessories_cost: costTotals.total_accessories_cost,
        total_cutting_cost: costTotals.total_cutting_cost,
        total_sewing_cost: costTotals.total_sewing_cost,
        total_otk_cost: costTotals.total_otk_cost,
        total_cost: costTotals.total_cost,
      });
      if ((form.comment || '').trim() || commentPhotos.length > 0) {
        await api.orders.addComment(order.id, {
          text: (form.comment || '').trim() || undefined,
          photos: commentPhotos.length > 0 ? commentPhotos : undefined,
        });
      }
      navigate(`/orders/${order.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text">Создать заказ</h1>
        <PrintButton />
      </div>
      <form
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto card-neon rounded-card p-4 sm:p-6 space-y-4 transition-block"
      >
        <div>
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Клиент</label>
          <NeonSelect
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            required
          >
            <option value="">Выберите клиента</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </NeonSelect>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">ТЗ</label>
            <NeonInput
              type="text"
              value={form.tz_code}
              onChange={(e) => setForm({ ...form, tz_code: e.target.value })}
              maxLength={10}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Название модели</label>
            <NeonInput
              type="text"
              value={form.model_name}
              onChange={(e) => setForm({ ...form, model_name: e.target.value })}
              required
            />
          </div>
          <div className="md:col-start-2 w-full">
            <ModelNameFromBasePicker
              onModelLoaded={(full) => {
                applyModelsBaseToCreateOrder(full, {
                  setForm,
                  setFabric,
                  setAccessories,
                  setCuttingOps,
                  setSewingOps,
                  setOtkOps,
                });
                const photo = firstModelPhoto(full);
                setOrderPhotos(photo ? [photo] : []);
              }}
            />
          </div>
          <p className="md:col-span-2 mt-1 text-xs text-[#ECECEC]/70">
            Получится: {(form.tz_code || '...').trim()} — {(form.model_name || '...').trim()}
          </p>
        </div>

        {/* Две части: ростовка + общее количество */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Ростовка</label>
            <NeonSelect
              value={rostovka}
              onChange={(e) => setRostovka(e.target.value)}
              className="w-full"
            >
              <option value="">Выберите ростовку</option>
              {ROSTOVKI.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </NeonSelect>
          </div>
          <div>
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Общее количество</label>
            <NeonInput
              type="number"
              min="1"
              value={form.total_quantity}
              onChange={(e) => setForm({ ...form, total_quantity: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border-[0.5px] border-white/20 bg-accent-2/20 p-3">
            <label className="flex items-center gap-2 text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">
              <svg className="w-4 h-4 text-[#ECECEC]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
              </svg>
              Дата поступления заказа
            </label>
            <NeonInput
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <p className="mt-2 text-xs text-[#ECECEC]/55 dark:text-dark-text/50">
              Можно указать дату в прошлом
            </p>
          </div>
          <div className="rounded-xl border-[0.5px] border-white/20 bg-accent-2/20 p-3">
            <label className="flex items-center gap-2 text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">
              <svg className="w-4 h-4 text-[#ECECEC]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Дедлайн
            </label>
            <NeonInput
              type="date"
              min={today}
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Комментарий</label>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
            rows={2}
            placeholder="Текст комментария (опционально)"
          />
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {commentPhotos.map((photo, idx) => (
              <div key={idx} className="relative group">
                <img src={photo} alt={`Фото ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-white/25" />
                <button
                  type="button"
                  onClick={() => setCommentPhotos((p) => p.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {commentPhotos.length < 10 && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-white/30 hover:border-primary-500 cursor-pointer transition-colors text-sm text-[#ECECEC]/80">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setCommentPhotos((p) => [...p, reader.result].slice(0, 10));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добавить фото
              </label>
            )}
          </div>
        </div>

        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Тип модели</label>
              <NeonSelect
                value={form.model_type}
                onChange={(e) => setForm({ ...form, model_type: e.target.value })}
              >
                <option value="regular">Обычная</option>
                <option value="set">Комплект (двойка, тройка и т.д.)</option>
              </NeonSelect>
            </div>
            <div>
              <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Месяц плана</label>
              <NeonSelect
                value={form.planned_month}
                onChange={(e) => setForm({ ...form, planned_month: e.target.value })}
                required
              >
                <option value="">Выберите месяц</option>
                {[
                  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
                ].map((m, i) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </NeonSelect>
            </div>
            <div>
              <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-1">Цех пошива</label>
              <NeonSelect
                value={form.workshop_id}
                onChange={(e) => setForm({ ...form, workshop_id: e.target.value })}
                required
              >
                <option value="">Выберите цех</option>
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </NeonSelect>
            </div>
          </div>
        </div>

        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Фото заказа</label>
          <div className="flex flex-wrap gap-3 items-start">
            {orderPhotos.map((photo, idx) => (
              <div key={idx} className="relative group">
                <img src={photo} alt={`Фото ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-white/25" />
                <button
                  type="button"
                  onClick={() => setOrderPhotos((p) => p.filter((_, i) => i !== idx))}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {orderPhotos.length < 10 && (
              <label className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/30 hover:border-primary-500 cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setOrderPhotos((p) => [...p, reader.result].slice(0, 10));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
                <svg className="w-6 h-6 text-[#ECECEC]/60 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs text-[#ECECEC]/70">Добавить</span>
              </label>
            )}
          </div>
        </div>

        {/* Цвета и размеры — как было */}
        <div className="border-t border-white/25 dark:border-white/25 pt-6 mt-6">
          <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">Цвета и размеры</h2>

          <div className="mb-4">
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Размеры</label>
            <p className="text-xs text-[#ECECEC]/60 dark:text-dark-text/50 mb-2">Размерная сетка (38–56): число и буква — один размер; жёлтая подсветка — выбрано.</p>
            <div className="rounded-xl border border-white/20 bg-accent-2/15 p-3 mb-4 overflow-x-auto">
              <SizeGrid
                value={sizeGridNumericFromSelection(selectedSizes)}
                readOnly={false}
                showQuantity={false}
                onChange={(nums) => {
                  const keep = selectedSizes.filter((s) => {
                    const t = String(s).trim();
                    const n = parseInt(t, 10);
                    if (!Number.isNaN(n) && String(n) === t && GRID_NUM_SET.has(n)) return false;
                    const row = SIZE_GRID_MAP.find((m) => m.letter.toUpperCase() === t.toUpperCase());
                    if (row) return false;
                    if (t.toUpperCase() === '3XL') return false;
                    return true;
                  });
                  const merged = [...new Set([...keep, ...nums.map(String)])].sort(sortSizesForDisplay);
                  setSelectedSizes(merged);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="text-[#ECECEC]/60 text-xs mr-1">Цифровые:</span>
              {[...NUMERIC_SIZES, ...selectedSizes.filter((s) => /^\d+$/.test(s) && !NUMERIC_SIZES.includes(s))].map((name) => (
                <label key={name} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedSizes.includes(name)}
                    onChange={(e) => (e.target.checked ? addSize(name) : removeSize(name))}
                    className="rounded"
                  />
                  <span className="text-[#ECECEC] dark:text-dark-text">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="text-[#ECECEC]/60 text-xs mr-1">Буквенные:</span>
              {[...LETTER_SIZES, ...selectedSizes.filter((s) => !/^\d+$/.test(s) && !LETTER_SIZES.includes(s))].map((name) => (
                <label key={name} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selectedSizes.includes(name)}
                    onChange={(e) => (e.target.checked ? addSize(name) : removeSize(name))}
                    className="rounded"
                  />
                  <span className="text-[#ECECEC] dark:text-dark-text">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="text"
                value={newSizeInput}
                onChange={(e) => setNewSizeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSizeFromInput())}
                placeholder="+ Добавить размер"
                className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
              />
              <button
                type="button"
                onClick={handleAddSizeFromInput}
                className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Добавить
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-[#ECECEC] dark:text-dark-text/90 mb-2">Цвета</label>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              {colors.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text"
                >
                  {c}
                  <button type="button" onClick={() => removeColor(c)} className="text-red-400 hover:text-red-300 text-sm">×</button>
                </span>
              ))}
              <div className="relative flex gap-2" ref={colorDropdownRef}>
                <input
                  ref={colorInputRef}
                  type="text"
                  value={newColorInput}
                  onChange={(e) => setNewColorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColorFromInput())}
                  onFocus={() => newColorInput?.trim().length >= 2 && colorSuggestions.length > 0 && setColorDropdownOpen(true)}
                  placeholder="+ Добавить цвет"
                  className="px-3 py-1.5 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-sm min-w-[140px]"
                />
                <button
                  type="button"
                  onClick={handleAddColorFromInput}
                  className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  Добавить
                </button>
                {colorDropdownOpen && colorSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 py-1 bg-accent-2 dark:bg-dark-800 border border-white/25 rounded-lg shadow-lg max-h-48 overflow-auto top-full left-0 min-w-[200px]">
                    {colorSuggestions.map((c) => (
                      <li
                        key={c.id}
                        className="px-4 py-2 cursor-pointer hover:bg-accent-1/30 dark:hover:bg-dark-2 text-[#ECECEC] dark:text-dark-text"
                        onClick={() => addColor(c.name)}
                      >
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {selectedSizes.length > 0 && colors.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/25 -mx-1">
              <table className="w-full text-sm border-collapse min-w-[280px] table-fixed">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-r border-white/15">Цвет</th>
                    {selectedSizes.map((s) => (
                      <th key={s} className="px-2 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 text-center w-20">{s}</th>
                    ))}
                    <th className="px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text/90 border-b border-white/15 text-center">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color, ci) => {
                    const rowSum = selectedSizes.reduce((a, s) => a + (parseInt(getCell(color, s), 10) || 0), 0);
                    return (
                      <tr key={color} className="border-b border-white/15">
                        <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text border-r border-white/15">{color}</td>
                        {selectedSizes.map((size, si) => (
                          <td key={size} className="px-2 py-2 border-b border-white/15 text-center w-20">
                            <input
                              ref={registerRef(ci, si)}
                              type="number"
                              min="0"
                              placeholder="0"
                              value={numInputValue(getCell(color, size))}
                              onChange={(e) => setCell(color, size, e.target.value)}
                              onKeyDown={handleKeyDown(ci, si)}
                              className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center box-border"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 border-b border-white/15 text-center w-20">
                          <input
                            type="number"
                            min="0"
                            value={editingRowTotal?.color === color ? editingRowTotal.value : String(rowSum)}
                            onFocus={() => setEditingRowTotal({ color, value: String(rowSum) })}
                            onChange={(e) => setEditingRowTotal((p) => (p?.color === color ? { ...p, value: e.target.value } : p))}
                            onBlur={(e) => {
                              distributeRowTotal(color, e.target.value);
                              setEditingRowTotal(null);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target.blur(), e.preventDefault())}
                            title="Введите итог — распределится по размерам"
                            className="w-16 min-w-16 mx-auto block px-2 py-1 rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text text-center box-border font-medium"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-b border-white/20">
                    <td className="px-4 py-3 font-medium text-[#ECECEC] dark:text-dark-text border-r border-white/15">Итого</td>
                    {selectedSizes.map((size) => {
                      const colSum = colors.reduce((a, c) => a + (parseInt(getCell(c, size), 10) || 0), 0);
                      return <td key={size} className="px-2 py-3 font-medium text-[#ECECEC] dark:text-dark-text text-center w-20">{colSum}</td>;
                    })}
                    <td className={`px-4 py-3 font-bold text-center ${matrixSum === totalQty && totalQty > 0 ? 'text-green-400' : matrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC] dark:text-dark-text'}`}>
                      {matrixSum}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-2 flex gap-2 flex-wrap items-center">
                <button type="button" onClick={clearMatrix} className="text-sm px-3 py-1.5 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40">
                  Очистить матрицу
                </button>
                <button type="button" onClick={fillZeros} className="text-sm px-3 py-1.5 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40">
                  Заполнить нулями
                </button>
                <span className={`text-sm py-1.5 ${matrixSum === totalQty && totalQty > 0 ? 'text-green-400' : matrixSum > 0 ? 'text-red-400' : 'text-[#ECECEC]/80'}`}>
                  Сумма: {matrixSum} / {totalQty}
                  {matrixSum === totalQty && totalQty > 0 ? ' ✓' : matrixSum > 0 ? ' — не совпадает' : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        <CreateOrderModelSections
          totalQty={totalQty}
          fabric={fabric}
          setFabric={setFabric}
          accessories={accessories}
          setAccessories={setAccessories}
          cuttingOps={cuttingOps}
          setCuttingOps={setCuttingOps}
          sewingOps={sewingOps}
          setSewingOps={setSewingOps}
          otkOps={otkOps}
          setOtkOps={setOtkOps}
        />

        <div
          className="mt-6 overflow-hidden"
          style={{
            background: '#0f1a0f',
            border: '1px solid #2d5a2d',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 className="text-lg font-semibold text-[#ECECEC] mb-3 flex items-center gap-2">
            <span aria-hidden>📊</span> Калькуляция расходов
          </h2>
          <table className="w-full text-sm text-[#ECECEC] border-collapse">
            <tbody>
              {[
                ['Ткань (итого)', costTotals.total_fabric_cost],
                ['Фурнитура (итого)', costTotals.total_accessories_cost],
                ['Раскрой — итого расценок', costTotals.total_cutting_cost],
                ['Пошив — итого расценок', costTotals.total_sewing_cost],
                ['ОТК — итого расценок', costTotals.total_otk_cost],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-[#2d5a2d]/50">
                  <td className="py-2 pr-4 text-left">{label}</td>
                  <td className="py-2 text-right tabular-nums whitespace-nowrap">{formatSom(val)} сом</td>
                </tr>
              ))}
              <tr>
                <td
                  className="pt-4 font-bold"
                  style={{ color: '#C8FF00', fontSize: 18 }}
                >
                  Итого расходов
                </td>
                <td
                  className="pt-4 text-right tabular-nums font-bold whitespace-nowrap"
                  style={{ color: '#C8FF00', fontSize: 18 }}
                >
                  {formatSom(costTotals.total_cost)} сом
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 pt-2 border-t border-white/25 pt-6 mt-6">
          <NeonButton type="submit" disabled={loading || !isValid}>
            {loading ? 'Создание...' : 'Создать заказ'}
          </NeonButton>
        </div>
      </form>
    </div>
  );
}
