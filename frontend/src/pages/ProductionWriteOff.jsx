import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const WRITEOFF_DOCS_KEY = 'writeoff_docs';

const STAGES = [
  { key: 'warehouse', label: '🏭 Склад', bg: '#0d1f3a', border: '#1e3a5f', accent: '#93c5fd' },
  { key: 'cutting', label: '✂️ Раскрой', bg: '#0d2a0d', border: '#1a4a1a', accent: '#86efac' },
  { key: 'sewing', label: '🧵 Пошив', bg: '#1a0d2a', border: '#2d1a4a', accent: '#d8b4fe' },
  { key: 'otk', label: '🔍 ОТК', bg: '#2a0d0d', border: '#4a1a1a', accent: '#fca5a5' },
  { key: 'shipment', label: '📦 Отгрузка', bg: '#2a2a0d', border: '#4a4a1a', accent: '#fde68a' },
];

const NEXT_STAGE = {
  warehouse: 'cutting',
  cutting: 'sewing',
  sewing: 'otk',
  otk: 'shipment',
};

const CARD = {
  background: '#0f1a2e',
  border: '1px solid #1e3a5f',
  borderRadius: 10,
  padding: '16px 20px',
  marginBottom: 16,
};

const TH = {
  padding: '8px 10px',
  fontSize: 12,
  color: '#94a3b8',
  fontWeight: 600,
  textAlign: 'left',
  borderBottom: '1px solid #1e3a5f',
};

const TD = {
  padding: '8px 10px',
  fontSize: 13,
  borderBottom: '1px solid #111',
  verticalAlign: 'middle',
};

function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function materialNameOf(row) {
  return String(
    row?.name ??
      row?.material_name ??
      row?.materialName ??
      row?.title ??
      row?.fabric_name ??
      row?.['наименование'] ??
      ''
  ).trim();
}

function materialRowsFromJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g?.rows || []) out.push(r);
    }
    return out;
  }
  return [];
}

function planQtyFromMaterialRow(r) {
  return toNum(r?.qty_total ?? r?.qtyTotal ?? r?.itogo ?? 0);
}

function qtyPerUnitFromRow(r) {
  return toNum(
    r?.qty_per_unit ?? r?.quantity_per ?? r?.norm ?? r?.qtyPerUnit ?? r?.qty ?? 0
  );
}

function priceFromMaterialRow(r) {
  return toNum(
    r?.price_per_unit ?? r?.price ?? r?.rateSom ?? r?.cost ?? r?.rate_som ?? 0
  );
}

function movementFromStage(m) {
  return String(m?.stage_meta?.from_stage || '').trim() || null;
}

function movementToStage(m) {
  return String(m?.stage_meta?.to_stage || '').trim() || null;
}

function movementBelongsToOrder(m, orderIdNum) {
  const oid = Number(m?.stage_meta?.order_id ?? m?.order_id);
  return Number.isFinite(oid) && oid === orderIdNum;
}

function statusLower(m) {
  return String(m?.status || '').toLowerCase();
}

function isIncomingStatus(m) {
  const s = statusLower(m);
  return s === 'posted' || s === 'approved' || s === 'draft';
}

function isOutgoingPosted(m) {
  const s = statusLower(m);
  return s === 'posted' || s === 'approved';
}

function itemMaterialLabel(it) {
  return String(it?.material_name ?? it?.item_name ?? it?.name ?? '').trim();
}

function itemMatchesMaterial(itemLabel, materialName) {
  if (!materialName) return false;
  const a = itemLabel.toLowerCase();
  const b = materialName.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function orderPieceQty(order) {
  if (!order) return 0;
  return toNum(order.quantity ?? order.total_quantity ?? order.total_qty ?? 0);
}

function normalizeOrdersList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.orders)) return data.orders;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.data)) return data.data;
  }
  return [];
}

