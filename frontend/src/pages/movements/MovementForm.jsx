/**
 * Документ перемещения материалов между этапами
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { flattenFabricLike } from '../../components/CreateOrderModelSections';
import { api } from '../../api';

const STAGES = [
  { value: 'warehouse', label: '🏭 Склад' },
  { value: 'cutting', label: '✂️ Раскрой' },
  { value: 'sewing', label: '🧵 Пошив' },
  { value: 'otk', label: '🔍 ОТК' },
  { value: 'shipment', label: '📦 Отгрузка' },
];

const STAGE_TYPE_VALUES = STAGES.map((s) => s.value);

function stageToggleLabel(t) {
  if (t === 'warehouse') return '🏭 Склад';
  if (t === 'cutting') return '✂️ Раскрой';
  if (t === 'sewing') return '🧵 Пошив';
  if (t === 'otk') return '🔍 ОТК';
  if (t === 'shipment') return '📦 Отгрузка';
  return t;
}

const ERDEN_SIZES = [
  '38/XXS',
  '40/XS',
  '42/S',
  '44/M',
  '46/L',
  '48/XL',
  '50/2XL',
  '52/3XL',
  '54/4XL',
  '56/5XL',
];

const NUM_TO_ERDEN = {
  38: '38/XXS',
  40: '40/XS',
  42: '42/S',
  44: '44/M',
  46: '46/L',
  48: '48/XL',
  50: '50/2XL',
  52: '52/3XL',
  54: '54/4XL',
  56: '56/5XL',
};

const CELL = {
  padding: '6px 8px',
  fontSize: 13,
  verticalAlign: 'middle',
  minHeight: 44,
  boxSizing: 'border-box',
};

const CTRL = {
  fontSize: 13,
  padding: '6px 8px',
  height: 36,
  background: '#1a1a2e',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
};

const TH_BASE = {
  fontSize: 12,
  padding: '8px 8px',
  fontWeight: 600,
  background: '#1e3a5f',
  color: '#cbd5e1',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const TH_SIZE = {
  minWidth: 58,
  fontSize: 12,
  padding: '4px 4px',
  textAlign: 'center',
  fontWeight: 600,
  background: '#1e3a5f',
  color: '#cbd5e1',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const TH = {
  padding: '8px 8px',
  fontSize: 12,
  fontWeight: 600,
  color: '#cbd5e1',
  textAlign: 'left',
  borderBottom: '1px solid #1e3a5f',
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '6px 8px',
  fontSize: 13,
  verticalAlign: 'middle',
  borderBottom: '1px solid #1e2a3a',
};

const ADD_BTN = {
  marginTop: 12,
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const TOTALS_STYLE = {
  marginTop: 12,
  padding: '10px 16px',
  background: '#1e3a5f',
  borderRadius: 8,
  display: 'flex',
  gap: 24,
  flexWrap: 'wrap',
  fontSize: 14,
};

/** Сохранение строки Пошив→ОТК в item_name без изменений бэкенда */
const SEW_OTK_PREFIX = 'SEW_OTK_JSON:';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function batchFabricKey(name) {
  return String(name || '').trim().toLowerCase();
}

/**
 * Пересчёт total_qty, effective_stock, remainder, shortage по порядку строк:
 * у одной ткани следующая строка «видит» склад минус факт предыдущих строк.
 */
function applyRunningRouteBMetrics(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((b, idx) => {
    const key = batchFabricKey(b.fabric_name);
    const baseStock = parseFloat(String(b.stock_qty ?? 0)) || 0;
    let usedBefore = 0;
    if (key) {
      for (let i = 0; i < idx; i += 1) {
        const prev = rows[i];
        if (batchFabricKey(prev.fabric_name) === key) {
          usedBefore += parseFloat(String(prev.fact_meters ?? 0)) || 0;
        }
      }
    }
    const effective_stock = Math.max(0, baseStock - usedBefore);
    const fact = parseFloat(String(b.fact_meters ?? 0)) || 0;
    const defect = parseFloat(String(b.defect_meters ?? 0)) || 0;
    const remainder = effective_stock - fact - defect;
    const shortage = remainder < 0 ? Math.abs(remainder) : 0;
    const total_qty = Object.values(b.sizes || {}).reduce(
      (a, v) => a + (parseInt(String(v), 10) || 0),
      0
    );
    return { ...b, total_qty, effective_stock, remainder, shortage };
  });
}

/** Остаток ткани: сначала выбранный склад «откуда», иначе сумма по всем складам */
function aggregateFabricStockFromSources(fabricName, specificStock, allStock) {
  const name = String(fabricName || '').toLowerCase();
  if (!name) return 0;
  const match = (items) =>
    (items || []).filter((s) =>
      (s.name || s.material_name || '').toLowerCase().includes(name)
    );
  const specific = match(specificStock);
  if (specific.length > 0) {
    return specific.reduce(
      (a, s) => a + (parseFloat(s.total_qty ?? s.qty ?? s.quantity ?? 0) || 0),
      0
    );
  }
  const all = match(allStock);
  return all.reduce(
    (a, s) => a + (parseFloat(s.total_qty ?? s.qty ?? s.quantity ?? 0) || 0),
    0
  );
}

/** Остатки для таблицы Б: все склады + при необходимости выбранный склад «откуда» */
async function fetchRouteBStockArrays(warehouseId) {
  let allArr = [];
  try {
    const data = await api.warehouse.stock();
    allArr = Array.isArray(data) ? data : data?.items || data?.rows || [];
  } catch {
    allArr = [];
  }
  let specArr = [];
  const wid =
    warehouseId && String(warehouseId).trim() !== '' && !Number.isNaN(Number(warehouseId))
      ? Number(warehouseId)
      : null;
  if (wid) {
    try {
      const data = await api.warehouse.stock({ warehouse_id: wid });
      specArr = Array.isArray(data) ? data : data?.items || data?.rows || [];
    } catch {
      specArr = [];
    }
  }
  return { allArr, specArr };
}

function matchErdenSize(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (ERDEN_SIZES.includes(s)) return s;
  const m = s.match(/\b(38|40|42|44|46|48|50|52|54|56)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    return NUM_TO_ERDEN[n] || null;
  }
  return null;
}

function extractActiveSizes(order) {
  const qtyByLabel = {};
  for (const v of order?.variants || []) {
    const label = matchErdenSize(v?.size);
    if (!label) continue;
    qtyByLabel[label] = (qtyByLabel[label] || 0) + toNum(v.quantity);
  }
  const sg = order?.size_grid?.quantities;
  if (sg && typeof sg === 'object' && !Array.isArray(sg)) {
    for (const key of Object.keys(sg)) {
      const label = matchErdenSize(key);
      if (!label) continue;
      qtyByLabel[label] = (qtyByLabel[label] || 0) + toNum(sg[key]);
    }
  }
  return ERDEN_SIZES.filter((s) => (qtyByLabel[s] || 0) > 0);
}

function normalizeColorsField(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') return raw.split(',').map((c) => c.trim()).filter(Boolean);
  return [];
}

function extractOrderColors(order) {
  const merged = new Set();
  for (const c of normalizeColorsField(order?.colors)) merged.add(c);
  for (const c of normalizeColorsField(order?.color_data)) merged.add(c);
  if (merged.size) return [...merged].sort();
  const fromVariants = [
    ...new Set((order?.variants || []).map((v) => v.color).filter(Boolean)),
  ];
  if (fromVariants.length) return fromVariants.sort();
  if (order?.color) return [String(order.color)];
  return [];
}

function emptySizes(activeSizes) {
  const o = {};
  activeSizes.forEach((s) => {
    o[s] = 0;
  });
  return o;
}

function movementRoute(from, to) {
  return `${from}→${to}`;
}

/** Таблица А — все маршруты, кроме B и C */
function isRouteA(from, to) {
  const R = movementRoute(from, to);
  return (
    R !== 'cutting→sewing' &&
    R !== 'sewing→otk' &&
    R !== 'otk→warehouse' &&
    R !== 'otk→shipment'
  );
}

function isRouteB(from, to) {
  return movementRoute(from, to) === 'cutting→sewing';
}

/** Таблица В — изделия по размерам */
function isRouteC(from, to) {
  const R = movementRoute(from, to);
  return R === 'sewing→otk' || R === 'otk→warehouse' || R === 'otk→shipment';
}

/** Сохранение партии раскрой→пошив в item_name без изменений бэкенда */
const CUT_BATCH_PREFIX = 'CUT_SEW_BATCH_JSON:';

function displayBatchColor(batch) {
  if (batch.color === '__other__') return String(batch.colorOther || '').trim();
  return String(batch.color || '').trim();
}

function buildCutBatchMaterialName(batch) {
  const payload = {
    color: displayBatchColor(batch),
    colorOther: String(batch.colorOther || ''),
    fabric_name: String(batch.fabric_name || ''),
    stock_qty: toNum(batch.stock_qty),
    plan_meters: toNum(batch.plan_meters),
    fact_meters: toNum(batch.fact_meters),
    sizes: batch.sizes && typeof batch.sizes === 'object' ? batch.sizes : {},
    total_qty: toNum(batch.total_qty),
    marking: String(batch.marking || ''),
    remainder: toNum(batch.remainder),
    shortage: toNum(batch.shortage),
    defect_meters: toNum(batch.defect_meters),
    operation: String(batch.operation || ''),
    operation_cost: toNum(batch.operation_cost),
    norm_per_unit: toNum(batch.norm_per_unit),
  };
  return `${CUT_BATCH_PREFIX}${JSON.stringify(payload)}`;
}

