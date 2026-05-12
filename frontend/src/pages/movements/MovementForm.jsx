/**
 * Документ перемещения материалов между этапами
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

/** Норма м ткани на единицу изделия из строки fabric_data */
function normPerUnitFromRow(r) {
  const q =
    r?.qty_per_unit ??
    r?.qty ??
    r?.consumption ??
    r?.norm ??
    r?.total_qty ??
    r?.quantity;
  return toNum(q);
}

function extractFabricsFromOrder(order) {
  const fd = order?.fabric_data;
  const out = [];
  if (!fd) return out;
  if (Array.isArray(fd)) {
    fd.forEach((r) => {
      const name = String(r?.name || r?.title || '').trim();
      if (!name) return;
      out.push({ name, normPerUnit: normPerUnitFromRow(r) });
    });
    return out;
  }
  if (fd.groups && Array.isArray(fd.groups)) {
    for (const g of fd.groups) {
      for (const r of g.rows || []) {
        const name = String(r?.name || '').trim();
        if (!name) continue;
        out.push({ name, normPerUnit: normPerUnitFromRow(r) });
      }
    }
  }
  return out;
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

function extractOrderColors(order) {
  const fromApi = Array.isArray(order?.colors) ? order.colors.filter(Boolean) : [];
  if (fromApi.length) return [...new Set(fromApi)].sort();
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

function newBatchId() {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyBatch(activeSizes) {
  return {
    id: newBatchId(),
    color: '',
    colorOther: '',
    fabric_name: '',
    stock_qty: 0,
    unit: 'м',
    price: 0,
    plan_meters: 0,
    fact_meters: 0,
    sizes: emptySizes(activeSizes),
    total_qty: 0,
    marking: '',
    remainder: 0,
    shortage: 0,
    defect_meters: 0,
  };
}

function parseItemToBatch(it, activeSizes, idx, orderColorsList) {
  const name = String(it?.item_name || '').trim();
  const parts = name.split(/\s·\s/).map((s) => s.trim());
  const fabric_name = parts[0] || '';
  let color = parts[1] === '—' ? '' : parts[1] || '';
  const marking = parts[2] || '';
  let colorOther = '';
  if (color && orderColorsList.length && !orderColorsList.includes(color)) {
    colorOther = color;
    color = '__other__';
  }
  const sizes = emptySizes(activeSizes);
  return {
    id: `db-${it.id}-${idx}`,
    color,
    colorOther,
    fabric_name,
    stock_qty: 0,
    unit: 'м',
    price: toNum(it.price),
    plan_meters: 0,
    fact_meters: toNum(it.qty),
    sizes,
    total_qty: 0,
    marking,
    remainder: 0,
    shortage: 0,
    defect_meters: 0,
  };
}

function deriveBatchNumbers(batch, fabrics) {
  const total_qty = Object.values(batch.sizes || {}).reduce((a, b) => a + toNum(b), 0);
  const norm = toNum(fabrics.find((x) => x.name === batch.fabric_name)?.normPerUnit);
  const fact = toNum(batch.fact_meters);
  const remainder = fact - total_qty * norm;
  const shortage = remainder < 0 ? Math.abs(remainder) : 0;
  return { ...batch, total_qty, remainder, shortage };
}

function findStockRow(stockList, fabricName) {
  if (!fabricName || !Array.isArray(stockList)) return null;
  const fn = fabricName.toLowerCase().trim();
  return (
    stockList.find((s) => {
      const mn = String(s.material_name || s.name || '').toLowerCase();
      return mn === fn || mn.includes(fn) || fn.includes(mn);
    }) || null
  );
}

/** Остаток по имени ткани из GET /api/warehouse/stock */
function mergeWarehouseStock(originStage, stockRows, batch) {
  if (originStage !== 'warehouse') {
    return {
      ...batch,
      stock_qty: toNum(batch.stock_qty),
      unit: batch.unit || 'м',
      price: toNum(batch.price),
    };
  }
  const row = findStockRow(stockRows, batch.fabric_name);
  if (!row) {
    return {
      ...batch,
      stock_qty: 0,
      unit: batch.unit || 'м',
      price: toNum(batch.price),
    };
  }
  return {
    ...batch,
    stock_qty: toNum(row.quantity ?? row.qty),
    price: toNum(row.price_per_unit ?? row.price ?? batch.price),
    unit: String(row.unit || 'м').trim() || 'м',
  };
}

function newSimpleRowId() {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptySimpleRow() {
  return {
    id: newSimpleRowId(),
    color: '',
    colorOther: '',
    material_id: null,
    material_name: '',
    unit: 'м',
    stock_qty: 0,
    qty: '',
    rolls: '',
    price: 0,
    overStock: false,
  };
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
    qty: qtyVal > 0 ? String(qtyVal) : '',
    rolls: '',
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
  const [batches, setBatches] = useState([]);
  const [docStatus, setDocStatus] = useState(null);
  const [docNumber, setDocNumber] = useState('');

  const [activeSizes, setActiveSizes] = useState([]);
  const [orderColors, setOrderColors] = useState([]);
  const [orderFabrics, setOrderFabrics] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [simpleRows, setSimpleRows] = useState([]);
  const [orderQuantity, setOrderQuantity] = useState(0);

  const isWarehouseToCutting =
    fromType === 'warehouse' && toType === 'cutting';

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

  const normForFabric = useCallback(
    (fabricName) => {
      const f = orderFabrics.find((x) => x.name === fabricName);
      return f ? toNum(f.normPerUnit) : 0;
    },
    [orderFabrics]
  );

  const recalcDerived = useCallback(
    (batch) => {
      const total_qty = Object.values(batch.sizes || {}).reduce((a, b) => a + toNum(b), 0);
      const norm = normForFabric(batch.fabric_name);
      const fact = toNum(batch.fact_meters);
      const remainder = fact - total_qty * norm;
      const shortage = remainder < 0 ? Math.abs(remainder) : 0;
      return { ...batch, total_qty, remainder, shortage };
    },
    [normForFabric]
  );

  const updateBatch = useCallback(
    (batchId, patch) => {
      setBatches((prev) =>
        prev.map((b) => {
          if (b.id !== batchId) return b;
          let next = { ...b, ...patch };
          if (patch.sizes) {
            next.total_qty = Object.values(patch.sizes).reduce((a, x) => a + toNum(x), 0);
          }
          return mergeWarehouseStock(fromType, stockRows, recalcDerived(next));
        })
      );
    },
    [recalcDerived, fromType, stockRows]
  );

  const recalcBatch = useCallback(
    (batchId, patch) => {
      setBatches((prev) =>
        prev.map((b) => {
          if (b.id !== batchId) return b;
          let next = { ...b, ...patch };
          if (patch.sizes) {
            next.total_qty = Object.values(patch.sizes).reduce((a, x) => a + toNum(x), 0);
          }
          return mergeWarehouseStock(fromType, stockRows, recalcDerived(next));
        })
      );
    },
    [recalcDerived, fromType, stockRows]
  );

  const removeBatch = useCallback((batchId) => {
    setBatches((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== batchId)));
  }, []);

  const updateSimpleRow = useCallback((rowId, patch) => {
    setSimpleRows((prev) =>
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

  const removeSimpleRow = useCallback((rowId) => {
    setSimpleRows((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.id !== rowId)));
  }, []);

  const loadOrderAndStock = useCallback(async (oid) => {
    const urlWarehouseCutting = fromType === 'warehouse' && toType === 'cutting';
    const wid =
      fromWarehouseId && String(fromWarehouseId).trim() && !Number.isNaN(Number(fromWarehouseId))
        ? Number(fromWarehouseId)
        : null;
    if (!oid) {
      setActiveSizes([]);
      setOrderColors([]);
      setOrderFabrics([]);
      setStockRows([]);
      setStockItems([]);
      setSimpleRows([]);
      setOrderQuantity(0);
      setBatches([]);
      return;
    }
    if (urlWarehouseCutting) {
      try {
        const order = await api.orders.get(oid);
        const items = await fetchStockItemsForWarehouseCutting(oid, wid);
        setStockItems(items);
        setStockRows(items);
        setOrderColors(extractOrderColors(order));
        setOrderFabrics(extractFabricsFromOrder(order));
        setOrderQuantity(toNum(order.total_quantity ?? order.quantity ?? order.total_qty));
        setActiveSizes([]);
        setBatches([]);
        setSimpleRows([createEmptySimpleRow()]);
      } catch {
        setStockItems([]);
        setStockRows([]);
        setOrderColors([]);
        setOrderFabrics([]);
        setOrderQuantity(0);
        setBatches([]);
        setSimpleRows([createEmptySimpleRow()]);
      }
      return;
    }
    try {
      const stockParams = { order_id: oid };
      if (wid) stockParams.warehouse_id = wid;
      const [order, stock] = await Promise.all([
        api.orders.get(oid),
        api.warehouse.stock(stockParams),
      ]);
      const list = Array.isArray(stock) ? stock : [];
      setStockRows(list);
      setStockItems([]);
      setSimpleRows([]);

      const sizes = extractActiveSizes(order);
      setActiveSizes(sizes.length ? sizes : ERDEN_SIZES);
      setOrderColors(extractOrderColors(order));
      setOrderFabrics(extractFabricsFromOrder(order));
      setOrderQuantity(toNum(order.total_quantity ?? order.quantity ?? order.total_qty));

      const sz = sizes.length ? sizes : ERDEN_SIZES;
      setBatches([
        mergeWarehouseStock(fromType, list, createEmptyBatch(sz)),
      ]);
    } catch {
      setActiveSizes(ERDEN_SIZES);
      setOrderColors([]);
      setOrderFabrics([]);
      setStockRows([]);
      setStockItems([]);
      setSimpleRows([]);
      setOrderQuantity(0);
      setBatches([
        mergeWarehouseStock(fromType, [], createEmptyBatch(ERDEN_SIZES)),
      ]);
    }
  }, [fromType, toType, fromWarehouseId]);

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
    if (fromType === 'warehouse' && toType === 'cutting') {
      setStockRows(items);
    }
  }, [docId, orderId, fromType, toType, fromWarehouseId]);

  useEffect(() => {
    if (fromType === 'warehouse' && !docId) {
      loadAllStock();
    }
  }, [fromType, docId, loadAllStock]);

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
        const defectsMap = sm.defects && typeof sm.defects === 'object' ? sm.defects : {};
        const docIsWC = resolvedFrom === 'warehouse' && resolvedTo === 'cutting';

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
        const fabricsList = orderJson ? extractFabricsFromOrder(orderJson) : [];

        setActiveSizes(effSizes);
        setOrderColors(colorsList);
        setOrderFabrics(fabricsList);
        setOrderQuantity(orderJson ? toNum(orderJson.total_quantity ?? orderJson.quantity) : 0);

        let stockListForMerge = [];
        if (docIsWC) {
          stockListForMerge = await fetchStockItemsForWarehouseCutting(
            sm.order_id ? Number(sm.order_id) : null,
            fw ? Number(fw) : null
          );
          setStockItems(stockListForMerge);
          setStockRows(stockListForMerge);
          setBatches([]);
          if (items.length) {
            setSimpleRows(
              items.map((it, i) => parseMovementItemToSimpleRow(it, i, stockListForMerge, colorsList))
            );
          } else {
            setSimpleRows([createEmptySimpleRow()]);
          }
        } else {
          setStockItems([]);
          setSimpleRows([]);
          if (sm.order_id) {
            try {
              const stParams = { order_id: sm.order_id };
              if (fw) stParams.warehouse_id = Number(fw);
              const st = await api.warehouse.stock(stParams);
              stockListForMerge = Array.isArray(st) ? st : [];
              setStockRows(stockListForMerge);
            } catch {
              stockListForMerge = [];
              setStockRows([]);
            }
          } else {
            setStockRows([]);
          }

          if (items.length) {
            setBatches(
              items.map((it, i) => {
                let b = parseItemToBatch(it, effSizes, i, colorsList);
                const key = String(it.item_name || '').trim();
                if (defectsMap[key] != null) b.defect_meters = toNum(defectsMap[key]);
                b = deriveBatchNumbers(b, fabricsList);
                return mergeWarehouseStock(resolvedFrom, stockListForMerge, b);
              })
            );
          } else {
            setBatches([
              mergeWarehouseStock(resolvedFrom, stockListForMerge, createEmptyBatch(effSizes)),
            ]);
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
    loadOrderAndStock(orderId || '');
  }, [orderId, docId, fromType, toType, fromWarehouseId, loadOrderAndStock]);

  const totals = useMemo(() => {
    return batches.reduce(
      (acc, b) => ({
        plan: acc.plan + toNum(b.plan_meters),
        fact: acc.fact + toNum(b.fact_meters),
        qty: acc.qty + toNum(b.total_qty),
        remainder: acc.remainder + toNum(b.remainder),
        defect: acc.defect + toNum(b.defect_meters),
        stock: acc.stock + toNum(b.stock_qty),
      }),
      { plan: 0, fact: 0, qty: 0, remainder: 0, defect: 0, stock: 0 }
    );
  }, [batches]);

  const totalNeedWarehouse = useMemo(() => {
    if (fromType !== 'warehouse') return 0;
    return Math.max(0, totals.plan - totals.stock);
  }, [fromType, totals.plan, totals.stock]);

  const materialShortages = useMemo(() => {
    if (isWarehouseToCutting) return [];
    if (fromType !== 'warehouse') return [];
    return batches.filter(
      (b) => b.fabric_name && toNum(b.stock_qty) < toNum(b.plan_meters)
    );
  }, [batches, fromType, isWarehouseToCutting]);

  const simpleTotals = useMemo(() => {
    if (!isWarehouseToCutting) return null;
    const totalQty = simpleRows.reduce((a, r) => a + toNum(r.qty), 0);
    const totalRolls = simpleRows.reduce((a, r) => a + toNum(r.rolls), 0);
    const totalSum = simpleRows.reduce((a, r) => a + toNum(r.qty) * toNum(r.price), 0);
    const hasOverStock = simpleRows.some((r) => r.overStock);
    return { totalQty, totalRolls, totalSum, hasOverStock };
  }, [isWarehouseToCutting, simpleRows]);

  const tableMinWidth = useMemo(() => {
    if (isWarehouseToCutting) return 960;
    const sz = activeSizes.length ? activeSizes : ERDEN_SIZES;
    return (
      90 +
      120 +
      80 +
      100 +
      100 +
      sz.length * 58 +
      80 +
      120 +
      90 +
      80 +
      90 +
      40
    );
  }, [isWarehouseToCutting, activeSizes]);

  const displayColor = (b) => {
    if (b.color === '__other__') return String(b.colorOther || '').trim();
    return String(b.color || '').trim();
  };

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

    if (isWarehouseToCutting) {
      for (const r of simpleRows) {
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

    for (const b of batches) {
      const fabric = String(b.fabric_name || '').trim();
      if (!fabric) continue;
      const fact = toNum(b.fact_meters);
      if (fact <= 0) continue;

      const color = displayColor(b);
      const marking = String(b.marking || '').trim();
      const material_name = [fabric, color || '—', marking].filter(Boolean).join(' · ');

      const stock = findStockRow(stockRows, fabric);
      const price =
        fromType === 'warehouse' && toNum(b.price) > 0
          ? toNum(b.price)
          : stock
            ? toNum(stock.price_per_unit ?? stock.price)
            : toNum(b.price);
      const item_id =
        stock?.id != null && !Number.isNaN(Number(stock.id)) ? Number(stock.id) : null;

      items.push({
        item_id,
        material_name,
        material_type: 'fabric',
        unit: 'м',
        qty: fact,
        price,
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
        isWarehouseToCutting
          ? 'Выберите материал со склада и укажите количество хотя бы в одной строке'
          : 'Укажите факт (м) и ткань хотя бы по одной партии'
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
        isWarehouseToCutting
          ? 'Выберите материал со склада и укажите количество хотя бы в одной строке'
          : 'Укажите факт (м) и ткань хотя бы по одной партии'
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

      {orderId ? (
        <div className="text-xs text-slate-500">
          Заказ: всего по модели{' '}
          <span className="text-slate-400">{orderQuantity || '—'} шт</span>
          {orderFabrics.length ? (
            <span className="ml-2">
              · тканей в спецификации: {orderFabrics.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {isWarehouseToCutting ? (
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
                {simpleRows.map((row, idx) => {
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
                              updateSimpleRow(row.id, { color: '__other__', colorOther: '' });
                            } else {
                              updateSimpleRow(row.id, { color: v, colorOther: '' });
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
                              updateSimpleRow(row.id, {
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
                              updateSimpleRow(row.id, {
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
                              updateSimpleRow(row.id, {
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
                            updateSimpleRow(row.id, { qty });
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
                            updateSimpleRow(row.id, { rolls });
                          }}
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'center' }}>
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => removeSimpleRow(row.id)}
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
          {simpleTotals ? (
            <div
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: '#1e3a5f',
                borderRadius: 8,
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                fontSize: 14,
              }}
            >
              <span>
                📦 Итого передать: <b>{simpleTotals.totalQty.toFixed(2)} м</b>
              </span>
              <span>
                🧻 Рулонов: <b>{simpleTotals.totalRolls}</b>
              </span>
              <span>
                💰 Сумма: <b>{simpleTotals.totalSum.toLocaleString('ru-RU')} сом</b>
              </span>
              {simpleTotals.hasOverStock ? (
                <span style={{ color: '#f87171' }}>
                  ⚠️ Некоторые позиции превышают остаток на складе!
                </span>
              ) : null}
            </div>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setSimpleRows((prev) => [...prev, createEmptySimpleRow()])}
              style={{
                marginTop: 12,
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Добавить строку
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }} className="rounded border border-white/10">
            <table
              className="movement-table w-full"
              style={{ fontSize: 13, minWidth: tableMinWidth, borderCollapse: 'collapse' }}
            >
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                {sizeCols.map((s) => (
                  <col key={s} style={{ width: 58 }} />
                ))}
                <col style={{ width: 80 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'left' }}>
                    Цвет ткани
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'left' }}>
                    Ткань
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'center' }}>
                    На складе
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'right' }}>
                    План (м)
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'right' }}>
                    Факт (м)
                  </th>
                  <th
                    colSpan={sizeCols.length}
                    style={{
                      ...TH_BASE,
                      textAlign: 'center',
                      borderBottom: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    Размеры (кол-во)
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'center' }}>
                    Итого кол-во
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'left' }}>
                    Маркировка
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'right' }}>
                    Остаток ткани (м)
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'right' }}>
                    Нехватка (м)
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'right' }}>
                    Брак (м)
                  </th>
                  <th rowSpan={2} style={{ ...TH_BASE, textAlign: 'center' }}>
                    🗑
                  </th>
                </tr>
                <tr>
                  {sizeCols.map((size) => (
                    <th key={size} style={TH_SIZE}>
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, idx) => {
                  const sq = toNum(batch.stock_qty);
                  const pm = toNum(batch.plan_meters);
                  const hasFabric = !!batch.fabric_name;
                  let stockCellColor = '#6b7280';
                  if (fromType === 'warehouse' && hasFabric) {
                    if (sq === 0) stockCellColor = '#f87171';
                    else if (sq >= pm) stockCellColor = '#4ade80';
                    else stockCellColor = '#fbbf24';
                  }
                  const rowBg = (idx + 1) % 2 === 0 ? '#0f172a' : '#1a2744';
                  const ctrlDisabled = readOnly ? { opacity: 0.65, cursor: 'not-allowed' } : {};
                  return (
                    <tr key={batch.id}>
                      <td style={{ ...CELL, background: rowBg, textAlign: 'left' }}>
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
                              updateBatch(batch.id, { color: '__other__', colorOther: '' });
                            } else {
                              updateBatch(batch.id, { color: v, colorOther: '' });
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
                        {(batch.color === '__other__' ||
                          (batch.color &&
                            orderColors.length &&
                            !orderColors.includes(batch.color))) && (
                          <input
                            placeholder="Введите цвет"
                            disabled={readOnly}
                            value={
                              batch.color === '__other__'
                                ? batch.colorOther
                                : orderColors.includes(batch.color)
                                  ? ''
                                  : batch.color || batch.colorOther
                            }
                            onChange={(e) =>
                              updateBatch(batch.id, {
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
                          value={batch.fabric_name}
                          disabled={readOnly}
                          onChange={(e) =>
                            recalcBatch(batch.id, {
                              fabric_name: e.target.value,
                            })
                          }
                          style={{ ...CTRL, ...ctrlDisabled }}
                        >
                          <option value="">— Ткань —</option>
                          {orderFabrics.map((f) => (
                            <option key={f.name} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'center',
                          fontWeight: 600,
                          color: stockCellColor,
                        }}
                      >
                        {fromType !== 'warehouse'
                          ? '—'
                          : sq > 0
                            ? `${sq} ${batch.unit || 'м'}`
                            : batch.fabric_name
                              ? '⚠️ нет'
                              : '—'}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={batch.plan_meters}
                          onChange={(e) =>
                            updateBatch(batch.id, {
                              plan_meters: parseFloat(e.target.value) || 0,
                            })
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
                          value={batch.fact_meters}
                          onChange={(e) => {
                            const fact = parseFloat(e.target.value) || 0;
                            recalcBatch(batch.id, { fact_meters: fact });
                          }}
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
                        />
                      </td>
                      {sizeCols.map((size) => (
                        <td key={size} style={{ ...CELL, background: rowBg, padding: '6px 4px' }}>
                          <input
                            type="number"
                            min="0"
                            disabled={readOnly}
                            value={batch.sizes[size] ?? 0}
                            onChange={(e) => {
                              const newSizes = {
                                ...batch.sizes,
                                [size]: parseInt(e.target.value, 10) || 0,
                              };
                              recalcBatch(batch.id, { sizes: newSizes });
                            }}
                            style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
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
                        {batch.total_qty}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          disabled={readOnly}
                          value={batch.marking || ''}
                          onChange={(e) => updateBatch(batch.id, { marking: e.target.value })}
                          style={{ ...CTRL, textAlign: 'left', ...ctrlDisabled }}
                          placeholder="МАР-001"
                        />
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'right',
                          color: batch.remainder >= 0 ? '#4ade80' : '#f87171',
                          fontWeight: 600,
                        }}
                      >
                        {toNum(batch.remainder).toFixed(2)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          background: rowBg,
                          textAlign: 'right',
                          color: batch.shortage > 0 ? '#f87171' : '#6b7280',
                          fontWeight: batch.shortage > 0 ? 600 : 400,
                        }}
                      >
                        {batch.shortage > 0 ? toNum(batch.shortage).toFixed(2) : '—'}
                      </td>
                      <td style={{ ...CELL, background: rowBg }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={readOnly}
                          value={batch.defect_meters}
                          onChange={(e) =>
                            updateBatch(batch.id, {
                              defect_meters: parseFloat(e.target.value) || 0,
                            })
                          }
                          style={{ ...CTRL, textAlign: 'center', ...ctrlDisabled }}
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
                              fontSize: 16,
                              padding: '4px',
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

          {fromType === 'warehouse' && materialShortages.length > 0 ? (
            <div
              style={{
                margin: '8px 0',
                padding: '10px 14px',
                background: '#7f1d1d',
                borderRadius: 6,
                border: '1px solid #ef4444',
                fontSize: 13,
              }}
            >
              ⚠️ <b>Недостаток материала:</b>
              {materialShortages.map((b) => (
                <div key={b.id} style={{ marginTop: 4, color: '#fca5a5' }}>
                  • {b.fabric_name} ({displayColor(b) || '—'}): нужно{' '}
                  <b>{toNum(b.plan_meters)} м</b>, на складе{' '}
                  <b>{toNum(b.stock_qty)} м</b>, не хватает{' '}
                  <b style={{ color: '#f87171' }}>
                    {(toNum(b.plan_meters) - toNum(b.stock_qty)).toFixed(2)} м
                  </b>
                </div>
              ))}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 16,
              padding: '12px 20px',
              background: '#1e3a5f',
              borderRadius: 8,
              display: 'flex',
              gap: 32,
              flexWrap: 'wrap',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <span>
              📐 План: <b>{totals.plan.toFixed(2)} м</b>
            </span>
            <span>
              ✅ Факт: <b>{totals.fact.toFixed(2)} м</b>
            </span>
            <span>
              👕 Итого кол-во: <b>{totals.qty} шт</b>
            </span>
            <span style={{ color: totals.remainder >= 0 ? '#4ade80' : '#f87171' }}>
              📦 Остаток: <b>{totals.remainder.toFixed(2)} м</b>
            </span>
            <span style={{ color: '#f87171' }}>
              ❌ Брак: <b>{totals.defect.toFixed(2)} м</b>
            </span>
            {fromType === 'warehouse' ? (
              <span
                style={{
                  color: totalNeedWarehouse > 0 ? '#f87171' : '#4ade80',
                }}
              >
                🏭 Склад: <b>{totals.stock.toFixed(2)} м</b> |{' '}
                {totalNeedWarehouse > 0 ? (
                  <>
                    ❌ Докупить: <b>{totalNeedWarehouse.toFixed(2)} м</b>
                  </>
                ) : (
                  <>✅ Материала достаточно</>
                )}
              </span>
            ) : null}
          </div>

          {!readOnly ? (
            <button
              type="button"
              onClick={() =>
                setBatches((prev) => [
                  ...prev,
                  mergeWarehouseStock(fromType, stockRows, createEmptyBatch(sizeCols)),
                ])
              }
              style={{
                marginTop: 12,
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Добавить партию
            </button>
          ) : null}
        </>
      )}

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