function readDocsFromStorage() {
  try {
    const raw = localStorage.getItem(WRITEOFF_DOCS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nextDocNumber(existing) {
  let max = 0;
  for (const d of existing) {
    const m = /^ДОК-(\d+)$/.exec(String(d.number || '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `ДОК-${String(max + 1).padStart(3, '0')}`;
}

function orderLabelFromOrder(order, orderIdFallback) {
  if (!order) return String(orderIdFallback || '');
  const num = order.tz_code || order.number || order.id || orderIdFallback;
  const title = order.model_name || order.product_name || order.name || order.title || '';
  return title ? `${num} · ${title}` : String(num);
}

export default function ProductionWriteOff() {
  const navigate = useNavigate();

  const [mode, setMode] = useState('list');
  const [docs, setDocs] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);

  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [order, setOrder] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [modalRows, setModalRows] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [pendingMoves, setPendingMoves] = useState([]);
  const draggingRef = useRef(null);
  const orderFetchInFlightRef = useRef(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [justPlaced, setJustPlaced] = useState(null);
  const [showKanbanHint, setShowKanbanHint] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('writeoff_kanban_hint_seen') !== '1';
    } catch {
      return true;
    }
  });

  const persistDocs = useCallback((newDocs) => {
    setDocs(newDocs);
    try {
      localStorage.setItem(WRITEOFF_DOCS_KEY, JSON.stringify(newDocs));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    setDocs(readDocsFromStorage());
    api.orders
      .list({ limit: 100 })
      .then((data) => setOrders(normalizeOrdersList(data)))
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    setDragging(null);
    setDragOver(null);
    setPendingMoves([]);
    draggingRef.current = null;
    setJustPlaced(null);

    if (!orderId) {
      setOrder(null);
      setMovements([]);
      return;
    }
    const idNum = Number(orderId);
    if (!Number.isFinite(idNum) || idNum < 1) {
      setOrder(null);
      setMovements([]);
      return;
    }

    if (orderFetchInFlightRef.current) return undefined;
    orderFetchInFlightRef.current = true;

    let cancelled = false;
    setLoading(true);

    Promise.all([api.orders.get(idNum), api.movements.list({ order_id: idNum })])
      .then(([ord, movs]) => {
        if (cancelled) return;
        setOrder(ord && typeof ord === 'object' ? ord : null);
        setMovements(Array.isArray(movs) ? movs : []);
      })
      .catch(() => {
        if (!cancelled) {
          setOrder(null);
          setMovements([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        orderFetchInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
      orderFetchInFlightRef.current = false;
    };
  }, [orderId]);

  const orderIdNum = useMemo(() => {
    const n = Number(orderId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [orderId]);

  const movementsForOrder = useMemo(() => {
    if (!orderIdNum) return [];
    return movements.filter((m) => movementBelongsToOrder(m, orderIdNum));
  }, [movements, orderIdNum]);

  const materials = useMemo(() => {
    if (!order) return [];
    const pq = orderPieceQty(order);
    const fabricRows = materialRowsFromJson(order.fabric_data);
    const fittingRows = materialRowsFromJson(order.fittings_data);

    const fabrics = fabricRows
      .map((f, idx) => {
        const name = materialNameOf(f);
        if (!name) return null;
        const planRow = planQtyFromMaterialRow(f);
        const qpu = qtyPerUnitFromRow(f);
        const plan_qty = planRow > 0 ? planRow : qpu * pq;
        const price = priceFromMaterialRow(f);
        return {
          id: `fabric_${idx}_${name}`,
          name,
          type: 'Ткань',
          unit: String(f.unit || 'м').trim() || 'м',
          plan_qty,
          qty_per_unit: qpu,
          price,
        };
      })
      .filter(Boolean);

    const fittings = fittingRows
      .map((f, idx) => {
        const name = materialNameOf(f);
        if (!name) return null;
        const planRow = planQtyFromMaterialRow(f);
        const qpu = qtyPerUnitFromRow(f);
        const plan_qty = planRow > 0 ? planRow : qpu * pq;
        const price = priceFromMaterialRow(f);
        return {
          id: `fitting_${idx}_${name}`,
          name,
          type: 'Фурнитура',
          unit: String(f.unit || 'шт').trim() || 'шт',
          plan_qty,
          qty_per_unit: qpu,
          price,
        };
      })
      .filter(Boolean);

    return [...fabrics, ...fittings];
  }, [order]);

  const getNetQtyOnStage = useCallback(
    (materialName, stage) => {
      let inQty = 0;
      for (const mov of movementsForOrder) {
        if (movementToStage(mov) !== stage) continue;
        if (!isIncomingStatus(mov)) continue;
        const items = mov.Items || mov.items || [];
        for (const item of items) {
          const label = itemMaterialLabel(item);
          if (itemMatchesMaterial(label, materialName)) {
            inQty += toNum(item.qty);
          }
        }
      }

      let outQty = 0;
      for (const mov of movementsForOrder) {
        if (movementFromStage(mov) !== stage) continue;
        if (!isOutgoingPosted(mov)) continue;
        const items = mov.Items || mov.items || [];
        for (const item of items) {
          const label = itemMaterialLabel(item);
          if (itemMatchesMaterial(label, materialName)) {
            outQty += toNum(item.qty);
          }
        }
      }

      return Math.max(0, inQty - outQty);
    },
    [movementsForOrder]
  );

  const getQtyAtStage = useCallback(
    (mat, stageKey) => {
      if (stageKey === 'warehouse') return mat.plan_qty;
      return getNetQtyOnStage(mat.name, stageKey);
    },
    [getNetQtyOnStage]
  );

  const handleDragStart = useCallback(
    (e, mat, fromStage) => {
      const qty = fromStage === 'warehouse' ? mat.plan_qty : getNetQtyOnStage(mat.name, fromStage);
      if (qty <= 0) {
        e.preventDefault();
        return;
      }
      const payload = {
        materialId: mat.id,
        materialName: mat.name,
        materialType: mat.type,
        unit: mat.unit,
        fromStage,
        qty,
      };
      draggingRef.current = payload;
      setDragging(payload);
      try {
        localStorage.setItem('writeoff_kanban_hint_seen', '1');
      } catch {
        /* ignore */
      }
      setShowKanbanHint(false);
      try {
        e.dataTransfer.setData('text/plain', String(mat.id));
        e.dataTransfer.effectAllowed = 'move';
        const img = new Image();
        img.src =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
        e.dataTransfer.setDragImage(img, 0, 0);
      } catch {
        /* ignore */
      }
    },
    [getNetQtyOnStage]
  );

  const handleDrop = useCallback((e, toStage) => {
    e.preventDefault();
    const d = draggingRef.current;
    if (!d || d.fromStage === toStage) {
      draggingRef.current = null;
      setDragging(null);
      setDragOver(null);
      return;
    }
    setPendingMoves((prev) => {
      const exists = prev.findIndex(
        (p) => p.materialId === d.materialId && p.fromStage === d.fromStage && p.toStage === toStage
      );
      const nextEntry = {
        materialId: d.materialId,
        materialName: d.materialName,
        type: d.materialType,
        unit: d.unit,
        fromStage: d.fromStage,
        toStage,
        qty: d.qty,
      };
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = nextEntry;
        return updated;
      }
      return [...prev, nextEntry];
    });
    setJustPlaced({ materialId: d.materialId, stage: toStage });
    window.setTimeout(() => setJustPlaced(null), 400);
    draggingRef.current = null;
    setDragging(null);
    setDragOver(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
    setDragging(null);
    setDragOver(null);
  }, []);

  const handleCreateAllMovements = useCallback(() => {
    if (pendingMoves.length === 0 || !orderId) return;

    const routes = {};
    for (const pm of pendingMoves) {
      const key = `${pm.fromStage}→${pm.toStage}`;
      if (!routes[key]) {
        routes[key] = {
          fromStage: pm.fromStage,
          toStage: pm.toStage,
          items: [],
        };
      }
      routes[key].items.push({
        material_name: pm.materialName,
        material_type: pm.type,
        unit: pm.unit,
        qty: pm.qty,
      });
    }

    const routesList = Object.values(routes);
    const route = routesList[0];
    if (!route) return;

    try {
      sessionStorage.setItem(
        'movement_prefill',
        JSON.stringify({
          order_id: orderId,
          from_stage: route.fromStage,
          to_stage: route.toStage,
          items: route.items,
        })
      );
    } catch {
      /* ignore */
    }

    if (routesList.length > 1) {
      window.alert(
        `Будет создан документ для маршрута: ${route.fromStage} → ${route.toStage}.\nОстальные маршруты создайте отдельно.`
      );
    }

    navigate(
      `/movements/new?from=${encodeURIComponent(route.fromStage)}&to=${encodeURIComponent(
        route.toStage
      )}&order_id=${encodeURIComponent(orderId)}&prefill=1`
    );
    setPendingMoves([]);
  }, [pendingMoves, orderId, navigate]);

  const closeModal = useCallback(() => {
    setModal(null);
    setModalRows([]);
  }, []);

  const openTransferModal = useCallback(
    (fromStage, toStage) => {
      const rows = materials.map((mat) => {
        const available = getQtyAtStage(mat, fromStage);
        return {
          id: mat.id,
          name: mat.name,
          type: mat.type,
          unit: mat.unit,
          available,
          qty: available,
          selected: available > 0,
        };
      });
      setModalRows(rows);
      setModal({ fromStage, toStage });
    },
    [materials, getQtyAtStage]
  );

  const handleCreateMovementFromModal = useCallback(() => {
    if (!modal || !orderId) return;
    const selectedRows = modalRows.filter((r) => r.selected && r.available > 0 && toNum(r.qty) > 0);
    if (selectedRows.length === 0) return;

    const items = selectedRows.map((r) => ({
      material_name: r.name,
      material_type: r.type,
      unit: r.unit || 'м',
      qty: Math.min(r.available, Math.max(0, toNum(r.qty))),
    }));

    try {
      sessionStorage.setItem(
        'movement_prefill',
        JSON.stringify({
          order_id: orderId,
          from_stage: modal.fromStage,
          to_stage: modal.toStage,
          items,
        })
      );
    } catch {
      /* ignore */
    }

    navigate(
      `/movements/new?from=${encodeURIComponent(modal.fromStage)}&to=${encodeURIComponent(
        modal.toStage
      )}&order_id=${encodeURIComponent(orderId)}&prefill=1`
    );
    closeModal();
  }, [modal, modalRows, orderId, navigate, closeModal]);

  const handleSave = useCallback(() => {
    if (!orderId || !order) return;
    setSaving(true);
    try {
      const snapshot = materials.map((m) => ({ ...m }));
      const newDoc = {
        id: `writeoff_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        number: nextDocNumber(docs),
        order_id: String(orderId),
        order_name: orderLabelFromOrder(order, orderId),
        date,
        materials: snapshot,
        movements_count: movementsForOrder.length,
        created_at: new Date().toISOString(),
      };
      persistDocs([newDoc, ...docs]);
      setMode('list');
      setCurrentDoc(null);
      setOrderId('');
      setOrder(null);
      setMovements([]);
    } finally {
      setSaving(false);
    }
  }, [orderId, order, materials, movementsForOrder.length, docs, date, persistDocs]);

  const goList = useCallback(() => {
    setModal(null);
    setModalRows([]);
    setMode('list');
    setCurrentDoc(null);
    setOrderId('');
    setOrder(null);
    setMovements([]);
  }, []);

  const openNew = useCallback(() => {
    setModal(null);
    setModalRows([]);
    setCurrentDoc(null);
    setOrderId('');
    setOrder(null);
    setMovements([]);
    setDate(new Date().toISOString().slice(0, 10));
    setMode('new');
  }, []);

  const openDoc = useCallback((doc) => {
    setCurrentDoc(doc);
    setOrderId(String(doc.order_id || ''));
    setDate(String(doc.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    setMode('view');
  }, []);

  const CTRL = {
    background: '#1a1a2e',
    color: '#e2e8f0',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
  };

  const qtyPieces = order ? orderPieceQty(order) : 0;

  // ─── РЕЖИМ: СПИСОК ───
  if (mode === 'list') {
    return (
      <div style={{ padding: 20, color: '#e2e8f0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ color: '#a3e635', margin: 0, fontSize: 20 }}>📋 Списание материалов</h2>
          <button
            type="button"
            onClick={openNew}
            style={{
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            + Создать документ
          </button>
        </div>

        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>Документов пока нет</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Нажмите «+ Создать документ», чтобы начать</div>
          </div>
        ) : (
          <div style={CARD}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['№ Документа', 'Заказ', 'Дата', 'Материалов', 'Перемещений', ''].map((h) => (
                    <th key={h} style={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openDoc(doc)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDoc(doc);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                  >
                    <td style={{ ...TD, fontWeight: 700, color: '#a3e635' }}>{doc.number}</td>
                    <td style={TD}>{doc.order_name}</td>
                    <td style={{ ...TD, color: '#94a3b8' }}>
                      {doc.date ? new Date(doc.date).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>{doc.materials?.length ?? 0}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>{doc.movements_count ?? 0}</td>
                    <td style={TD}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDoc(doc);
                        }}
                        style={{
                          background: '#1e3a5f',
                          color: '#93c5fd',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        👁 Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const isView = mode === 'view';
  const oidEnc = encodeURIComponent(orderId);

  // ─── РЕЖИМ: НОВЫЙ / ПРОСМОТР ───
  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <style>
        {`
          @keyframes pulse-border {
            0% { box-shadow: 0 0 0 0 rgba(147,197,253,0.4); }
            70% { box-shadow: 0 0 0 10px rgba(147,197,253,0); }
            100% { box-shadow: 0 0 0 0 rgba(147,197,253,0); }
          }
          .drop-zone-active {
            animation: pulse-border 1s ease-in-out infinite;
          }
          @keyframes card-placed {
            0% { transform: scale(1.3); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
          }
          .card-just-placed {
            animation: card-placed 0.3s ease-out forwards;
          }
        `}
      </style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button
          type="button"
          onClick={goList}
          style={{
            background: 'none',
            color: '#94a3b8',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ← Назад
        </button>
        <h2 style={{ color: '#a3e635', margin: 0, fontSize: 18 }}>
          {mode === 'new' ? '📋 Новый документ списания' : `📋 ${currentDoc?.number || 'Документ'}`}
        </h2>
      </div>

      <div style={CARD}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Заказ
            </label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={isView}
              style={{ ...CTRL, width: '100%', boxSizing: 'border-box' }}
            >
              <option value="">— Выберите заказ —</option>
              {orders.map((o) => {
                const oQty = orderPieceQty(o);
                return (
                  <option key={o.id} value={String(o.id)}>
                    {o.tz_code || o.number || o.id}
                    {' · '}
                    {o.model_name || o.product_name || o.name || o.title || ''}
                    {oQty ? ` (${oQty} шт)` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Дата
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isView}
              style={{ ...CTRL, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {order ? (
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 12,
              fontSize: 13,
              flexWrap: 'wrap',
            }}
          >
            <span>
              📦 Кол-во: <b>{qtyPieces} шт</b>
            </span>
            <span>
              🧵 Тканей: <b>{materialRowsFromJson(order.fabric_data).length}</b>
            </span>
            <span>
              🔩 Фурнитуры: <b>{materialRowsFromJson(order.fittings_data).length}</b>
            </span>
            <span>
              📋 Перемещений: <b>{movementsForOrder.length}</b>
            </span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 30 }}>Загрузка...</div>
      ) : null}

      {order && !loading ? (
        <>
          {materials.length > 0 ? (
            <>
              <div style={CARD}>
                <h3 style={{ color: '#a3e635', margin: '0 0 12px', fontSize: 15 }}>
                  📊 Спецификация материалов
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr>
                        {['№', 'Наименование', 'Тип', 'Ед.изм', 'Норма на ед', 'Итого план', 'Цена', 'Сумма'].map(
                          (h) => (
                            <th key={h} style={TH}>
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((mat, idx) => (
                        <tr
                          key={mat.id}
                          style={{
                            background: idx % 2 === 0 ? '#090f1a' : '#0a1020',
                          }}
                        >
                          <td style={{ ...TD, textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>{mat.name}</td>
                          <td style={TD}>
                            <span
                              style={{
                                background:
                                  mat.type === 'Ткань'
                                    ? '#1e3a5f'
                                    : mat.type === 'Фурнитура'
                                      ? '#2a2a0d'
                                      : '#2a1a3a',
                                color:
                                  mat.type === 'Ткань'
                                    ? '#93c5fd'
                                    : mat.type === 'Фурнитура'
                                      ? '#fde68a'
                                      : '#d8b4fe',
                                borderRadius: 4,
                                padding: '2px 8px',
                                fontSize: 11,
                              }}
                            >
                              {mat.type}
                            </span>
                          </td>
                          <td style={{ ...TD, color: '#94a3b8' }}>{mat.unit}</td>
                          <td style={{ ...TD, textAlign: 'center' }}>{mat.qty_per_unit}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: '#fbbf24' }}>
                            {mat.plan_qty.toFixed(mat.unit === 'м' ? 1 : 0)} {mat.unit}
                          </td>
                          <td style={{ ...TD, color: '#94a3b8' }}>
                            {mat.price > 0 ? `${mat.price} сом` : '—'}
                          </td>
                          <td style={{ ...TD, fontWeight: 600, color: '#a3e635' }}>
                            {mat.price > 0
                              ? `${(mat.plan_qty * mat.price).toLocaleString('ru-RU')} сом`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={CARD}>
                <h3 style={{ color: '#a3e635', margin: '0 0 16px', fontSize: 15 }}>
                  🔄 Движение материалов по этапам
                </h3>

                {materials.length > 0 && showKanbanHint ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      textAlign: 'center',
                      padding: '4px 0 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span>⠿</span>
                    Перетащите карточку в другую колонку, чтобы запланировать перемещение
                  </div>
                ) : null}

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    overflowX: 'auto',
                    minWidth: 900,
                  }}
                >
                  <div style={{ width: 180, flexShrink: 0 }}>
                    <div
                      style={{
                        minHeight: 40,
                        marginBottom: 6,
                        fontSize: 11,
                        color: '#64748b',
                        fontWeight: 600,
                        padding: '8px 8px 4px',
                      }}
                    >
                      Материал
                    </div>
                    {materials.map((mat) => (
                      <div
                        key={mat.id}
                        style={{
                          background: '#0a1020',
                          border: '1px solid #1e2a3a',
                          borderRadius: 8,
                          padding: '8px 10px',
                          marginBottom: 4,
                          minHeight: 72,
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                          <span style={{ color: mat.type === 'Фурнитура' ? '#fde68a' : '#93c5fd' }}>
                            {mat.type === 'Фурнитура' ? '🔩 ' : '🧵 '}
                          </span>
                          {mat.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                          план: {mat.plan_qty.toFixed(mat.unit === 'м' ? 1 : 0)} {mat.unit}
                        </div>
                      </div>
                    ))}
                  </div>

                  {STAGES.map((stage) => {
                    const isColActive =
                      dragOver?.stage === stage.key && dragging && dragging.fromStage !== stage.key;
                    const colBg = isColActive ? `${stage.bg}cc` : stage.bg;
                    return (
                      <div
                        key={stage.key}
                        className={isColActive ? 'drop-zone-active' : ''}
                        onDragOver={(e) => {
                          e.preventDefault();
                          try {
                            e.dataTransfer.dropEffect = 'move';
                          } catch {
                            /* ignore */
                          }
                          setDragOver({ stage: stage.key });
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
                        }}
                        onDrop={(e) => handleDrop(e, stage.key)}
                        style={{
                          flex: '1 1 0',
                          minWidth: 120,
                          minHeight: 400,
                          borderRadius: 10,
                          transition: 'all 0.2s',
                          background: colBg,
                          border: isColActive
                            ? `2px dashed ${stage.accent}`
                            : `1px solid ${stage.border}33`,
                          boxShadow: isColActive ? `0 0 20px ${stage.accent}44` : 'none',
                          padding: '6px 4px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            textAlign: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            color: stage.accent,
                            padding: '4px 2px 6px',
                            borderBottom: `1px solid ${stage.border}44`,
                          }}
                        >
                          {stage.label}
                        </div>
                        {materials.map((mat) => {
                          const onStage =
                            stage.key === 'warehouse'
                              ? mat.plan_qty
                              : getNetQtyOnStage(mat.name, stage.key);
                          const hasQty = onStage > 0;
                          const pct =
                            mat.plan_qty > 0 ? Math.min(100, (onStage / mat.plan_qty) * 100) : 0;
                          const isDraggingFrom =
                            dragging?.materialId === mat.id && dragging?.fromStage === stage.key;
                          const justHere =
                            justPlaced?.materialId === mat.id && justPlaced?.stage === stage.key;

                          return (
                            <div key={mat.id} style={{ marginBottom: 2 }}>
                              {hasQty && isDraggingFrom ? (
                                <div
                                  style={{
                                    border: `2px dashed ${stage.accent}44`,
                                    borderRadius: 8,
                                    padding: '8px 6px',
                                    textAlign: 'center',
                                    minHeight: 60,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: `${stage.accent}44`,
                                    fontSize: 20,
                                    boxSizing: 'border-box',
                                  }}
                                >
                                  ···
                                </div>
                              ) : hasQty ? (
                                <div
                                  className={justHere ? 'card-just-placed' : ''}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, mat, stage.key)}
                                  onDragEnd={handleDragEnd}
                                  style={{
                                    background: stage.bg,
                                    border: `1px solid ${stage.border}`,
                                    borderRadius: 8,
                                    padding: '8px 6px',
                                    textAlign: 'center',
                                    cursor: 'grab',
                                    transition: 'none',
                                  }}
                                >
                                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>⠿</div>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: stage.accent }}>
                                    {onStage.toFixed(mat.unit === 'м' ? 1 : 0)}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                    {mat.unit}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      height: 3,
                                      background: '#1e2a3a',
                                      borderRadius: 2,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: '100%',
                                        width: `${pct}%`,
                                        background: stage.accent,
                                        borderRadius: 2,
                                      }}
                                    />
                                  </div>
                                  {NEXT_STAGE[stage.key] ? (
                                    <button
                                      type="button"
                                      draggable={false}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openTransferModal(stage.key, NEXT_STAGE[stage.key]);
                                      }}
                                      style={{
                                        marginTop: 6,
                                        background: 'none',
                                        border: `1px solid ${stage.accent}44`,
                                        borderRadius: 4,
                                        color: stage.accent,
                                        fontSize: 9,
                                        padding: '2px 6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                        fontWeight: 600,
                                      }}
                                    >
                                      Передать →
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    color: '#1e2a3a',
                                    fontSize: 16,
                                    padding: '12px 6px',
                                    textAlign: 'center',
                                    minHeight: 44,
                                  }}
                                >
                                  —
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {pendingMoves.length > 0 ? (
                <div
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: '12px 12px 0 0',
                    padding: '16px 20px',
                    marginTop: 16,
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <h4 style={{ color: '#a3e635', margin: 0, fontSize: 14 }}>
                      📦 Запланированные перемещения ({pendingMoves.length})
                    </h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setPendingMoves([])}
                        style={{
                          background: 'none',
                          color: '#64748b',
                          border: '1px solid #374151',
                          borderRadius: 6,
                          padding: '6px 12px',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Очистить
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateAllMovements}
                        style={{
                          background: '#16a34a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 16px',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        ✅ Создать документ перемещения
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {pendingMoves.map((pm) => {
                      const fromSt = STAGES.find((s) => s.key === pm.fromStage);
                      const toSt = STAGES.find((s) => s.key === pm.toStage);
                      const rowKey = `${pm.materialId}-${pm.fromStage}-${pm.toStage}`;
                      return (
                        <div
                          key={rowKey}
                          style={{
                            background: '#1e2a3a',
                            border: '1px solid #2d3a4a',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ color: fromSt?.accent }}>{fromSt?.label}</span>
                          <span style={{ color: '#64748b' }}>→</span>
                          <span style={{ color: toSt?.accent }}>{toSt?.label}</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{pm.materialName}</span>
                          <span style={{ color: '#a3e635', fontWeight: 700 }}>
                            {typeof pm.qty === 'number' ? pm.qty.toFixed(pm.unit === 'м' ? 1 : 0) : pm.qty}{' '}
                            {pm.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingMoves((prev) =>
                                prev.filter(
                                  (p) =>
                                    !(
                                      p.materialId === pm.materialId &&
                                      p.fromStage === pm.fromStage &&
                                      p.toStage === pm.toStage
                                    )
                                )
                              )
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 14,
                              padding: 0,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {[
                  { label: '📦 Склад→Раскрой', from: 'warehouse', to: 'cutting', bg: '#1e3a5f', color: '#93c5fd' },
                  { label: '✂️ Раскрой→Пошив', from: 'cutting', to: 'sewing', bg: '#0d2a0d', color: '#86efac' },
                  { label: '🧵 Пошив→ОТК', from: 'sewing', to: 'otk', bg: '#1a0d2a', color: '#d8b4fe' },
                  { label: '🔍 ОТК→Отгрузка', from: 'otk', to: 'shipment', bg: '#2a0d0d', color: '#fca5a5' },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() =>
                      navigate(`/movements/new?from=${btn.from}&to=${btn.to}&order_id=${oidEnc}`)
                    }
                    style={{
                      background: btn.bg,
                      color: btn.color,
                      border: `1px solid ${btn.color}44`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/movements/new?from=warehouse&to=sewing&order_id=${oidEnc}`)
                  }
                  style={{
                    background: '#2a2a0d',
                    color: '#fde68a',
                    border: '1px solid #fde68a44',
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  🔩 Фурнитура → Пошив
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/production/cost?order_id=${oidEnc}`)}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  💰 Себестоимость
                </button>
              </div>

              {mode === 'new' ? (
                <div style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !orderId}
                    style={{
                      background: orderId ? '#16a34a' : '#374151',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 24px',
                      cursor: orderId && !saving ? 'pointer' : 'not-allowed',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {saving ? '⏳ Сохранение...' : '💾 Сохранить документ'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ ...CARD, color: '#64748b', fontSize: 14, textAlign: 'center' }}>
              В спецификации заказа нет тканей и фурнитуры (или данные в неожиданном формате).
            </div>
          )}
        </>
      ) : !loading && !orderId ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          Выберите заказ — загрузятся спецификация, канбан по перемещениям и ссылки на документы.
        </div>
      ) : null}

      {dragging ? (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y - 20,
            zIndex: 9999,
            pointerEvents: 'none',
            background: '#1e3a5f',
            border: '2px solid #93c5fd',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 160,
            transform: 'rotate(2deg)',
            transition: 'none',
          }}
        >
          <span style={{ fontSize: 16 }}>📦</span>
          <div>
            <div
              style={{
                fontSize: 11,
                color: '#93c5fd',
                marginBottom: 2,
              }}
            >
              {dragging.materialName}
            </div>
            <div
              style={{
                color: '#a3e635',
                fontWeight: 800,
              }}
            >
              {dragging.unit === 'м'
                ? Number(dragging.qty).toFixed(1)
                : Number(dragging.qty).toFixed(0)}{' '}
              {dragging.unit}
            </div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: '#0f1a2e',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 600,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h3 style={{ color: '#a3e635', margin: 0 }}>📦 Подготовка перемещения</h3>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#1e3a5f',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#93c5fd' }}>
                {STAGES.find((s) => s.key === modal.fromStage)?.label}
              </span>
              <span style={{ color: '#64748b', fontSize: 18 }}>→</span>
              <span style={{ color: '#86efac' }}>{STAGES.find((s) => s.key === modal.toStage)?.label}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={
                        modalRows.filter((r) => r.available > 0).length > 0 &&
                        modalRows.filter((r) => r.available > 0).every((r) => r.selected)
                      }
                      onChange={(e) => {
                        const v = e.target.checked;
                        setModalRows((prev) =>
                          prev.map((r) =>
                            r.available > 0 ? { ...r, selected: v } : { ...r, selected: false }
                          )
                        );
                      }}
                    />
                  </th>
                  <th style={TH}>Материал</th>
                  <th style={TH}>Тип</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Доступно</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Кол-во передать</th>
                </tr>
              </thead>
              <tbody>
                {modalRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      background: row.selected ? '#0d1f0d' : '#090f18',
                      opacity: row.available <= 0 ? 0.4 : 1,
                    }}
                  >
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={row.available <= 0}
                        onChange={(e) =>
                          setModalRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, selected: e.target.checked } : r
                            )
                          )
                        }
                      />
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>{row.name}</td>
                    <td style={TD}>
                      <span
                        style={{
                          background: row.type === 'Ткань' ? '#1e3a5f' : '#2a1a3a',
                          color: row.type === 'Ткань' ? '#93c5fd' : '#d8b4fe',
                          borderRadius: 4,
                          padding: '1px 6px',
                          fontSize: 11,
                        }}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        color: row.available > 0 ? '#4ade80' : '#f87171',
                        fontWeight: 600,
                      }}
                    >
                      {row.available > 0 ? `${row.available} ${row.unit}` : 'нет'}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {row.selected && row.available > 0 ? (
                        <input
                          type="number"
                          min={0}
                          max={row.available}
                          value={row.qty === '' || row.qty == null ? '' : row.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            if (rawVal === '') {
                              setModalRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, qty: '' } : r))
                              );
                              return;
                            }
                            const q = parseFloat(rawVal);
                            const n = Number.isFinite(q) ? q : 0;
                            const clamped = Math.min(row.available, Math.max(0, n));
                            setModalRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, qty: clamped } : r))
                            );
                          }}
                          style={{
                            width: 80,
                            textAlign: 'center',
                            background: '#1a1a2e',
                            color: '#e2e8f0',
                            border: '1px solid #374151',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 13,
                          }}
                        />
                      ) : (
                        <span style={{ color: '#374151' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              style={{
                background: '#1e3a5f',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              Выбрано позиций:
              <b style={{ color: '#a3e635', marginLeft: 8 }}>
                {modalRows.filter((r) => r.selected && r.available > 0 && toNum(r.qty) > 0).length}
              </b>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleCreateMovementFromModal}
                disabled={!modalRows.some((r) => r.selected && r.available > 0 && toNum(r.qty) > 0)}
                style={{
                  flex: 1,
                  background: modalRows.some((r) => r.selected && r.available > 0 && toNum(r.qty) > 0)
                    ? '#16a34a'
                    : '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: 12,
                  cursor: modalRows.some((r) => r.selected && r.available > 0 && toNum(r.qty) > 0)
                    ? 'pointer'
                    : 'not-allowed',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                📦 Создать документ перемещения
              </button>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