function parseCutBatchItemToBatch(it, activeSizes, idx) {
  const raw = String(it?.item_name || it?.material_name || '').trim();
  const baseSizes = emptySizes(activeSizes);
  if (raw.startsWith(CUT_BATCH_PREFIX)) {
    try {
      const p = JSON.parse(raw.slice(CUT_BATCH_PREFIX.length));
      const mergedSizes = { ...baseSizes, ...(p.sizes && typeof p.sizes === 'object' ? p.sizes : {}) };
      const total_qty =
        Object.values(mergedSizes).reduce((a, b) => a + toNum(b), 0) || toNum(p.total_qty);
      const col = String(p.color || '');
      return {
        id: `b-db-${it.id}-${idx}`,
        color: col,
        colorOther: String(p.colorOther || ''),
        fabric_name: String(p.fabric_name || ''),
        stock_qty: toNum(p.stock_qty),
        plan_meters: toNum(p.plan_meters),
        fact_meters: toNum(p.fact_meters),
        sizes: mergedSizes,
        total_qty,
        marking: String(p.marking || ''),
        remainder: toNum(p.remainder),
        shortage: toNum(p.shortage),
        defect_meters: toNum(p.defect_meters),
        operation: String(p.operation || ''),
        operation_cost: toNum(p.operation_cost ?? it.price),
        norm_per_unit: toNum(p.norm_per_unit),
      };
    } catch {
      /* fall through */
    }
  }
  return {
    id: `b-db-${it.id}-${idx}`,
    color: '',
    colorOther: '',
    fabric_name: raw.split(/\s·\s/)[0] || raw || '',
    stock_qty: 0,
    plan_meters: toNum(it.qty),
    fact_meters: 0,
    sizes: { ...baseSizes },
    total_qty: 0,
    marking: '',
    remainder: 0,
    shortage: 0,
    defect_meters: 0,
    operation: '',
    operation_cost: toNum(it.price),
    norm_per_unit: 0,
  };
}

function loadMovementOps(order, fromT, toT) {
  if (!order) return [];
  if (isRouteB(fromT, toT)) {
    const ops = order.cutting_ops || [];
    return Array.isArray(ops) ? ops : [];
  }
  if (isRouteC(fromT, toT)) {
    if (fromT === 'sewing') {
      const ops = order.sewing_ops || [];
      return Array.isArray(ops) ? ops : [];
    }
    if (fromT === 'otk') {
      const ops = order.otk_ops || [];
      return Array.isArray(ops) ? ops : [];
    }
  }
  return [];
}

