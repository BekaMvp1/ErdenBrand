/**
 * Таблица заказов на вкладке «Планирование расходов».
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { formatWeekRangeLabel } from '../../components/planChain/PlanChainDocumentCard';
import { getMonday } from '../../utils/cycleWeekLabels';
import {
  moveOrderToPaymentCalendar,
  syncExpenseOrdersToPaymentCalendar,
} from '../../utils/syncExpensePaymentCalendar';
import ExpenseStageDatePicker from '../../components/stage/ExpenseStageDatePicker';

const TH = {
  padding: '10px 12px',
  textAlign: 'left',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: '1px solid #2d3a8a',
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '10px 12px',
  verticalAlign: 'middle',
  borderBottom: '1px solid #111',
};

const EXPENSES_PATH = {
  procurement: '/procurement/expenses',
  cutting: '/cutting/expenses',
  sewing: '/sewing/expenses',
  otk: '/otk/expenses',
};

const ordersListInflight = new Map();

function fetchOrdersListOnce(params) {
  const key = JSON.stringify(params);
  if (ordersListInflight.has(key)) return ordersListInflight.get(key);
  const promise = api.orders.list(params).finally(() => {
    ordersListInflight.delete(key);
  });
  ordersListInflight.set(key, promise);
  return promise;
}

function OrdersLoadingIndicator() {
  return (
    <div
      style={{
        color: '#64748b',
        padding: '32px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>
        Загрузка заказов...
      </div>
      <div style={{ color: '#475569', fontSize: 12 }}>
        Первый запуск может занять до 60 секунд
      </div>
    </div>
  );
}

function orderMaterialsTotal(order) {
  const qty = toNum(order?.total_quantity ?? order?.quantity);
  const materials = [
    ...flattenMaterialRows(order?.fabric_data),
    ...flattenMaterialRows(order?.fittings_data),
  ];
  return materials.reduce((sum, m) => {
    const norm = qtyPerUnit(m);
    const price = materialPrice(m);
    return sum + norm * price * qty;
  }, 0);
}

const photoCache = {};
const photoLoading = new Set();

function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
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

function flattenMaterialRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((r) => r && typeof r === 'object');
  }
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g?.rows || []) {
        if (r && typeof r === 'object') out.push(r);
      }
    }
    return out;
  }
  return [];
}

function materialName(r) {
  return String(r?.name || r?.material_name || r?.title || '').trim();
}

function qtyPerUnit(r) {
  return toNum(r?.qty_per_unit ?? r?.quantity_per ?? r?.norm ?? r?.qtyPerUnit ?? r?.qty);
}

function materialPrice(r) {
  return toNum(r?.price_per_unit ?? r?.price ?? r?.rateSom ?? r?.cost ?? r?.rate_som);
}

function materialUnit(r, fallback = 'шт') {
  const u = String(r?.unit || '').trim();
  return u || fallback;
}

function materialLineSum(m, orderQty) {
  return qtyPerUnit(m) * materialPrice(m) * orderQty;
}

function materialsTotalsForOrder(order, orderQty) {
  const fabricRows = flattenMaterialRows(order?.fabric_data);
  const fittingsRows = flattenMaterialRows(order?.fittings_data);
  const fabricTotal = fabricRows.reduce((sum, m) => sum + materialLineSum(m, orderQty), 0);
  const fittingsTotal = fittingsRows.reduce((sum, m) => sum + materialLineSum(m, orderQty), 0);
  return {
    fabricTotal,
    fittingsTotal,
    grandTotal: fabricTotal + fittingsTotal,
  };
}

function flattenOpsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((r) => r && typeof r === 'object');
  }
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    for (const g of raw.groups) {
      for (const r of g?.rows || []) {
        if (r && typeof r === 'object') out.push(r);
      }
    }
    return out;
  }
  return [];
}

function opsFromOrder(order, stage) {
  const qty = toNum(order?.total_quantity ?? order?.quantity);
  const directKey =
    stage === 'cutting' ? 'cutting_ops' : stage === 'sewing' ? 'sewing_ops' : 'otk_ops';
  const direct = flattenOpsJson(order?.[directKey]);
  const ops = direct
    .map((op) => {
      const price = opUnitPrice(op);
      return {
        name: String(op?.name || op?.operation_name || op?.operation || '').trim(),
        price,
        lineTotal: price * qty,
      };
    })
    .filter((op) => op.name);

  const paySum = opsPayTotal(ops, qty);
  if (paySum > 0) return ops;

  const totalField =
    stage === 'cutting'
      ? order?.total_cutting_cost
      : stage === 'sewing'
        ? order?.total_sewing_cost
        : order?.total_otk_cost;
  const total = toNum(totalField);
  if (total > 0) {
    const label =
      stage === 'cutting'
        ? 'ЗП раскройного отдела (итого)'
        : stage === 'sewing'
          ? 'ЗП пошивного отдела (итого)'
          : 'ЗП отдела ОТК (итого)';
    return [
      {
        name: label,
        price: qty > 0 ? total / qty : total,
        lineTotal: total,
      },
    ];
  }

  return ops;
}

const STAGE_OPS_TITLE = {
  cutting: 'Операции раскроя',
  sewing: 'Операции пошива',
  otk: 'Операции ОТК',
};

const STAGE_OPS_TOTAL_LABEL = {
  cutting: 'Итого раскрой',
  sewing: 'Итого пошив',
  otk: 'Итого ОТК',
};

function opUnitPrice(op) {
  return toNum(
    op?.price ??
      op?.cost ??
      op?.operation_cost ??
      op?.rateSom ??
      op?.rate_som ??
      op?.price_per_unit
  );
}

function opsPayTotal(ops, qty) {
  return ops.reduce((sum, op) => sum + (op.lineTotal ?? opUnitPrice(op) * qty), 0);
}

function lsDatesKey(stage, orderId) {
  return `erden_stage_plan_orders_${stage}_${orderId}`;
}

function readLsDates(stage, orderId) {
  try {
    const raw = localStorage.getItem(lsDatesKey(stage, orderId));
    if (!raw) return { plan_date: '', fact_date: '' };
    const j = JSON.parse(raw);
    return { plan_date: j.plan_date || '', fact_date: j.fact_date || '' };
  } catch {
    return { plan_date: '', fact_date: '' };
  }
}

function writeLsDates(stage, orderId, patch) {
  try {
    const cur = readLsDates(stage, orderId);
    localStorage.setItem(lsDatesKey(stage, orderId), JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* ignore */
  }
}

