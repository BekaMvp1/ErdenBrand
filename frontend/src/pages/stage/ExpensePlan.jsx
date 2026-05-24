/**
 * Планирование расходов по этапу → отправка в платёжный календарь
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import StagePlanOrdersTable from './StagePlanOrdersTable';

const ORDERS_TABLE_STAGES = new Set(['procurement', 'cutting', 'sewing', 'otk']);

const TH = {
  padding: '8px 10px',
  fontSize: 12,
  color: '#94a3b8',
  fontWeight: 600,
  borderBottom: '1px solid #1e3a5f',
  textAlign: 'left',
};

const TD = {
  padding: '6px 10px',
  fontSize: 13,
  borderBottom: '1px solid #111',
  verticalAlign: 'middle',
};

const INPUT = {
  background: '#1a1a2e',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  width: '100%',
};

const STAGE_LABELS = {
  procurement: 'Закуп',
  cutting: 'Раскрой',
  sewing: 'Пошив',
  otk: 'ОТК',
};

function getCurrentWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
}

function generateWeeks() {
  const weeks = [];
  const date = new Date('2025-12-29T12:00:00');
  for (let w = 1; w <= 52; w++) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const em = String(end.getMonth() + 1).padStart(2, '0');
    weeks.push({
      number: w,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      label: `Нед ${w}: ${start.getDate()}.${sm} — ${end.getDate()}.${em}`,
    });
    date.setDate(date.getDate() + 7);
  }
  return weeks;
}

const WEEKS = generateWeeks();

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

function opsFromOrder(order, stage) {
  const direct =
    stage === 'cutting'
      ? order?.cutting_ops
      : stage === 'sewing'
        ? order?.sewing_ops
        : stage === 'otk'
          ? order?.otk_ops
          : null;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.map((op) => ({
      name: String(op?.name || op?.operation_name || op?.operation || '').trim(),
      price: toNum(op?.price ?? op?.cost ?? op?.operation_cost),
    }));
  }

  const ops = Array.isArray(order?.OrderOperations) ? order.OrderOperations : [];
  const filtered = ops.filter((op) => {
    const n = String(op?.Operation?.name || op?.name || '').toLowerCase();
    if (!n) return true;
    if (stage === 'cutting') return /раскрой|cut/.test(n);
    if (stage === 'sewing') return /пошив|sew/.test(n);
    if (stage === 'otk') return /отк|qc|контрол/.test(n);
    return true;
  });
  const src = filtered.length ? filtered : ops;
  return src.map((op) => ({
    name: String(op?.Operation?.name || op?.name || '').trim(),
    price: toNum(op?.price ?? op?.cost ?? op?.operation_cost),
  }));
}

function newRowId() {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ExpensePlanOrders({ stage }) {
  const stageLabel = STAGE_LABELS[stage] || stage;
  return (
    <div className="card-neon rounded-card overflow-hidden">
      <div style={{ padding: 16, color: '#e2e8f0' }}>
        <h3 style={{ color: '#a3e635', margin: '0 0 16px', fontSize: 16 }}>
          💰 Планирование расходов — {stageLabel}
        </h3>
        <StagePlanOrdersTable stage={stage} hideExpensesNav showSectionTitle={false} />
      </div>
    </div>
  );
}

function ExpensePlanProcurement({ stage = 'procurement' }) {
  const stageLabel = STAGE_LABELS[stage] || stage;
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(() => searchParams.get('order_id') || '');
  const [order, setOrder] = useState(null);
  const [weekNumber, setWeekNumber] = useState(getCurrentWeekNumber);
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [expenseRows, setExpenseRows] = useState([]);
  const [sending, setSending] = useState(false);
  const [orders, setOrders] = useState([]);

  const fabricCount = useMemo(() => flattenMaterialRows(order?.fabric_data).length, [order]);
  const fittingsCount = useMemo(() => flattenMaterialRows(order?.fittings_data).length, [order]);

  const calculateExpenses = useCallback(
    (o) => {
      if (!o) {
        setExpenseRows([]);
        return;
      }
      const qty = toNum(o.total_quantity ?? o.quantity ?? o.qty_order);
      const rows = [];

      if (stage === 'procurement') {
        flattenMaterialRows(o.fabric_data).forEach((f) => {
          const name = materialName(f);
          if (!name) return;
          const norm = qtyPerUnit(f);
          const price = materialPrice(f);
          const totalQty = norm * qty;
          const totalSum = totalQty * price;
          rows.push({
            id: newRowId(),
            category: 'supplier_fabric',
            name: `Ткань: ${name}`,
            qty: totalQty > 0 ? totalQty.toFixed(2) : '',
            unit: materialUnit(f, 'м'),
            price,
            total: totalSum,
            editable: true,
          });
        });

        flattenMaterialRows(o.fittings_data).forEach((f) => {
          const name = materialName(f);
          if (!name) return;
          const norm = qtyPerUnit(f);
          const price = materialPrice(f);
          const totalQty = norm * qty;
          const totalSum = totalQty * price;
          rows.push({
            id: newRowId(),
            category: 'supplier_accessories',
            name: `Фурнитура: ${name}`,
            qty: totalQty > 0 ? totalQty.toFixed(2) : '',
            unit: materialUnit(f, 'шт'),
            price,
            total: totalSum,
            editable: true,
          });
        });
      }

      if (stage === 'cutting') {
        const ops = opsFromOrder(o, 'cutting');
        ops.forEach((op) => {
          if (!op.name) return;
          rows.push({
            id: newRowId(),
            category: 'dept_cutting',
            name: `Операция: ${op.name}`,
            qty: qty,
            unit: 'шт',
            price: op.price,
            total: op.price * qty,
            editable: true,
          });
        });
        if (rows.length === 0) {
          rows.push({
            id: newRowId(),
            category: 'dept_cutting',
            name: 'ЗП раскройного отдела',
            qty: qty,
            unit: 'шт',
            price: 0,
            total: 0,
            editable: true,
          });
        }
      }

      if (stage === 'sewing') {
        const ops = opsFromOrder(o, 'sewing');
        ops.forEach((op) => {
          if (!op.name) return;
          rows.push({
            id: newRowId(),
            category: 'dept_sewing',
            name: `Операция: ${op.name}`,
            qty: qty,
            unit: 'шт',
            price: op.price,
            total: op.price * qty,
            editable: true,
          });
        });
        if (rows.length === 0) {
          rows.push({
            id: newRowId(),
            category: 'dept_sewing',
            name: 'ЗП пошивного отдела',
            qty: qty,
            unit: 'шт',
            price: 0,
            total: 0,
            editable: true,
          });
        }
      }

      if (stage === 'otk') {
        const ops = opsFromOrder(o, 'otk');
        ops.forEach((op) => {
          if (!op.name) return;
          rows.push({
            id: newRowId(),
            category: 'dept_otk',
            name: `Операция: ${op.name}`,
            qty: qty,
            unit: 'шт',
            price: op.price,
            total: op.price * qty,
            editable: true,
          });
        });
        if (rows.length === 0) {
          rows.push({
            id: newRowId(),
            category: 'dept_otk',
            name: 'ЗП отдела ОТК',
            qty: qty,
            unit: 'шт',
            price: 0,
            total: 0,
            editable: true,
          });
        }
      }

      setExpenseRows(rows);
    },
    [stage]
  );

  const updateRow = useCallback((id, changes) => {
    setExpenseRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.orders
      .list({ limit: 100 })
      .then((data) => {
        if (!cancelled) setOrders(normalizeOrdersList(data));
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });

    const curWeek = getCurrentWeekNumber();
    const week = WEEKS.find((w) => w.number === curWeek);
    if (week) {
      setWeekNumber(curWeek);
      setWeekStart(week.start);
      setWeekEnd(week.end);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get('order_id');
    if (fromUrl) setOrderId(String(fromUrl));
  }, [searchParams]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setExpenseRows([]);
      return undefined;
    }

    let cancelled = false;
    api.orders
      .get(orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        calculateExpenses(o);
      })
      .catch(() => {
        if (!cancelled) {
          setOrder(null);
          setExpenseRows([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, calculateExpenses]);

  const handleSendToCalendar = async () => {
    if (!orderId || expenseRows.length === 0) return;
    if (!weekNumber) {
      alert('Выберите неделю');
      return;
    }

    setSending(true);
    try {
      const week = WEEKS.find((w) => w.number === weekNumber);
      const orderLabel =
        order?.tz_code ||
        order?.order_number ||
        order?.number ||
        orderId;

      for (const row of expenseRows) {
        if (!row.total || row.total <= 0) continue;

        await api.paymentCalendar.saveCell({
          year: 2026,
          week_number: weekNumber,
          week_start: week?.start || weekStart,
          week_end: week?.end || weekEnd,
          category: row.category,
          subcategory: `${row.name} (заказ ${orderLabel})`,
          plan: Math.round(row.total),
          fact: 0,
          note: `Авто из планирования расходов. Заказ: ${orderLabel}. Кол-во: ${order?.total_quantity ?? order?.quantity ?? 0} шт.`,
        });
      }

      const toast = document.createElement('div');
      toast.style.cssText = `
        position:fixed;bottom:32px;right:32px;
        z-index:9999;padding:14px 20px;
        background:#16a34a;color:#fff;
        border-radius:8px;font-size:14px;
        font-weight:600;
        box-shadow:0 4px 16px rgba(0,0,0,0.4);
        min-width:260px;
      `;
      toast.innerHTML = `
        ✅ Отправлено в платёжный календарь<br>
        <span style="font-size:11px;opacity:0.8">
          Неделя ${weekNumber} · ${expenseRows.filter((r) => (r.total || 0) > 0).length} статей
        </span>
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) document.body.removeChild(toast);
      }, 4000);
    } catch (err) {
      alert(`Ошибка: ${err?.message || 'не удалось отправить'}`);
    } finally {
      setSending(false);
    }
  };

  const totalSum = expenseRows.reduce((a, r) => a + (Number(r.total) || 0), 0);

  const defaultCategory =
    stage === 'procurement' ? 'supplier_other' : `dept_${stage}`;

  return (
    <div className="card-neon rounded-card overflow-hidden">
      <div style={{ padding: 16, color: '#e2e8f0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h3 style={{ color: '#a3e635', margin: 0, fontSize: 16 }}>
            💰 Планирование расходов — {stageLabel}
          </h3>
          <button
            type="button"
            onClick={handleSendToCalendar}
            disabled={sending || expenseRows.length === 0}
            style={{
              background: expenseRows.length > 0 ? '#16a34a' : '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              cursor: expenseRows.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {sending ? '⏳ Отправка...' : '📅 Отправить в календарь'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 11,
                color: '#64748b',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Заказ
            </label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              style={{ ...INPUT, padding: '8px 12px' }}
            >
              <option value="">— Выберите заказ —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.tz_code || o.order_number || o.number || o.id}
                  {' · '}
                  {o.model_name || o.product_name || o.name || o.title || ''}
                  {o.total_quantity || o.quantity
                    ? ` (${o.total_quantity ?? o.quantity} шт)`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                color: '#64748b',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Неделя
            </label>
            <select
              value={weekNumber}
              onChange={(e) => {
                const w = parseInt(e.target.value, 10);
                setWeekNumber(w);
                const found = WEEKS.find((x) => x.number === w);
                if (found) {
                  setWeekStart(found.start);
                  setWeekEnd(found.end);
                }
              }}
              style={{ ...INPUT, padding: '8px 12px' }}
            >
              {WEEKS.map((w) => (
                <option key={w.number} value={w.number}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {order && (
          <div
            style={{
              background: '#0f1a2e',
              border: '1px solid #1e3a5f',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 24,
            }}
          >
            <span>
              📦 Кол-во:{' '}
              <b>{order.total_quantity ?? order.quantity ?? '—'} шт</b>
            </span>
            {stage === 'procurement' && (
              <>
                <span>
                  🧵 Тканей: <b>{fabricCount}</b>
                </span>
                <span>
                  🔩 Фурнитуры: <b>{fittingsCount}</b>
                </span>
              </>
            )}
          </div>
        )}

        {expenseRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  marginBottom: 16,
                  minWidth: 640,
                }}
              >
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    <th style={TH}>Статья расхода</th>
                    <th style={{ ...TH, textAlign: 'center', width: 80 }}>Кол-во</th>
                    <th style={{ ...TH, textAlign: 'center', width: 60 }}>Ед.</th>
                    <th style={{ ...TH, textAlign: 'right', width: 100 }}>Цена (сом)</th>
                    <th style={{ ...TH, textAlign: 'right', width: 120 }}>Сумма (сом)</th>
                    <th style={{ ...TH, width: 40 }}>🗑</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{
                        background: idx % 2 === 0 ? '#090f18' : '#0a1020',
                      }}
                    >
                      <td style={TD}>
                        <input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          style={INPUT}
                        />
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={row.qty === '' || row.qty == null ? '' : row.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const q = parseFloat(e.target.value) || 0;
                            updateRow(row.id, {
                              qty: e.target.value,
                              total: q * (row.price || 0),
                            });
                          }}
                          style={{ ...INPUT, width: 70, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ ...TD, textAlign: 'center', color: '#64748b' }}>
                        {row.unit}
                      </td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          value={row.price === '' || row.price == null ? '' : row.price}
                          placeholder="0"
                          onChange={(e) => {
                            const price = parseFloat(e.target.value) || 0;
                            updateRow(row.id, {
                              price,
                              total: (parseFloat(row.qty) || 0) * price,
                            });
                          }}
                          style={{ ...INPUT, width: 90, textAlign: 'right' }}
                        />
                      </td>
                      <td
                        style={{
                          ...TD,
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#fbbf24',
                        }}
                      >
                        {Math.round(row.total || 0).toLocaleString('ru-RU')}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpenseRows((prev) => prev.filter((r) => r.id !== row.id))
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: 16,
                          }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                background: '#1e3a5f',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>ИТОГО РАСХОДОВ:</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fbbf24' }}>
                {Math.round(totalSum).toLocaleString('ru-RU')} сом
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setExpenseRows((prev) => [
                  ...prev,
                  {
                    id: newRowId(),
                    category: defaultCategory,
                    name: '',
                    qty: order?.total_quantity ?? order?.quantity ?? 0,
                    unit: 'шт',
                    price: 0,
                    total: 0,
                    editable: true,
                  },
                ])
              }
              style={{
                marginTop: 10,
                background: 'none',
                color: '#64748b',
                border: '1px dashed #374151',
                borderRadius: 6,
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              + Добавить строку
            </button>
          </>
        ) : orderId ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#374151',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <div>Нет данных для расчёта</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#4a5568' }}>
              Заполните спецификацию в заказе
            </div>
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#374151',
            }}
          >
            Выберите заказ для расчёта расходов
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExpensePlan({ stage = 'procurement' }) {
  if (ORDERS_TABLE_STAGES.has(stage)) {
    return <ExpensePlanOrders stage={stage} />;
  }
  return <ExpensePlanProcurement stage={stage} />;
}