function newSimpleRowId() {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyRowA() {
  return {
    id: newSimpleRowId(),
    color: '',
    colorOther: '',
    material_id: null,
    material_name: '',
    unit: 'м',
    stock_qty: 0,
    qty: 0,
    rolls: 0,
    price: 0,
    overStock: false,
  };
}

function newBatchId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyBatchRow(activeSizes) {
  const sz = activeSizes?.length ? activeSizes : ERDEN_SIZES;
  return {
    id: newBatchId(),
    color: '',
    colorOther: '',
    fabric_name: '',
    stock_qty: 0,
    plan_meters: 0,
    fact_meters: 0,
    sizes: emptySizes(sz),
    total_qty: 0,
    marking: '',
    remainder: 0,
    shortage: 0,
    defect_meters: 0,
    operation: '',
    operation_cost: 0,
    norm_per_unit: 0,
  };
}

/** Цвета заказа для автопартий маршрута Б (как в ТЗ) */
function parseOrderColorsRouteB(order) {
  const raw = order?.colors;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((c) => c.trim()).filter(Boolean);
  return [];
}

/** Название ткани из разных форматов строки заказа / модели */
function getFabricName(f) {
  if (!f || typeof f !== 'object') return '';
  return (
    f.name ||
    f.material_name ||
    f.название ||
    f.наименование ||
    f.title ||
    f.fabric_name ||
    ''
  );
}

/** Норма м/ед из разных полей */
function getFabricQtyPerUnit(f) {
  if (!f || typeof f !== 'object') return '';
  const v =
    f.qty_per_unit ??
    f.quantity_per ??
    f.norm ??
    f.qtyPerUnit ??
    f.qty ??
    '';
  return v !== '' && v != null ? String(v) : '';
}

/**
 * Ткани заказа из всех известных мест хранения (массив объектов для select).
 */
function getFabrics(order) {
  if (!order || typeof order !== 'object') return [];

  const fd = order.fabric_data;

  if (Array.isArray(fd) && fd.length > 0) {
    return fd;
  }

  if (fd && typeof fd === 'object' && !Array.isArray(fd)) {
    const flat = flattenFabricLike(fd);
    if (flat.length > 0) {
      return flat.map((r) => ({
        name: r.name || '',
        material_name: r.name || '',
        qty_per_unit: r.qtyPerUnit || '',
        quantity_per: r.qtyPerUnit || '',
        unit: r.unit || 'м',
      }));
    }
  }

  if (typeof fd === 'string') {
    try {
      const parsed = JSON.parse(fd);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const flat = flattenFabricLike(parsed);
        if (flat.length > 0) {
          return flat.map((r) => ({
            name: r.name || '',
            material_name: r.name || '',
            qty_per_unit: r.qtyPerUnit || '',
            quantity_per: r.qtyPerUnit || '',
            unit: r.unit || 'м',
          }));
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (Array.isArray(order.fabrics) && order.fabrics.length > 0) {
    return order.fabrics;
  }

  if (Array.isArray(order.materials) && order.materials.length > 0) {
    return order.materials.filter(
      (m) => m && (m.type === 'fabric' || m.тип === 'Ткань')
    );
  }

  const mb = order.ModelBase || order.ModelsBase || order.model_base || order.models_base;
  if (mb && mb.fabric != null) {
    try {
      const f = typeof mb.fabric === 'string' ? JSON.parse(mb.fabric) : mb.fabric;
      if (Array.isArray(f) && f.length > 0) return f;
    } catch {
      /* ignore */
    }
    if (Array.isArray(mb.fabric) && mb.fabric.length > 0) return mb.fabric;
    if (mb.fabric_data && typeof mb.fabric_data === 'object') {
      const flat = flattenFabricLike(mb.fabric_data);
      if (flat.length > 0) {
        return flat.map((r) => ({
          name: r.name || '',
          material_name: r.name || '',
          qty_per_unit: r.qtyPerUnit || '',
          quantity_per: r.qtyPerUnit || '',
          unit: r.unit || 'м',
        }));
      }
    }
  }

  if (Array.isArray(order.fabric) && order.fabric.length > 0) {
    return order.fabric;
  }

  return [];
}

/** Партии Цвет × Ткань при выборе заказа (Раскрой→Пошив) */
function buildAutoBatchesRouteB(order, sz, specificStock, allStock) {
  const parsedColors = parseOrderColorsRouteB(order);
  const fabrics = getFabrics(order);
  const colorList = parsedColors.length > 0 ? parsedColors : [''];
  const fabricList = fabrics.length > 0 ? fabrics : [{}];
  const orderQty = toNum(order?.quantity ?? order?.total_quantity ?? order?.total_qty);
  const sizeKeys = sz?.length ? sz : ERDEN_SIZES;
  const spec = specificStock || [];
  const all = allStock || [];
  const autoBatches = [];
  for (const color of colorList) {
    for (const fabric of fabricList) {
      const qpuRaw =
        fabric?.qty_per_unit ??
        fabric?.quantity_per ??
        fabric?.norm ??
        fabric?.qtyPerUnit ??
        fabric?.qty;
      const qpu = qpuRaw != null && qpuRaw !== '' ? parseFloat(qpuRaw) : NaN;
      const norm = Number.isFinite(qpu) ? qpu : 0;
      const fabricName = getFabricName(fabric);
      const stockQty = fabricName
        ? aggregateFabricStockFromSources(fabricName, spec, all)
        : 0;
      const base = {
        id: newBatchId(),
        color: color || '',
        colorOther: '',
        fabric_name: fabricName,
        stock_qty: stockQty,
        plan_meters: norm ? norm * orderQty : 0,
        fact_meters: 0,
        sizes: Object.fromEntries(sizeKeys.map((s) => [s, 0])),
        total_qty: 0,
        marking: '',
        remainder: 0,
        shortage: 0,
        defect_meters: 0,
        operation: '',
        operation_cost: 0,
        norm_per_unit: norm,
      };
      autoBatches.push(base);
    }
  }
  const fallback = {
    id: newBatchId(),
    color: '',
    colorOther: '',
    fabric_name: '',
    stock_qty: 0,
    plan_meters: 0,
    fact_meters: 0,
    sizes: Object.fromEntries(sizeKeys.map((s) => [s, 0])),
    total_qty: 0,
    marking: '',
    remainder: 0,
    shortage: 0,
    defect_meters: 0,
    operation: '',
    operation_cost: 0,
    norm_per_unit: 0,
  };
  return applyRunningRouteBMetrics(autoBatches.length > 0 ? autoBatches : [fallback]);
}

function displaySimpleRowColor(row) {
  if (row.color === '__other__') return String(row.colorOther || '').trim();
  return String(row.color || '').trim();
}

async function fetchStockItemsForWarehouseCutting(orderId, warehouseId) {
  let items = [];
  const params = {};
  if (orderId) params.order_id = orderId;
  if (warehouseId) params.warehouse_id = warehouseId;
  try {
    const st = Object.keys(params).length
      ? await api.warehouse.stock(params)
      : await api.warehouse.stock();
    items = Array.isArray(st) ? st : [];
  } catch {
    items = [];
  }
  if (orderId && !items.length) {
    try {
      const stAll = warehouseId
        ? await api.warehouse.stock({ warehouse_id: warehouseId })
        : await api.warehouse.stock();
      items = Array.isArray(stAll) ? stAll : [];
    } catch {
      items = [];
    }
  }
  return items;
}

function buildSewingOtkMaterialName(row) {
  const payload = {
    photo: row.photo || '',
    model_name: String(row.model_name || '').trim(),
    color: String(row.color || ''),
    colorOther: String(row.colorOther || ''),
    sizes: row.sizes && typeof row.sizes === 'object' ? row.sizes : {},
    operation: String(row.operation || ''),
    operation_cost: toNum(row.operation_cost),
  };
  return `${SEW_OTK_PREFIX}${JSON.stringify(payload)}`;
}

function parseSewingOtkItemToProductRow(it, activeSizes, idx) {
  const raw = String(it?.item_name || it?.material_name || '').trim();
  const baseSizes = emptySizes(activeSizes);
  let parsed = null;
  if (raw.startsWith(SEW_OTK_PREFIX)) {
    try {
      parsed = JSON.parse(raw.slice(SEW_OTK_PREFIX.length));
    } catch {
      parsed = null;
    }
  }
  if (parsed && typeof parsed === 'object') {
    const mergedSizes = { ...baseSizes, ...(parsed.sizes && typeof parsed.sizes === 'object' ? parsed.sizes : {}) };
    const total_qty = Object.values(mergedSizes).reduce((a, b) => a + toNum(b), 0);
    const operation_cost = toNum(parsed.operation_cost ?? it.price);
    return {
      id: `pr-db-${it.id}-${idx}`,
      photo: parsed.photo || '',
      model_name: parsed.model_name || '',
      color: String(parsed.color || ''),
      colorOther: String(parsed.colorOther || ''),
      sizes: mergedSizes,
      total_qty,
      operation: parsed.operation || '',
      operation_cost,
      total_cost: total_qty * operation_cost,
    };
  }
  const qty = toNum(it.qty);
  const price = toNum(it.price);
  const modelGuess = raw.split(/\s·\s/)[0] || raw;
  return {
    id: `pr-db-${it.id}-${idx}`,
    photo: '',
    model_name: modelGuess,
    color: '',
    colorOther: '',
    sizes: { ...baseSizes },
    total_qty: qty,
    operation: '',
    operation_cost: price,
    total_cost: qty * price,
  };
}

function parseMovementItemToSimpleRow(it, idx, stockList, orderColorsList) {
  const parts = String(it.item_name || '').split(/\s·\s/).map((s) => s.trim());
  const materialName = parts[0] || '';
  const colorFromName = parts[1] && parts[1] !== '—' ? parts[1] : '';
  const mid = it.item_id != null && !Number.isNaN(Number(it.item_id)) ? Number(it.item_id) : null;
  let stockQty = 0;
  let unit = 'м';
  let price = toNum(it.price);
  let matName = materialName;
  if (mid && Array.isArray(stockList)) {
    const s = stockList.find((x) => Number(x.id) === mid);
    if (s) {
      stockQty = toNum(s.quantity ?? s.qty);
      unit = String(s.unit || 'м');
      matName = String(s.material_name || s.name || materialName);
      price = toNum(s.price_per_unit ?? s.price ?? it.price);
    }
  }
  let color = '';
  let colorOther = '';
  if (colorFromName && orderColorsList.includes(colorFromName)) {
    color = colorFromName;
  } else if (colorFromName) {
    color = '__other__';
    colorOther = colorFromName;
  }
  const qtyVal = toNum(it.qty);
  return {
    id: `sr-db-${it.id}-${idx}`,
    color,
    colorOther,
    material_id: mid,
    material_name: matName,
    unit,
    stock_qty: stockQty,
    qty: qtyVal > 0 ? qtyVal : 0,
    rolls: 0,
    price,
    overStock: mid && stockQty > 0 ? qtyVal > stockQty : false,
  };
}

export default function MovementForm(props) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const urlFrom = props.fromStage;
  const urlTo = props.toStage;
  const titleProp = props.title;

  const [fromType, setFromType] = useState(
    () => urlFrom || searchParams.get('from') || 'warehouse'
  );
  const [toType, setToType] = useState(() => urlTo || searchParams.get('to') || 'cutting');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  const docId = routeId && routeId !== 'new' ? routeId : null;

  const [loading, setLoading] = useState(!!docId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [orderId, setOrderId] = useState('');
  const [note, setNote] = useState('');
  const [orders, setOrders] = useState([]);
  const [docStatus, setDocStatus] = useState(null);
  const [docNumber, setDocNumber] = useState('');

  const [activeSizes, setActiveSizes] = useState([]);
  const [orderColors, setOrderColors] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [rowsA, setRowsA] = useState([createEmptyRowA()]);
  const [batches, setBatches] = useState([]);
  const [productRows, setProductRows] = useState([]);
  /** Операции для строк таблицы Б (раскрой) или В (пошив/ОТК) */
  const [movementOps, setMovementOps] = useState([]);
  const [orderQuantity, setOrderQuantity] = useState(0);
  const [orderFabrics, setOrderFabrics] = useState([]);
  /** Остатки тканей для маршрута Б: все склады и (опционально) выбранный склад «откуда» */
  const [routeBStockAll, setRouteBStockAll] = useState([]);
  const [routeBStockSpecific, setRouteBStockSpecific] = useState([]);

  /** Смена заказа/маршрута Б → пересоздать партии; смена только склада «откуда» → только остатки */
  const prevBatchesInitRef = useRef({ orderId: '', fromType: '', toType: '' });

  const ROUTE = movementRoute(fromType, toType);
  const routeIsA = isRouteA(fromType, toType);
  const routeIsB = isRouteB(fromType, toType);
  const routeIsC = isRouteC(fromType, toType);

  const fromLabel = useMemo(() => {
    if (fromType === 'warehouse') {
      const w = warehouses.find((x) => String(x.id) === String(fromWarehouseId));
      return w?.name || 'Склад';
    }
    return STAGES.find((s) => s.value === fromType)?.label || fromType;
  }, [fromType, fromWarehouseId, warehouses]);

  const toLabel = useMemo(() => {
    if (toType === 'warehouse') {
      const w = warehouses.find((x) => String(x.id) === String(toWarehouseId));
      return w?.name || 'Склад';
    }
    return STAGES.find((s) => s.value === toType)?.label || toType;
  }, [toType, toWarehouseId, warehouses]);

  const title = titleProp || `Перемещение: ${fromLabel} → ${toLabel}`;

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const data = await api.warehouse.refs();
        setWarehouses(Array.isArray(data) ? data : []);
      } catch {
        setWarehouses([]);
      }
    };
    loadWarehouses();
  }, []);

  useEffect(() => {
    api.orders
      .list()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.orders || data?.rows || [];
        setOrders(list);
      })
      .catch(() => setOrders([]));
  }, []);

  const updateA = useCallback((rowId, patch) => {
    setRowsA((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r, ...patch };
        const qtyNum = toNum(next.qty);
        const sq = toNum(next.stock_qty);
        next.overStock = qtyNum > sq && sq > 0;
        return next;
      })
    );
  }, []);

  const removeA = useCallback((rowId) => {
    setRowsA((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.id !== rowId)));
  }, []);

  const recalcBatch = useCallback((id, changes) => {
    setBatches((prev) => {
      const updated = prev.map((b) => (b.id === id ? { ...b, ...changes } : b));
      return applyRunningRouteBMetrics(updated);
    });
  }, []);

  const getFabricStock = useCallback(
    (fabricName) =>
      aggregateFabricStockFromSources(fabricName, routeBStockSpecific, routeBStockAll),
    [routeBStockSpecific, routeBStockAll]
  );

  const loadRouteBFabricStock = useCallback(async () => {
    if (!routeIsB) return;
    const { allArr, specArr } = await fetchRouteBStockArrays(fromWarehouseId);
    setRouteBStockAll(allArr);
    setRouteBStockSpecific(specArr);
  }, [routeIsB, fromWarehouseId]);

  useEffect(() => {
    if (!routeIsB) {
      setRouteBStockAll([]);
      setRouteBStockSpecific([]);
      return;
    }
    void loadRouteBFabricStock();
  }, [routeIsB, fromWarehouseId, loadRouteBFabricStock]);

  const removeBatch = useCallback((id) => {
    setBatches((prev) => {
      const next = prev.length <= 1 ? prev : prev.filter((x) => x.id !== id);
      return applyRunningRouteBMetrics(next);
    });
  }, []);

  const updateProductRow = useCallback((id, changes) => {
    setProductRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
  }, []);

  const removeProductRow = useCallback((id) => {
    setProductRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const loadOrderAndStock = useCallback(async (oid, opts = {}) => {
    const { reinitBatches = true } = opts;
    const wid =
      fromWarehouseId && String(fromWarehouseId).trim() && !Number.isNaN(Number(fromWarehouseId))
        ? Number(fromWarehouseId)
        : null;
    if (!oid) {
      setActiveSizes([]);
      setOrderColors([]);
      setOrderFabrics([]);
      setRouteBStockAll([]);
      setRouteBStockSpecific([]);
      setStockItems([]);
      setRowsA([createEmptyRowA()]);
      setBatches([]);
      setProductRows([]);
      setMovementOps([]);
      setOrderQuantity(0);
      return;
    }

    if (routeIsB && reinitBatches === false) {
      const { allArr, specArr } = await fetchRouteBStockArrays(fromWarehouseId);
      setRouteBStockAll(allArr);
      setRouteBStockSpecific(specArr);
      setBatches((prev) => {
        const mapped = prev.map((b) => {
          const sq = b.fabric_name
            ? aggregateFabricStockFromSources(b.fabric_name, specArr, allArr)
            : 0;
          return { ...b, stock_qty: sq };
        });
        return applyRunningRouteBMetrics(mapped);
      });
      try {
        const items = await fetchStockItemsForWarehouseCutting(oid, wid);
        setStockItems(items);
      } catch {
        setStockItems([]);
      }
      return;
    }

    if (routeIsC) {
      try {
        const order = await api.orders.get(oid);
        const sizes = extractActiveSizes(order);
        const sz = sizes.length ? sizes : ERDEN_SIZES;
        setActiveSizes(sz);
        setOrderColors(extractOrderColors(order));
        setOrderQuantity(toNum(order.total_quantity ?? order.quantity ?? order.total_qty));
        const photo = order.photo || order.model_photo || order.image_url || order.image || '';
        const modelName =
          order.product_name || order.model_name || order.name || order.title || '';
        setMovementOps(loadMovementOps(order, fromType, toType));
        setOrderFabrics([]);
        setProductRows([
          {
            id: Date.now(),
            photo,
            model_name: modelName,
            color: '',
            colorOther: '',
            sizes: Object.fromEntries(sz.map((s) => [s, 0])),
            total_qty: 0,
            operation: '',
            operation_cost: 0,
            total_cost: 0,
          },
        ]);
        setRowsA([createEmptyRowA()]);
        setBatches([]);
        setStockItems([]);
      } catch {
        setActiveSizes(ERDEN_SIZES);
        setOrderColors([]);
        setOrderQuantity(0);
        setMovementOps([]);
        setOrderFabrics([]);
        setProductRows([]);
        setRowsA([createEmptyRowA()]);
        setBatches([]);
        setStockItems([]);
      }
      return;
    }

    if (routeIsB) {
      try {
        const order = await api.orders.get(oid);
        console.log('[ORDER полный]:', order);
        console.log('[fabric_data]:', order.fabric_data);
        console.log('[fittings_data]:', order.fittings_data);
        console.log('[ORDER keys]:', Object.keys(order));
        const sizes = extractActiveSizes(order);
        const sz = sizes.length ? sizes : ERDEN_SIZES;
        setActiveSizes(sz);
        const parsedColors = parseOrderColorsRouteB(order);
        const colorListForSelect = parsedColors.length > 0 ? parsedColors : [];
        setOrderColors(colorListForSelect);
        const fabrics = getFabrics(order);
        setOrderFabrics(fabrics);
        console.log('[fabrics найдено]:', fabrics);
        setOrderQuantity(toNum(order.total_quantity ?? order.quantity ?? order.total_qty));
        setMovementOps(loadMovementOps(order, fromType, toType));

        const { allArr, specArr } = await fetchRouteBStockArrays(fromWarehouseId);
        setRouteBStockAll(allArr);
        setRouteBStockSpecific(specArr);

        const items = await fetchStockItemsForWarehouseCutting(oid, wid);
        setStockItems(items);
        setBatches(buildAutoBatchesRouteB(order, sz, specArr, allArr));
        setProductRows([]);
        setRowsA([createEmptyRowA()]);
      } catch {
        setActiveSizes(ERDEN_SIZES);
        setOrderColors([]);
        setOrderFabrics([]);
        setRouteBStockAll([]);
        setRouteBStockSpecific([]);
        setOrderQuantity(0);
        setMovementOps([]);
        setStockItems([]);
        setBatches(buildAutoBatchesRouteB({}, ERDEN_SIZES, [], []));
        setProductRows([]);
        setRowsA([createEmptyRowA()]);
      }
      return;
    }

    try {
      const order = await api.orders.get(oid);
      const items = await fetchStockItemsForWarehouseCutting(oid, wid);
      setStockItems(items);
      setOrderColors(extractOrderColors(order));
      setOrderQuantity(toNum(order.total_quantity ?? order.quantity ?? order.total_qty));
      setOrderFabrics([]);
      setActiveSizes([]);
      setProductRows([]);
      setBatches([]);
      setMovementOps([]);
      setRowsA([createEmptyRowA()]);
    } catch {
      setStockItems([]);
      setOrderColors([]);
      setOrderQuantity(0);
      setOrderFabrics([]);
      setProductRows([]);
      setBatches([]);
      setMovementOps([]);
      setRowsA([createEmptyRowA()]);
    }
  }, [fromType, toType, fromWarehouseId, routeIsB, routeIsC]);

  useEffect(() => {
    if (docId) return;
    if (!isRouteC(fromType, toType)) return;
    if (orderId) return;
    setProductRows([
      {
        id: Date.now(),
        photo: '',
        model_name: '',
        color: '',
        colorOther: '',
        sizes: Object.fromEntries(ERDEN_SIZES.map((s) => [s, 0])),
        total_qty: 0,
        operation: '',
        operation_cost: 0,
        total_cost: 0,
      },
    ]);
    setMovementOps([]);
  }, [fromType, toType, docId, orderId]);

  const loadAllStock = useCallback(async () => {
    if (docId) return;
    const oid =
      orderId && String(orderId).trim() && !Number.isNaN(Number(orderId))
        ? Number(orderId)
        : null;
    const wid =
      fromWarehouseId && String(fromWarehouseId).trim() && !Number.isNaN(Number(fromWarehouseId))
        ? Number(fromWarehouseId)
        : null;
    const items = await fetchStockItemsForWarehouseCutting(oid, wid);
    setStockItems(items);
  }, [docId, orderId, fromWarehouseId]);

  useEffect(() => {
    if (fromType === 'warehouse' && isRouteA(fromType, toType) && !docId) {
      loadAllStock();
    }
  }, [fromType, toType, docId, loadAllStock]);

  useEffect(() => {
    if (!docId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const doc = await api.movements.get(docId);
        if (cancelled || !doc) return;
        setDocNumber(doc.doc_number || '');
        setDocStatus(doc.status || null);
        setDocDate(String(doc.doc_date || '').slice(0, 10));
        const sm = doc.stage_meta || {};
        const resolvedFrom =
          sm.from_stage && STAGES.some((s) => s.value === String(sm.from_stage))
            ? String(sm.from_stage)
            : fromType;
        const resolvedTo =
          sm.to_stage && STAGES.some((s) => s.value === String(sm.to_stage))
            ? String(sm.to_stage)
            : toType;
        setFromType(resolvedFrom);
        setToType(resolvedTo);
        const fw = doc.from_warehouse_id != null ? String(doc.from_warehouse_id) : '';
        const tw = doc.to_warehouse_id != null ? String(doc.to_warehouse_id) : '';
        setFromWarehouseId(fw);
        setToWarehouseId(tw);
        if (sm.order_id) setOrderId(String(sm.order_id));
        setNote(doc.user_note || '');
        const items = doc.Items || [];
        const docRouteA = isRouteA(resolvedFrom, resolvedTo);
        const docRouteB = isRouteB(resolvedFrom, resolvedTo);
        const docRouteC = isRouteC(resolvedFrom, resolvedTo);

        let orderJson = null;
        if (sm.order_id) {
          try {
            orderJson = await api.orders.get(sm.order_id);
          } catch {
            orderJson = null;
          }
        }
        const sizes = orderJson ? extractActiveSizes(orderJson) : [];
        const effSizes = sizes.length ? sizes : ERDEN_SIZES;
        const colorsList = orderJson ? extractOrderColors(orderJson) : [];
        const fabricsList = orderJson ? getFabrics(orderJson) : [];

        setActiveSizes(docRouteA ? [] : effSizes);
        setOrderColors(colorsList);
        setOrderFabrics(docRouteB ? fabricsList : []);
        setOrderQuantity(orderJson ? toNum(orderJson.total_quantity ?? orderJson.quantity) : 0);

        let stockListForMerge = [];
        if (docRouteA) {
          setProductRows([]);
          setBatches([]);
          setMovementOps([]);
          stockListForMerge = await fetchStockItemsForWarehouseCutting(
            sm.order_id ? Number(sm.order_id) : null,
            fw ? Number(fw) : null
          );
          setStockItems(stockListForMerge);
          if (items.length) {
            setRowsA(
              items.map((it, i) => parseMovementItemToSimpleRow(it, i, stockListForMerge, colorsList))
            );
          } else {
            setRowsA([createEmptyRowA()]);
          }
        } else if (docRouteB) {
          setRowsA([createEmptyRowA()]);
          setProductRows([]);
          setMovementOps(loadMovementOps(orderJson, resolvedFrom, resolvedTo));
          stockListForMerge = await fetchStockItemsForWarehouseCutting(
            sm.order_id ? Number(sm.order_id) : null,
            fw ? Number(fw) : null
          );
          setStockItems(stockListForMerge);
          setActiveSizes(effSizes);
          if (items.length) {
            setBatches(
              applyRunningRouteBMetrics(
                items.map((it, i) => parseCutBatchItemToBatch(it, effSizes, i))
              )
            );
          } else {
            setBatches([createEmptyBatchRow(effSizes)]);
          }
        } else if (docRouteC) {
          setStockItems([]);
          setRowsA([createEmptyRowA()]);
          setBatches([]);
          setActiveSizes(effSizes);
          setMovementOps(loadMovementOps(orderJson, resolvedFrom, resolvedTo));
          if (items.length) {
            setProductRows(items.map((it, i) => parseSewingOtkItemToProductRow(it, effSizes, i)));
          } else if (orderJson) {
            const photo =
              orderJson.photo ||
              orderJson.model_photo ||
              orderJson.image_url ||
              orderJson.image ||
              '';
            const modelName =
              orderJson.product_name ||
              orderJson.model_name ||
              orderJson.name ||
              orderJson.title ||
              '';
            setProductRows([
              {
                id: Date.now(),
                photo,
                model_name: modelName,
                color: '',
                colorOther: '',
                sizes: Object.fromEntries(effSizes.map((s) => [s, 0])),
                total_qty: 0,
                operation: '',
                operation_cost: 0,
                total_cost: 0,
              },
            ]);
          } else {
            setProductRows([]);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Ошибка загрузки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, fromType, toType]);

  useEffect(() => {
    if (docId) return;
    const oid = orderId || '';

    if (routeIsB && oid) {
      const p = prevBatchesInitRef.current;
      const reinit =
        String(oid) !== String(p.orderId) ||
        fromType !== p.fromType ||
        toType !== p.toType;
      prevBatchesInitRef.current = {
        orderId: String(oid),
        fromType,
        toType,
      };
      void loadOrderAndStock(oid, { reinitBatches: reinit });
      return;
    }

    if (!routeIsB) {
      prevBatchesInitRef.current = { orderId: '', fromType, toType };
    } else if (!oid) {
      prevBatchesInitRef.current = { orderId: '', fromType, toType };
    }

    void loadOrderAndStock(oid, { reinitBatches: true });
  }, [orderId, docId, fromType, toType, fromWarehouseId, loadOrderAndStock, routeIsB]);

  const totA = useMemo(() => {
    if (!routeIsA) return null;
    const qty = rowsA.reduce((a, r) => a + toNum(r.qty), 0);
    const rolls = rowsA.reduce((a, r) => a + toNum(r.rolls), 0);
    const sum = rowsA.reduce((a, r) => a + toNum(r.qty) * toNum(r.price), 0);
    const hasOverStock = rowsA.some((r) => r.overStock);
    return { qty, rolls, sum, hasOverStock };
  }, [routeIsA, rowsA]);

  const totC = useMemo(() => {
    if (!routeIsC) return null;
    return productRows.reduce(
      (acc, r) => ({
        qty: acc.qty + toNum(r.total_qty),
        cost: acc.cost + toNum(r.total_qty) * toNum(r.operation_cost),
      }),
      { qty: 0, cost: 0 }
    );
  }, [routeIsC, productRows]);

  const totB = useMemo(() => {
    if (!routeIsB) return null;
    const totalBatchQty = batches.reduce((a, b) => a + toNum(b.total_qty), 0);
    const totalBatchZP = batches.reduce(
      (a, b) => a + toNum(b.total_qty) * toNum(b.operation_cost),
      0
    );
    const totalPlan = batches.reduce((a, b) => a + toNum(b.plan_meters), 0);
    const totalFact = batches.reduce((a, b) => a + toNum(b.fact_meters), 0);
    const totalDefect = batches.reduce((a, b) => a + toNum(b.defect_meters), 0);
    const totalRemainder = batches.reduce((a, b) => a + toNum(b.remainder), 0);
    return {
      totalBatchQty,
      totalBatchZP,
      totalPlan,
      totalFact,
      totalDefect,
      totalRemainder,
    };
  }, [routeIsB, batches]);

  const tableMinWidth = useMemo(() => {
    if (routeIsA) return 960;
    const sz = activeSizes.length ? activeSizes : ERDEN_SIZES;
    if (routeIsB) {
      return Math.max(1100, 520 + sz.length * 52 + 380);
    }
    return Math.max(800, 44 + 200 + 110 + sz.length * 52 + 280 + 44);
  }, [routeIsA, routeIsB, activeSizes]);

  const buildPayload = () => {
    const oid = parseInt(String(orderId).trim(), 10);
    const items = [];
    const fw =
      fromWarehouseId && String(fromWarehouseId).trim() && !Number.isNaN(Number(fromWarehouseId))
        ? Number(fromWarehouseId)
        : null;
    const tw =
      toWarehouseId && String(toWarehouseId).trim() && !Number.isNaN(Number(toWarehouseId))
        ? Number(toWarehouseId)
        : null;
    const whIds = {
      from_warehouse_id: fw,
      to_warehouse_id: tw,
    };

    if (routeIsA) {
      for (const r of rowsA) {
        if (!r.material_id || toNum(r.qty) <= 0) continue;
        const mn = String(r.material_name || '').trim();
        const cl = displaySimpleRowColor(r);
        const material_name = cl ? `${mn} · ${cl}` : mn;
        items.push({
          item_id: Number(r.material_id),
          material_name,
          material_type: 'fabric',
          unit: String(r.unit || 'м'),
          qty: toNum(r.qty),
          price: toNum(r.price),
          defect_qty: 0,
        });
      }
      return {
        order_id: oid,
        from_stage: fromType,
        to_stage: toType,
        date: docDate,
        note: note.trim() || '',
        items,
        status: 'draft',
        ...whIds,
      };
    }

    if (routeIsB) {
      for (const b of batches) {
        const total_qty = Object.values(b.sizes || {}).reduce((a, x) => a + toNum(x), 0);
        const pm = toNum(b.plan_meters);
        const fm = toNum(b.fact_meters);
        if (total_qty <= 0 && pm <= 0 && fm <= 0) continue;
        const qtyLine = total_qty > 0 ? total_qty : Math.max(pm, fm);
        items.push({
          item_id: null,
          material_name: buildCutBatchMaterialName(b),
          material_type: 'fabric',
          unit: total_qty > 0 ? 'шт' : 'м',
          qty: qtyLine,
          price: toNum(b.operation_cost),
          defect_qty: toNum(b.defect_meters),
        });
      }
      return {
        order_id: oid,
        from_stage: fromType,
        to_stage: toType,
        date: docDate,
        note: note.trim() || '',
        items,
        status: 'draft',
        ...whIds,
      };
    }

    if (routeIsC) {
      for (const row of productRows) {
        const total_qty = Object.values(row.sizes || {}).reduce((a, x) => a + toNum(x), 0);
        if (total_qty <= 0) continue;
        items.push({
          item_id: null,
          material_name: buildSewingOtkMaterialName(row),
          material_type: 'fabric',
          unit: 'шт',
          qty: total_qty,
          price: toNum(row.operation_cost),
          defect_qty: 0,
        });
      }
      return {
        order_id: oid,
        from_stage: fromType,
        to_stage: toType,
        date: docDate,
        note: note.trim() || '',
        items,
        status: 'draft',
        ...whIds,
      };
    }

    return {
      order_id: oid,
      from_stage: fromType,
      to_stage: toType,
      date: docDate,
      note: note.trim() || '',
      items,
      status: 'draft',
      ...whIds,
    };
  };

  const validateMovementRoute = () => {
    if (fromType === 'warehouse' && toType === 'warehouse') {
      if (!fromWarehouseId || !toWarehouseId) {
        return 'Укажите склад отправителя и склад получателя';
      }
      if (String(fromWarehouseId) === String(toWarehouseId)) {
        return 'Склады отправителя и получателя должны различаться';
      }
    } else if (
      fromWarehouseId &&
      toWarehouseId &&
      String(fromWarehouseId) === String(toWarehouseId)
    ) {
      return 'Склады отправителя и получателя должны различаться';
    }
    return '';
  };

  const handleSaveDraft = async () => {
    if (docId) return;
    const payload = buildPayload();
    if (!payload.order_id || Number.isNaN(payload.order_id)) {
      setError('Выберите заказ');
      return;
    }
    const routeErr = validateMovementRoute();
    if (routeErr) {
      setError(routeErr);
      return;
    }
    if (!payload.items.length) {
      setError(
        routeIsA
          ? 'Выберите материал со склада и укажите количество хотя бы в одной строке'
          : routeIsB
            ? 'Заполните партию: количество по размерам или метраж план/факт'
            : routeIsC
              ? 'Укажите количество по размерам хотя бы в одной строке'
              : 'Укажите позиции для сохранения'
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.movements.create(payload);
      navigate(`/movements/${created.id}`, { replace: true });
    } catch (e) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (docStatus === 'posted') return;
    if (docId) {
      setSaving(true);
      setError('');
      try {
        await api.movements.approve(Number(docId));
        navigate(-1);
      } catch (e) {
        setError(e?.message || 'Ошибка утверждения');
      } finally {
        setSaving(false);
      }
      return;
    }
    const payload = buildPayload();
    if (!payload.order_id || Number.isNaN(payload.order_id)) {
      setError('Выберите заказ');
      return;
    }
    const routeErrApprove = validateMovementRoute();
    if (routeErrApprove) {
      setError(routeErrApprove);
      return;
    }
    if (!payload.items.length) {
      setError(
        routeIsA
          ? 'Выберите материал со склада и укажите количество хотя бы в одной строке'
          : routeIsB
            ? 'Заполните партию: количество по размерам или метраж план/факт'
            : routeIsC
              ? 'Укажите количество по размерам хотя бы в одной строке'
              : 'Укажите позиции для сохранения'
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await api.movements.create(payload);
      await api.movements.approve(created.id);
      navigate(-1);
    } catch (e) {
      setError(e?.message || 'Ошибка утверждения');
    } finally {
      setSaving(false);
    }
  };

  const readOnly = docStatus === 'posted' || !!docId;

  const sizeCols = activeSizes.length ? activeSizes : ERDEN_SIZES;

  if (loading) {
    return (
      <div className="rounded border border-white/10 bg-[#0d1117] p-6 text-[#ECECEC]">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>
        {`
          .movement-table input[type=number]::-webkit-outer-spin-button,
          .movement-table input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .movement-table input[type=number] {
            -moz-appearance: textfield;
            text-align: center;
          }
          .movement-table input:focus,
          .movement-table select:focus {
            border-color: #a3e635;
            box-shadow: 0 0 0 2px rgba(163,230,53,0.2);
          }
          .movement-table tbody tr:hover td {
            background: rgba(163, 230, 53, 0.05) !important;
          }
        `}
      </style>
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4">
        <h1 className="text-xl font-bold text-[#ECECEC]">{title}</h1>
        {docNumber ? (
          <div className="mt-1 text-sm text-slate-400">
            Документ {docNumber}{' '}
            {docStatus === 'posted' ? (
              <span className="text-green-400">· проведён</span>
            ) : (
              <span className="text-amber-300">· черновик</span>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 rounded border border-white/10 p-3 md:grid-cols-2">
        <label className="text-sm text-slate-400">
          Дата
          <input
            type="date"
            className="mt-1 w-full rounded bg-black/30 px-3 py-2 text-[#ECECEC]"
            value={docDate}
            disabled={readOnly}
            onChange={(e) => setDocDate(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-400">
          Заказ
          <select
            className="mt-1 w-full rounded bg-black/30 px-3 py-2 text-[#ECECEC]"
            value={orderId}
            disabled={readOnly}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">— Выберите заказ —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {(o.tz_code || o.title || o.id) + (o.model_name ? ` · ${o.model_name}` : '')}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label
            style={{
              fontSize: 12,
              color: '#94a3b8',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Откуда
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {STAGE_TYPE_VALUES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  setFromType(t);
                  setToType((prev) => {
                    if (t === 'warehouse' && prev === 'warehouse') return prev;
                    if (prev === t) return STAGES.find((s) => s.value !== t)?.value ?? prev;
                    return prev;
                  });
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: 'none',
                  cursor: readOnly ? 'default' : 'pointer',
                  opacity: readOnly ? 0.6 : 1,
                  background: fromType === t ? '#a3e635' : '#1e3a5f',
                  color: fromType === t ? '#000' : '#94a3b8',
                  fontWeight: fromType === t ? 600 : 400,
                }}
              >
                {stageToggleLabel(t)}
              </button>
            ))}
          </div>
          <select
            value={fromWarehouseId || ''}
            onChange={(e) => setFromWarehouseId(e.target.value || '')}
            disabled={readOnly}
            style={{
              background: '#1a1a2e',
              color: '#e2e8f0',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              width: '100%',
              cursor: readOnly ? 'default' : 'pointer',
              opacity: readOnly ? 0.65 : 1,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">— Склад (опционально) —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.address ? ` · ${w.address}` : ''}
              </option>
            ))}
          </select>
          {fromWarehouseId ? (
            <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
              {warehouses.find((w) => String(w.id) === String(fromWarehouseId))?.name || ''}
            </div>
          ) : null}
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              color: '#94a3b8',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Куда
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {STAGE_TYPE_VALUES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  if (fromType === 'warehouse' && t === 'warehouse') {
                    setToType('warehouse');
                    return;
                  }
                  if (t === fromType) {
                    setToType(STAGES.find((s) => s.value !== fromType)?.value ?? t);
                    return;
                  }
                  setToType(t);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: 'none',
                  cursor: readOnly ? 'default' : 'pointer',
                  opacity: readOnly ? 0.6 : 1,
                  background: toType === t ? '#a3e635' : '#1e3a5f',
                  color: toType === t ? '#000' : '#94a3b8',
                  fontWeight: toType === t ? 600 : 400,
                }}
              >
                {stageToggleLabel(t)}
              </button>
            ))}
          </div>
          <select
            value={toWarehouseId || ''}
            onChange={(e) => setToWarehouseId(e.target.value || '')}
            disabled={readOnly}
            style={{
              background: '#1a1a2e',
              color: '#e2e8f0',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              width: '100%',
              cursor: readOnly ? 'default' : 'pointer',
              opacity: readOnly ? 0.65 : 1,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">— Склад (опционально) —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.address ? ` · ${w.address}` : ''}
              </option>
            ))}
          </select>
        </div>
        <label className="text-sm text-slate-400 md:col-span-2">
          Примечание
          <textarea
            className="mt-1 w-full rounded bg-black/30 px-3 py-2 text-[#ECECEC]"
            rows={2}
            value={note}
            disabled={readOnly}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {routeIsA && (
          <span
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            📦 Таблица А — материалы
          </span>
        )}
        {routeIsB && (
          <span
            style={{
              background: '#422006',
              color: '#fdba74',
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            ✂️ Таблица Б — раскрой (партии)
          </span>
        )}
        {routeIsC && (
          <span
            style={{
              background: '#1a3a1a',
              color: '#86efac',
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 12,
              fontWeight: 500,
            }}
          >
            👗 Таблица В — изделия ({ROUTE})
          </span>
        )}
        {orderId ? (
          <span style={{ color: '#64748b', fontSize: 12 }}>
            Заказ: всего {orderQuantity || '—'} шт ·{' '}
            {routeIsA
              ? `тканей: ${stockItems.length}`
              : `размеров: ${activeSizes.length}`}
          </span>
        ) : null}
      </div>

      {routeIsA ? (
        <>
          <div style={{ overflowX: 'auto' }} className="rounded border border-white/10">
            <table
              className="movement-table w-full"
              style={{ fontSize: 13, minWidth: tableMinWidth, borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th style={{ ...TH_BASE, width: 44, textAlign: 'center' }}>№</th>
                  <th style={{ ...TH_BASE, textAlign: 'left' }}>Цвет ткани</th>
                  <th style={{ ...TH_BASE, textAlign: 'left', minWidth: 220 }}>
                    Ткань (из склада)
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }}>Ед.изм</th>
                  <th style={{ ...TH_BASE, textAlign: 'center', minWidth: 100 }}>На складе</th>
                  <th style={{ ...TH_BASE, textAlign: 'center', minWidth: 110 }}>
                    Кол-во передать
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 88 }}>Рулонов</th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 44 }}>🗑</th>
                </tr>
              </thead>
              <tbody>
                {rowsA.map((row, idx) => {
                  const rowBg = (idx + 1) % 2 === 0 ? '#0f172a' : '#1a2744';
                  const ctrlDisabled = readOnly ? { opacity: 0.65, cursor: 'not-allowed' } : {};
                  const sq = toNum(row.stock_qty);
                  return (
                    <tr key={row.id}>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'left' }}>
                        <select
                          value={
                            !row.color
                              ? ''
                              : row.color === '__other__'
                                ? '__other__'
                                : orderColors.includes(row.color)
                                  ? row.color
                                  : '__other__'
                          }
                          disabled={readOnly}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__other__') {
                              updateA(row.id, { color: '__other__', colorOther: '' });
                            } else {
                              updateA(row.id, { color: v, colorOther: '' });
                            }
                          }}
                          style={{ ...CTRL, ...ctrlDisabled }}
                        >
                          <option value="">— Цвет —</option>
                          {orderColors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value="__other__">+ Другой</option>
                        </select>
                        {(row.color === '__other__' ||
                          (row.color &&
                            orderColors.length &&
                            !orderColors.includes(row.color))) && (
                          <input
                            placeholder="Введите цвет"
                            disabled={readOnly}
                            value={
                              row.color === '__other__'
                                ? row.colorOther
                                : orderColors.includes(row.color)
                                  ? ''
                                  : row.color || row.colorOther
                            }
                            onChange={(e) =>
                              updateA(row.id, {
                                color: '__other__',
                                colorOther: e.target.value,
                              })
                            }
                            style={{ ...CTRL, textAlign: 'left', marginTop: 8, ...ctrlDisabled }}
                          />
                        )}
                      </td>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'left' }}>
                        <select
                          value={row.material_id != null ? String(row.material_id) : ''}
                          disabled={readOnly}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              updateA(row.id, {
                                material_id: null,
                                material_name: '',
                                unit: 'м',
                                stock_qty: 0,
                                price: 0,
                              });
                              return;
                            }
                            const mat = stockItems.find((s) => String(s.id) === String(val));
                            if (mat) {
                              updateA(row.id, {
                                material_id: mat.id,
                                material_name: mat.name || mat.material_name || '',
                                unit: mat.unit || 'м',
                                stock_qty: parseFloat(mat.qty ?? mat.quantity ?? 0) || 0,
                                price: parseFloat(mat.price ?? mat.price_per_unit ?? 0) || 0,
                              });
                            }
                          }}
                          style={{ ...CTRL, ...ctrlDisabled }}
                        >
                          <option value="">— Выберите материал —</option>
                          {stockItems.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name || s.material_name}
                              {s.qty != null || s.quantity != null
                                ? ` (${s.qty ?? s.quantity} ${s.unit || 'м'})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          color: '#94a3b8',
                        }}
                      >
                        {row.unit || 'м'}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          fontWeight: 600,
                          color: sq > 0 ? '#4ade80' : '#f87171',
                        }}
                      >
                        {sq > 0 ? `${sq} ${row.unit || 'м'}` : '⚠️ нет'}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={row.qty === '' || row.qty == null ? '' : row.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const qty = raw === '' ? '' : parseFloat(raw) || 0;
                            updateA(row.id, { qty });
                          }}
                          style={{
                            ...CTRL,
                            border: row.overStock
                              ? '1px solid #ef4444'
                              : '1px solid #374151',
                            textAlign: 'center',
                            ...ctrlDisabled,
                          }}
                        />
                        {row.overStock ? (
                          <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>
                            ⚠️ больше остатка
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          disabled={readOnly}
                          value={row.rolls === '' || row.rolls == null ? '' : row.rolls}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const rolls = raw === '' ? '' : parseInt(raw, 10) || 0;
                            updateA(row.id, { rolls });
                          }}
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'center' }}>
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => removeA(row.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 18,
                              lineHeight: 1,
                            }}
                          >
                            🗑
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totA ? (
            <div style={TOTALS_STYLE}>
              <span>
                📦 Итого: <b>{totA.qty.toFixed(2)} м</b>
              </span>
              <span>
                🧻 Рулонов: <b>{totA.rolls}</b>
              </span>
              <span>
                💰 Сумма: <b>{totA.sum.toLocaleString('ru-RU')} сом</b>
              </span>
              {totA.hasOverStock ? (
                <span style={{ color: '#f87171' }}>
                  ⚠️ Некоторые позиции превышают остаток на складе!
                </span>
              ) : null}
            </div>
          ) : null}
          {!readOnly ? (
            <button type="button" onClick={() => setRowsA((prev) => [...prev, createEmptyRowA()])} style={ADD_BTN}>
              + Добавить строку
            </button>
          ) : null}
        </>
      ) : routeIsB ? (
        <>
          <div style={{ overflowX: 'auto' }} className="rounded border border-white/10">
            <style>{`
              .batch-table input[type=number]::-webkit-outer-spin-button,
              .batch-table input[type=number]::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }
              .batch-table input[type=number] { -moz-appearance: textfield; }
            `}</style>
            <table
              className="batch-table movement-table w-full"
              style={{ fontSize: 13, minWidth: tableMinWidth, borderCollapse: 'collapse' }}
            >
              <thead>
                <tr style={{ background: '#1e3a5f' }}>
                  <th style={{ ...TH_BASE, textAlign: 'left' }} rowSpan={2}>
                    Цвет ткани
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'left', minWidth: 120 }} rowSpan={2}>
                    Ткань
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', minWidth: 88 }} rowSpan={2}>
                    На складе
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    План (м)
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    Факт (м)
                  </th>
                  <th
                    style={{ ...TH_BASE, textAlign: 'center' }}
                    colSpan={(activeSizes.length ? activeSizes : ERDEN_SIZES).length}
                  >
                    Размеры (кол-во)
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    Итого
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'left', minWidth: 88 }} rowSpan={2}>
                    Маркировка
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    Остаток
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    Нехватка
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 72 }} rowSpan={2}>
                    Брак (м)
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'left', minWidth: 130 }} rowSpan={2}>
                    Операция раскроя
                  </th>
                  <th style={{ ...TH_BASE, textAlign: 'center', width: 96 }} rowSpan={2}>
                    Стоимость оп.
                  </th>
                  <th style={{ ...TH_BASE, width: 44, textAlign: 'center' }} rowSpan={2}>
                    🗑
                  </th>
                </tr>
                <tr style={{ background: '#1a2f4e' }}>
                  {(activeSizes.length ? activeSizes : ERDEN_SIZES).map((s) => (
                    <th key={s} style={{ ...TH_SIZE, minWidth: 52 }}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, idx) => {
                  const rowBg = idx % 2 === 0 ? '#0f172a' : '#111827';
                  const ctrlDisabled = readOnly ? { opacity: 0.65, cursor: 'not-allowed' } : {};
                  const szList = activeSizes.length ? activeSizes : ERDEN_SIZES;
                  return (
                    <tr key={batch.id}>
                      <td style={{ ...CELL, background: rowBg }}>
                        <select
                          value={
                            !batch.color
                              ? ''
                              : batch.color === '__other__'
                                ? '__other__'
                                : orderColors.includes(batch.color)
                                  ? batch.color
                                  : '__other__'
                          }
                          disabled={readOnly}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__other__') {
                              recalcBatch(batch.id, { color: '__other__', colorOther: '' });
                            } else {
                              recalcBatch(batch.id, { color: v, colorOther: '' });
                            }
                          }}
                          style={{ ...CTRL, ...ctrlDisabled }}
                        >
                          <option value="">— Цвет —</option>
                          {orderColors.map((c) => (
                            <option key={c || '__empty'} value={c}>
                              {c || '—'}
                            </option>
                          ))}
                          <option value="__other__">+ Другой</option>
                        </select>
                        {(batch.color === '__other__' ||
                          (batch.color &&
                            orderColors.length > 0 &&
                            !orderColors.includes(batch.color))) && (
                          <input
                            placeholder="Введите цвет"
                            disabled={readOnly}
                            value={
                              batch.color === '__other__'
                                ? batch.colorOther || ''
                                : orderColors.includes(batch.color)
                                  ? ''
                                  : batch.color || batch.colorOther || ''
                            }
                            onChange={(e) =>
                              recalcBatch(batch.id, {
                                color: '__other__',
                                colorOther: e.target.value,
                              })
                            }
                            style={{ ...CTRL, marginTop: 4, ...ctrlDisabled }}
                          />
                        )}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <select
                          value={batch.fabric_name || ''}
                          disabled={readOnly}
                          onChange={(e) => {
                            const val = e.target.value;
                            const fab = (orderFabrics || []).find(
                              (f) => getFabricName(f) === val
                            );
                            const norm =
                              parseFloat(
                                fab?.qty_per_unit ??
                                  fab?.quantity_per ??
                                  fab?.norm ??
                                  fab?.qtyPerUnit ??
                                  fab?.qty ??
                                  0
                              ) || 0;
                            const stockQty = getFabricStock(val);
                            recalcBatch(batch.id, {
                              fabric_name: val,
                              stock_qty: stockQty,
                              norm_per_unit: norm,
                              plan_meters: norm * (orderQuantity || 0),
                            });
                          }}
                          style={{ ...CTRL, ...ctrlDisabled }}
                        >
                          <option value="">— Ткань —</option>
                          {(orderFabrics || []).map((f, i) => {
                            const name = getFabricName(f);
                            if (!name) return null;
                            const qLabel = getFabricQtyPerUnit(f);
                            return (
                              <option key={i} value={name}>
                                {name}
                                {qLabel ? ` (${qLabel} м/ед)` : ''}
                              </option>
                            );
                          })}
                          {(!orderFabrics || orderFabrics.length === 0) && (
                            <option disabled value="__no_fabrics__">
                              Нет тканей в заказе
                            </option>
                          )}
                        </select>
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          fontWeight: 600,
                          color:
                            toNum(batch.effective_stock ?? batch.stock_qty) > 0
                              ? '#4ade80'
                              : '#f87171',
                        }}
                      >
                        {toNum(batch.effective_stock ?? batch.stock_qty) > 0 ? (
                          <div>
                            <div>
                              {Number(batch.effective_stock ?? batch.stock_qty).toFixed(1)} м
                            </div>
                            {!fromWarehouseId ? (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: '#64748b',
                                  fontWeight: 400,
                                }}
                              >
                                (все склады)
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          '⚠️ нет'
                        )}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={batch.plan_meters || ''}
                          placeholder="0"
                          onChange={(e) =>
                            recalcBatch(batch.id, { plan_meters: parseFloat(e.target.value) || 0 })
                          }
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={batch.fact_meters || ''}
                          placeholder="0"
                          onChange={(e) =>
                            recalcBatch(batch.id, { fact_meters: parseFloat(e.target.value) || 0 })
                          }
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      {szList.map((size) => (
                        <td key={size} style={{ ...CELL, background: rowBg, textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            disabled={readOnly}
                            value={batch.sizes[size] || ''}
                            placeholder="0"
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10) || 0;
                              const newSizes = { ...batch.sizes, [size]: v };
                              recalcBatch(batch.id, { sizes: newSizes });
                            }}
                            style={{
                              width: 48,
                              textAlign: 'center',
                              background: '#1a1a2e',
                              color: '#e2e8f0',
                              border: '1px solid #374151',
                              borderRadius: 4,
                              padding: '4px',
                              fontSize: 13,
                              ...ctrlDisabled,
                            }}
                          />
                        </td>
                      ))}
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          fontWeight: 600,
                          color: '#a3e635',
                        }}
                      >
                        {batch.total_qty ?? 0}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          disabled={readOnly}
                          value={batch.marking || ''}
                          placeholder="МАР-001"
                          onChange={(e) => recalcBatch(batch.id, { marking: e.target.value })}
                          style={{ ...CTRL, ...ctrlDisabled }}
                        />
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          fontWeight: 600,
                          color: toNum(batch.remainder) >= 0 ? '#4ade80' : '#f87171',
                        }}
                      >
                        {Number(batch.remainder ?? 0).toFixed(2)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          color: toNum(batch.shortage) > 0 ? '#f87171' : '#64748b',
                          fontWeight: toNum(batch.shortage) > 0 ? 600 : 400,
                        }}
                      >
                        {toNum(batch.shortage) > 0 ? toNum(batch.shortage).toFixed(2) : '—'}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          step="0.01"
                          disabled={readOnly}
                          value={batch.defect_meters || ''}
                          placeholder="0"
                          onChange={(e) =>
                            recalcBatch(batch.id, { defect_meters: parseFloat(e.target.value) || 0 })
                          }
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <select
                          value={batch.operation || ''}
                          disabled={readOnly}
                          onChange={(e) => {
                            const v = e.target.value;
                            const op = movementOps.find((o) => (o.name || o.id) === v || o.name === v);
                            recalcBatch(batch.id, {
                              operation: v,
                              operation_cost: op?.price ?? op?.cost ?? batch.operation_cost ?? 0,
                            });
                          }}
                          style={{ ...CTRL, minWidth: 120, ...ctrlDisabled }}
                        >
                          <option value="">— Операция —</option>
                          {movementOps.map((op, i) => (
                            <option key={i} value={op.name || op.id}>
                              {op.name}
                              {op.price ? ` (${op.price} сом)` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          disabled={readOnly}
                          value={batch.operation_cost || ''}
                          placeholder="0"
                          onChange={(e) =>
                            recalcBatch(batch.id, { operation_cost: parseFloat(e.target.value) || 0 })
                          }
                          style={{ ...CTRL, width: 80, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'center' }}>
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => removeBatch(batch.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 18,
                            }}
                          >
                            🗑
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totB ? (
            <div
              style={{
                marginTop: 12,
                padding: '12px 16px',
                background: '#1e3a5f',
                borderRadius: 8,
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                fontSize: 13,
              }}
            >
              <span>
                📐 План: <b>{totB.totalPlan.toFixed(2)} м</b>
              </span>
              <span>
                ✅ Факт: <b>{totB.totalFact.toFixed(2)} м</b>
              </span>
              <span>
                👕 Итого кол-во: <b>{totB.totalBatchQty} шт</b>
              </span>
              <span style={{ color: totB.totalRemainder >= 0 ? '#4ade80' : '#f87171' }}>
                📦 Остаток: <b>{totB.totalRemainder.toFixed(2)} м</b>
              </span>
              <span style={{ color: '#f87171' }}>
                ❌ Брак: <b>{totB.totalDefect.toFixed(2)} м</b>
              </span>

              <div
                style={{
                  width: '100%',
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid #2d4a6e',
                  display: 'flex',
                  gap: 20,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>💰 ЗП Раскройный отдел:</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>
                  {totB.totalBatchZP.toLocaleString('ru-RU')} сом
                </span>
                <span style={{ color: '#64748b', fontSize: 11 }}>
                  ({totB.totalBatchQty} шт × стоимость операций)
                </span>
              </div>
            </div>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() =>
                setBatches((prev) =>
                  applyRunningRouteBMetrics([
                    ...prev,
                    createEmptyBatchRow(activeSizes.length ? activeSizes : ERDEN_SIZES),
                  ])
                )
              }
              style={ADD_BTN}
            >
              + Добавить партию
            </button>
          ) : null}
        </>
      ) : routeIsC ? (
        <>
          <div style={{ overflowX: 'auto' }} className="rounded border border-white/10">
            <style>{`
              .prod-table input[type=number]::-webkit-outer-spin-button,
              .prod-table input[type=number]::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }
              .prod-table input[type=number] {
                -moz-appearance: textfield;
              }
              .prod-table tbody tr:hover td {
                background: rgba(163, 230, 53, 0.04);
              }
            `}</style>

            <table
              className="prod-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                minWidth: Math.max(800, tableMinWidth),
              }}
            >
              <thead>
                <tr style={{ background: '#1e3a5f' }}>
                  <th style={TH} rowSpan={2}>
                    №
                  </th>
                  <th style={TH} rowSpan={2}>
                    Модель
                  </th>
                  <th style={TH} rowSpan={2}>
                    Цвет
                  </th>
                  <th
                    style={{ ...TH, textAlign: 'center' }}
                    colSpan={(activeSizes.length ? activeSizes : ERDEN_SIZES).length}
                  >
                    Кол-во по размеру
                  </th>
                  <th style={TH} rowSpan={2}>
                    Итого
                  </th>
                  <th style={TH} rowSpan={2}>
                    {fromType === 'sewing' ? 'Операция пошива' : fromType === 'otk' ? 'Операция ОТК' : 'Операция'}
                  </th>
                  <th style={TH} rowSpan={2}>
                    Стоимость оп.
                  </th>
                  <th style={TH} rowSpan={2}>
                    🗑
                  </th>
                </tr>
                <tr style={{ background: '#1a2f4e' }}>
                  {(activeSizes.length ? activeSizes : ERDEN_SIZES).map((s) => (
                    <th
                      key={s}
                      style={{
                        ...TH,
                        minWidth: 52,
                        fontSize: 11,
                        textAlign: 'center',
                      }}
                    >
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      background: idx % 2 === 0 ? '#0f172a' : '#111827',
                    }}
                  >
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>

                    <td style={TD}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                        {row.model_name || '—'}
                      </div>
                    </td>

                    <td style={TD}>
                      <select
                        value={
                          !row.color
                            ? ''
                            : row.color === '__other__'
                              ? '__other__'
                              : orderColors.includes(row.color)
                                ? row.color
                                : '__other__'
                        }
                        disabled={readOnly}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__other__') {
                            updateProductRow(row.id, { color: '__other__', colorOther: '' });
                          } else {
                            updateProductRow(row.id, { color: v, colorOther: '' });
                          }
                        }}
                        style={{
                          ...CTRL,
                          minWidth: 90,
                        }}
                      >
                        <option value="">— Цвет —</option>
                        {orderColors.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__other__">+ Другой</option>
                      </select>
                      {(row.color === '__other__' ||
                        (row.color &&
                          orderColors.length > 0 &&
                          !orderColors.includes(row.color))) && (
                        <input
                          placeholder="Введите цвет"
                          disabled={readOnly}
                          value={
                            row.color === '__other__'
                              ? row.colorOther || ''
                              : orderColors.includes(row.color)
                                ? ''
                                : row.color || row.colorOther || ''
                          }
                          onChange={(e) =>
                            updateProductRow(row.id, { colorOther: e.target.value })
                          }
                          style={{ ...CTRL, marginTop: 4 }}
                        />
                      )}
                    </td>

                    {sizeCols.map((size) => (
                      <td key={size} style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          disabled={readOnly}
                          value={row.sizes[size] || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const newSizes = {
                              ...row.sizes,
                              [size]: parseInt(e.target.value, 10) || 0,
                            };
                            const total = Object.values(newSizes).reduce((a, b) => a + b, 0);
                            updateProductRow(row.id, {
                              sizes: newSizes,
                              total_qty: total,
                              total_cost: total * toNum(row.operation_cost),
                            });
                          }}
                          style={{
                            width: 50,
                            textAlign: 'center',
                            background: '#1a1a2e',
                            color: '#e2e8f0',
                            border: '1px solid #374151',
                            borderRadius: 4,
                            padding: '4px',
                            fontSize: 13,
                          }}
                        />
                      </td>
                    ))}

                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#a3e635',
                      }}
                    >
                      {row.total_qty}
                    </td>

                    <td style={TD}>
                      <select
                        value={row.operation || ''}
                        disabled={readOnly}
                        onChange={(e) => {
                          const v = e.target.value;
                          const op = movementOps.find((o) => o.name === v || String(o.id) === v);
                          const cost = op?.price ?? op?.cost ?? 0;
                          updateProductRow(row.id, {
                            operation: v,
                            operation_cost: cost,
                            total_cost: row.total_qty * cost,
                          });
                        }}
                        style={{ ...CTRL, minWidth: 130 }}
                      >
                        <option value="">— Операция —</option>
                        {movementOps.map((op, i) => (
                          <option key={i} value={op.name || op.id}>
                            {op.name}
                            {op.price ? ` (${op.price} сом)` : ''}
                          </option>
                        ))}
                        <option value="__other__">+ Вручную</option>
                      </select>
                      {row.operation === '__other__' ? (
                        <input
                          placeholder="Операция"
                          disabled={readOnly}
                          onChange={(e) => updateProductRow(row.id, { operation: e.target.value })}
                          style={{ ...CTRL, marginTop: 4 }}
                        />
                      ) : null}
                    </td>

                    <td style={TD}>
                      <input
                        type="number"
                        min="0"
                        disabled={readOnly}
                        value={row.operation_cost || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const cost = parseFloat(e.target.value) || 0;
                          updateProductRow(row.id, {
                            operation_cost: cost,
                            total_cost: row.total_qty * cost,
                          });
                        }}
                        style={{
                          ...CTRL,
                          width: 90,
                          textAlign: 'center',
                        }}
                      />
                    </td>

                    <td style={{ ...TD, textAlign: 'center' }}>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => removeProductRow(row.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 18,
                          }}
                        >
                          🗑
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totC ? (
            <div style={TOTALS_STYLE}>
              <span>
                👕 Итого: <b>{totC.qty} шт</b>
              </span>
              <span>
                💰 ЗП:{' '}
                <b style={{ color: '#fbbf24' }}>{totC.cost.toLocaleString('ru-RU')} сом</b>
              </span>
            </div>
          ) : null}

          {!readOnly ? (
            <button
              type="button"
              onClick={() =>
                setProductRows((prev) => [
                  ...prev,
                  {
                    id: Date.now(),
                    photo: '',
                    model_name: '',
                    color: '',
                    colorOther: '',
                    sizes: Object.fromEntries(sizeCols.map((s) => [s, 0])),
                    total_qty: 0,
                    operation: '',
                    operation_cost: 0,
                    total_cost: 0,
                  },
                ])
              }
              style={ADD_BTN}
            >
              + Добавить строку
            </button>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-slate-600 px-3 py-2 text-sm"
          onClick={() => navigate(-1)}
        >
          ← Назад
        </button>
        {docStatus !== 'posted' ? (
          <>
            {!docId ? (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-2 text-sm disabled:opacity-50"
                disabled={saving}
                onClick={handleSaveDraft}
              >
                💾 Сохранить (черновик)
              </button>
            ) : null}
            <button
              type="button"
              className="rounded bg-green-600 px-3 py-2 text-sm disabled:opacity-50"
              disabled={saving}
              onClick={handleApprove}
            >
              ✅ Утвердить
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