function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function orderWeekLabel(order) {
  const d = chainDateIso(order?.deadline);
  if (d) return formatWeekRangeLabel(getMonday(d));
  const pm = order?.planned_month;
  if (pm && /^\d{4}-\d{2}$/.test(String(pm))) {
    return formatWeekRangeLabel(getMonday(`${String(pm).slice(0, 7)}-01`));
  }
  return order?.plan_week || order?.week_label || '—';
}

function orderStatusUi(order) {
  const sn = String(order?.OrderStatus?.name || order?.status_name || '').trim();
  if (sn === 'Готов' || order?.status === 'done' || order?.status === 'completed') {
    return { key: 'done', label: 'Завершено' };
  }
  if (sn === 'В работе' || order?.status === 'in_progress' || order?.status === 'active') {
    return { key: 'in_progress', label: 'В процессе' };
  }
  return { key: 'not_started', label: 'Не начато' };
}

function OrderThumb({ orderId }) {
  const [src, setSrc] = useState(
    photoCache[orderId] !== undefined ? photoCache[orderId] : undefined
  );

  useEffect(() => {
    const key = String(orderId);
    if (!key) return undefined;
    if (photoCache[key] !== undefined) return undefined;
    if (photoLoading.has(key)) return undefined;

    photoLoading.add(key);
    let cancelled = false;
    api.orders
      .photo(key)
      .then((res) => {
        const photo = res?.data?.photo ?? res?.photo ?? null;
        photoCache[key] = photo;
        if (!cancelled) setSrc(photo);
      })
      .catch(() => {
        photoCache[key] = null;
        if (!cancelled) setSrc(null);
      })
      .finally(() => {
        photoLoading.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const box = {
    width: 48,
    height: 48,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    background: '#1e2a3a',
  };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }}
      />
    );
  }

  return <div style={box}>👗</div>;
}

export default function StagePlanOrdersTable({
  stage = 'cutting',
  hideExpensesNav = false,
  showSectionTitle = true,
}) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState({});
  const [dateDrafts, setDateDrafts] = useState({});
  const [nameSearch, setNameSearch] = useState('');

  const expensesPath = EXPENSES_PATH[stage] || `/${stage}/expenses`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const listParams = { limit: 100, light: '1' };
    fetchOrdersListOnce(listParams)
      .then((data) => {
        if (cancelled) return;
        const list = normalizeOrdersList(data);
        setOrders(list);
        const drafts = {};
        for (const o of list) {
          const ls = readLsDates(stage, o.id);
          drafts[o.id] = {
            plan_date: ls.plan_date || chainDateIso(o.plan_date) || chainDateIso(o.deadline) || '',
            fact_date: ls.fact_date || chainDateIso(o.fact_date) || '',
          };
        }
        setDateDrafts(drafts);
        syncExpenseOrdersToPaymentCalendar(list, stage, drafts);
      })
      .catch((err) => {
        console.error('[StagePlanOrdersTable] orders load:', err?.message || err);
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stage]);

  const handleUpdateDate = useCallback(
    async (orderId, field, value) => {
      writeLsDates(stage, orderId, { [field]: value });
      setDateDrafts((prev) => ({
        ...prev,
        [orderId]: { ...(prev[orderId] || {}), [field]: value },
      }));

      try {
        await api.orders.update(orderId, { [field]: value });

        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, [field]: value } : o))
        );

        if (field === 'plan_date' && value) {
          const order = orders.find((o) => o.id === orderId);
          if (order) {
            const updatedOrder = { ...order, plan_date: value };
            await moveOrderToPaymentCalendar(updatedOrder, stage, value);
          }
        }
      } catch (e) {
        console.error('[handleUpdateDate]:', e?.message || e);
      }
    },
    [stage, orders]
  );

  const filteredOrders = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const hay = [
        o.title,
        o.model_name,
        o.tz_code,
        o.client_name,
        o.Client?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, nameSearch]);

  const showMaterials = stage === 'procurement';
  const showOps = stage === 'cutting' || stage === 'sewing' || stage === 'otk';

  return (
    <div className="no-print mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {showSectionTitle ? (
          <h2 className="text-base font-semibold text-white/90">План заказов</h2>
        ) : (
          <span />
        )}
        <input
          type="text"
          placeholder="Поиск по названию"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#444] text-white text-sm min-w-[200px] placeholder-white/40"
        />
      </div>

      {loading ? (
        <OrdersLoadingIndicator />
      ) : filteredOrders.length === 0 ? (
        <p className="text-sm text-white/60 py-4">Нет заказов для отображения</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              minWidth: 960,
            }}
          >
            <thead>
              <tr style={{ background: '#1a237e' }}>
                <th style={TH}>Фото</th>
                <th style={TH} />
                <th style={TH}>TZ — MODEL</th>
                <th style={TH}>Кол-во</th>
                <th style={TH}>Клиент</th>
                <th style={TH}>Неделя план</th>
                <th style={TH}>Дата план</th>
                <th style={TH}>Дата факт</th>
                <th style={TH}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, idx) => {
                const isExpanded = !!expandedOrders[order.id];
                const qty = toNum(order.total_quantity ?? order.quantity ?? 0);
                const clientName =
                  order.client_name || order.Client?.name || '—';
                const materials = [
                  ...flattenMaterialRows(order.fabric_data).map((f) => ({
                    ...f,
                    mtype: 'Ткань',
                  })),
                  ...flattenMaterialRows(order.fittings_data).map((f) => ({
                    ...f,
                    mtype: 'Фурнитура',
                  })),
                ].filter((m) => materialName(m));
                const ops = showOps ? opsFromOrder(order, stage) : [];
                const st = orderStatusUi(order);
                const dates = dateDrafts[order.id] || { plan_date: '', fact_date: '' };
                const tzLine =
                  String(order.article || order.tz_code || order.number || order.id).trim() ||
                  `#${order.id}`;
                const modelLine =
                  order.model_name || order.product_name || order.title || order.name || '—';

                return (
                  <Fragment key={order.id}>
                    <tr
                      style={{
                        background: idx % 2 === 0 ? '#0a1020' : '#0f172a',
                        cursor: 'pointer',
                      }}
                      onClick={() =>
                        setExpandedOrders((prev) => ({
                          ...prev,
                          [order.id]: !prev[order.id],
                        }))
                      }
                    >
                      <td style={{ ...TD, width: 60 }}>
                        <OrderThumb orderId={order.id} />
                      </td>
                      <td
                        style={{
                          ...TD,
                          width: 30,
                          textAlign: 'center',
                          color: '#64748b',
                        }}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </td>
                      <td style={TD}>
                        <div style={{ fontWeight: 700, color: '#a3e635', fontSize: 13 }}>
                          {tzLine}
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>
                          {modelLine}
                        </div>
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <b style={{ color: '#e2e8f0', fontSize: 14 }}>{qty}</b>
                        <div style={{ color: '#64748b', fontSize: 10 }}>шт</div>
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            color: clientName === 'WB' ? '#3b82f6' : '#94a3b8',
                            fontWeight: clientName === 'WB' ? 700 : 400,
                          }}
                        >
                          {clientName}
                        </span>
                      </td>
                      <td style={{ ...TD, color: '#94a3b8', fontSize: 12 }}>
                        {orderWeekLabel(order)}
                      </td>
                      <td style={TD}>
                        <ExpenseStageDatePicker
                          variant="plan"
                          value={dates.plan_date || ''}
                          onChange={(iso) =>
                            handleUpdateDate(order.id, 'plan_date', iso)
                          }
                        />
                      </td>
                      <td style={TD}>
                        <ExpenseStageDatePicker
                          variant="fact"
                          value={dates.fact_date || ''}
                          onChange={(iso) =>
                            handleUpdateDate(order.id, 'fact_date', iso)
                          }
                        />
                      </td>
                      <td style={TD}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              st.key === 'done'
                                ? '#16a34a'
                                : st.key === 'in_progress'
                                  ? '#1e3a5f'
                                  : '#374151',
                            color:
                              st.key === 'done'
                                ? '#fff'
                                : st.key === 'in_progress'
                                  ? '#93c5fd'
                                  : '#94a3b8',
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr>
                        <td
                          colSpan={9}
                          style={{
                            background: '#050d1a',
                            padding: '12px 16px 16px',
                            borderBottom: '2px solid #1e3a5f',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns:
                                showMaterials && materials.length > 0 && ops.length > 0
                                  ? '1fr 1fr'
                                  : '1fr',
                              gap: 16,
                            }}
                          >
                            {showMaterials && materials.length > 0 ? (
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#a3e635',
                                    marginBottom: 8,
                                  }}
                                >
                                  📦 Материалы ({materials.length})
                                </div>
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: 11,
                                  }}
                                >
                                  <thead>
                                    <tr style={{ background: '#1e3a5f' }}>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'left',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Наименование
                                      </th>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'center',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Тип
                                      </th>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'right',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Норма/ед
                                      </th>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'right',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Итого
                                      </th>
                                      <th
                                        style={{
                                          padding: '5px 10px',
                                          textAlign: 'right',
                                          color: '#94a3b8',
                                          fontSize: 11,
                                          fontWeight: 600,
                                        }}
                                      >
                                        Сумма
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {materials.map((m, i) => {
                                      const norm = qtyPerUnit(m);
                                      const total = norm * qty;
                                      const price = materialPrice(m);
                                      const lineSum = materialLineSum(m, qty);
                                      return (
                                        <tr
                                          key={`${m.mtype}-${i}`}
                                          style={{
                                            background:
                                              i % 2 === 0 ? '#0a1020' : '#090f18',
                                          }}
                                        >
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              color: '#cbd5e1',
                                            }}
                                          >
                                            {materialName(m)}
                                          </td>
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              textAlign: 'center',
                                            }}
                                          >
                                            <span
                                              style={{
                                                background:
                                                  m.mtype === 'Ткань'
                                                    ? '#1e3a5f'
                                                    : '#2a1a3a',
                                                color:
                                                  m.mtype === 'Ткань'
                                                    ? '#93c5fd'
                                                    : '#d8b4fe',
                                                padding: '1px 6px',
                                                borderRadius: 3,
                                                fontSize: 10,
                                              }}
                                            >
                                              {m.mtype}
                                            </span>
                                          </td>
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              textAlign: 'right',
                                              color: '#94a3b8',
                                            }}
                                          >
                                            {norm} {materialUnit(m)}
                                          </td>
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              textAlign: 'right',
                                              fontWeight: 600,
                                              color: '#fbbf24',
                                            }}
                                          >
                                            {total.toFixed(1)}
                                          </td>
                                          <td
                                            style={{
                                              padding: '5px 10px',
                                              textAlign: 'right',
                                              color: price > 0 ? '#4ade80' : '#475569',
                                              fontWeight: price > 0 ? 600 : 400,
                                              fontSize: 12,
                                            }}
                                          >
                                            {price > 0
                                              ? `${lineSum.toLocaleString('ru-RU')} сом`
                                              : '—'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {(() => {
                                      const { fabricTotal, fittingsTotal, grandTotal } =
                                        materialsTotalsForOrder(order, qty);
                                      return (
                                        <>
                                          <tr>
                                            <td
                                              colSpan={5}
                                              style={{
                                                borderTop: '1px solid #1e3a5f',
                                                padding: 0,
                                              }}
                                            />
                                          </tr>
                                          {fabricTotal > 0 ? (
                                            <tr style={{ background: '#0a1628' }}>
                                              <td
                                                style={{
                                                  padding: '6px 10px',
                                                  color: '#93c5fd',
                                                  fontSize: 12,
                                                }}
                                              >
                                                Итого ткань
                                              </td>
                                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                <span
                                                  style={{
                                                    background: '#1e3a5f',
                                                    color: '#93c5fd',
                                                    padding: '1px 6px',
                                                    borderRadius: 3,
                                                    fontSize: 10,
                                                  }}
                                                >
                                                  Ткань
                                                </span>
                                              </td>
                                              <td colSpan={2} />
                                              <td
                                                style={{
                                                  padding: '6px 10px',
                                                  textAlign: 'right',
                                                  color: '#93c5fd',
                                                  fontWeight: 700,
                                                  fontSize: 13,
                                                }}
                                              >
                                                {fabricTotal.toLocaleString('ru-RU')} сом
                                              </td>
                                            </tr>
                                          ) : null}
                                          {fittingsTotal > 0 ? (
                                            <tr style={{ background: '#0a1628' }}>
                                              <td
                                                style={{
                                                  padding: '6px 10px',
                                                  color: '#d8b4fe',
                                                  fontSize: 12,
                                                }}
                                              >
                                                Итого фурнитура
                                              </td>
                                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                <span
                                                  style={{
                                                    background: '#2a1a3a',
                                                    color: '#d8b4fe',
                                                    padding: '1px 6px',
                                                    borderRadius: 3,
                                                    fontSize: 10,
                                                  }}
                                                >
                                                  Фурнитура
                                                </span>
                                              </td>
                                              <td colSpan={2} />
                                              <td
                                                style={{
                                                  padding: '6px 10px',
                                                  textAlign: 'right',
                                                  color: '#d8b4fe',
                                                  fontWeight: 700,
                                                  fontSize: 13,
                                                }}
                                              >
                                                {fittingsTotal.toLocaleString('ru-RU')} сом
                                              </td>
                                            </tr>
                                          ) : null}
                                          <tr style={{ background: '#0f2040' }}>
                                            <td
                                              style={{
                                                padding: '8px 10px',
                                                color: '#a3e635',
                                                fontWeight: 700,
                                                fontSize: 13,
                                              }}
                                            >
                                              💰 ИТОГО материалы
                                            </td>
                                            <td
                                              colSpan={3}
                                              style={{
                                                padding: '8px 10px',
                                                color: '#64748b',
                                                fontSize: 11,
                                                textAlign: 'right',
                                              }}
                                            >
                                              на {qty.toLocaleString('ru-RU')} шт
                                            </td>
                                            <td
                                              style={{
                                                padding: '8px 10px',
                                                textAlign: 'right',
                                                color: '#a3e635',
                                                fontWeight: 700,
                                                fontSize: 15,
                                              }}
                                            >
                                              {grandTotal.toLocaleString('ru-RU')} сом
                                            </td>
                                          </tr>
                                          {qty > 0 && grandTotal > 0 ? (
                                            <tr style={{ background: '#050d1a' }}>
                                              <td
                                                style={{
                                                  padding: '5px 10px',
                                                  color: '#64748b',
                                                  fontSize: 11,
                                                }}
                                              >
                                                Себестоимость / шт
                                              </td>
                                              <td colSpan={3} />
                                              <td
                                                style={{
                                                  padding: '5px 10px',
                                                  textAlign: 'right',
                                                  color: '#64748b',
                                                  fontSize: 11,
                                                }}
                                              >
                                                {(grandTotal / qty).toLocaleString('ru-RU', {
                                                  maximumFractionDigits: 0,
                                                })}{' '}
                                                сом/шт
                                              </td>
                                            </tr>
                                          ) : null}
                                        </>
                                      );
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}

                            {ops.length > 0 ? (
                              <div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: '#a3e635',
                                    marginBottom: 8,
                                  }}
                                >
                                  ⚙️ {STAGE_OPS_TITLE[stage] || 'Операции'} ({ops.length})
                                </div>
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: 11,
                                  }}
                                >
                                  <thead>
                                    <tr style={{ background: '#1e3a5f' }}>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'left',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Операция
                                      </th>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'right',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        Ставка
                                      </th>
                                      <th
                                        style={{
                                          padding: '4px 8px',
                                          textAlign: 'right',
                                          color: '#94a3b8',
                                        }}
                                      >
                                        ЗП итого
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ops.map((op, i) => {
                                      const price = op.price ?? opUnitPrice(op);
                                      const totalPay =
                                        op.lineTotal ?? price * qty;
                                      return (
                                        <tr
                                          key={i}
                                          style={{
                                            background:
                                              i % 2 === 0 ? '#0a1020' : '#090f18',
                                          }}
                                        >
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              color: '#cbd5e1',
                                            }}
                                          >
                                            {op.name || '—'}
                                          </td>
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              textAlign: 'right',
                                              color: '#94a3b8',
                                            }}
                                          >
                                            {price.toLocaleString('ru-RU')} сом/шт
                                          </td>
                                          <td
                                            style={{
                                              padding: '4px 8px',
                                              textAlign: 'right',
                                              fontWeight: 600,
                                              color: '#fbbf24',
                                            }}
                                          >
                                            {totalPay.toLocaleString('ru-RU')} сом
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {(() => {
                                      const opsTotal = opsPayTotal(ops, qty);
                                      return (
                                        <tr style={{ background: '#0f2040' }}>
                                          <td
                                            style={{
                                              padding: '8px 10px',
                                              fontWeight: 700,
                                              color: '#a3e635',
                                              fontSize: 13,
                                            }}
                                          >
                                            {STAGE_OPS_TOTAL_LABEL[stage] || 'Итого'}
                                          </td>
                                          <td
                                            style={{
                                              padding: '8px 10px',
                                              textAlign: 'right',
                                              fontWeight: 700,
                                              color: '#a3e635',
                                              fontSize: 14,
                                            }}
                                          >
                                            {opsTotal.toLocaleString('ru-RU')} сом
                                          </td>
                                          <td
                                            style={{
                                              padding: '8px 10px',
                                              textAlign: 'right',
                                              color: '#64748b',
                                              fontSize: 11,
                                            }}
                                          >
                                            на {qty.toLocaleString('ru-RU')} шт
                                          </td>
                                        </tr>
                                      );
                                    })()}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>

                          {!hideExpensesNav ? (
                            <div
                              style={{
                                marginTop: 12,
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`${expensesPath}?order_id=${order.id}`);
                                }}
                                style={{
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '6px 14px',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                💰 Планирование расходов
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
