import { useState, useEffect } from 'react';
import { api } from '../api';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const LABEL = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 6,
  marginTop: 12,
  fontWeight: 600,
};

const INPUT = {
  width: '100%',
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

const TH = {
  padding: '8px 10px',
  textAlign: 'center',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  borderBottom: '1px solid #2d3a8a',
  whiteSpace: 'nowrap',
  border: '1px solid #1e3a5f',
};

const TD = {
  padding: '8px 10px',
  verticalAlign: 'middle',
  border: '1px solid #1e2a3a',
};

const emptyForm = () => ({
  order_id: '',
  order_number: '',
  order_name: '',
  client: '',
  shipment_type: 'goods',
  defect_type: '',
  defect_reason: '',
  defect_destination: '',
  shipment_date: new Date().toISOString().split('T')[0],
  destination: '',
  carrier: '',
  tracking: '',
  note: '',
  rows: [],
});

function parseFabricData(order) {
  if (Array.isArray(order.fabric_data)) return order.fabric_data;
  if (typeof order.fabric_data === 'string') {
    try {
      const parsed = JSON.parse(order.fabric_data || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function colorDot(color) {
  const c = String(color || '').toLowerCase();
  if (c.includes('черн')) return '#1a1a1a';
  if (c.includes('бел')) return '#f0f0f0';
  if (c.includes('красн')) return '#ef4444';
  if (c.includes('синий') || c.includes('син')) return '#3b82f6';
  return '#94a3b8';
}

const READY_STATUSES = new Set([
  'completed',
  'done',
  'otk_done',
  'ready',
  'active',
]);

function isReadyForShipment(order) {
  const status = String(order?.status || '').toLowerCase();
  return READY_STATUSES.has(status);
}

function orderListFromResponse(r) {
  const list = r?.orders || r?.rows || r || [];
  return Array.isArray(list) ? list : [];
}

function parseRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function ShipmentForm() {
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [orderStats, setOrderStats] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewShipment, setViewShipment] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const typeColor = form.shipment_type === 'defect' ? '#f87171' : '#a3e635';
  const typeBg = form.shipment_type === 'defect' ? '#1a0505' : '#0a2a0a';

  const loadShipments = () => {
    api
      .get('/api/shipments')
      .then((rows) => setShipments(Array.isArray(rows) ? rows : []))
      .catch(() => setShipments([]));
  };

  useEffect(() => {
    api.orders
      .list({ limit: 200 })
      .then((r) => {
        const all = orderListFromResponse(r);
        setAllOrders(all);
        setOrders(all.filter(isReadyForShipment));
      })
      .catch(() => {
        setAllOrders([]);
        setOrders([]);
      });
    loadShipments();
  }, []);

  const handleSelectOrder = async (orderId) => {
    const order = (showAllOrders ? allOrders : orders).find(
      (o) => String(o.id) === String(orderId)
    );
    if (!order) return;

    setSelectedOrder(order);
    setOrderStats(null);

    try {
      const [stockRes, shipRes, recRes] = await Promise.all([
        api.get(`/api/stock?${new URLSearchParams({ order_id: String(orderId) }).toString()}`),
        api.get(`/api/shipments?${new URLSearchParams({ order_id: String(orderId) }).toString()}`),
        api.get(`/api/receptions?${new URLSearchParams({ order_id: String(orderId) }).toString()}`),
      ]);

      const stockItems = toArray(stockRes).filter((s) => parseInt(s.quantity || 0, 10) > 0);
      const alreadyShipped = toArray(shipRes).reduce(
        (s, sh) => s + parseInt(sh.total_quantity || 0, 10),
        0,
      );
      const totalDefects = toArray(recRes).reduce(
        (s, r) => s + parseInt(r.defect_count || 0, 10),
        0,
      );

      const totalQty = parseInt(order.quantity || 0, 10);
      const remaining = Math.max(0, totalQty - alreadyShipped - totalDefects);

      setOrderStats({
        totalQty,
        alreadyShipped,
        totalDefects,
        remaining,
      });

      let rows = [];

      if (stockItems.length > 0) {
        const colorMap = {};
        stockItems.forEach((si) => {
          const color = si.color || 'Основной';
          if (!colorMap[color]) colorMap[color] = {};
          const size = si.size || 'Без размера';
          colorMap[color][size] = parseInt(si.quantity || 0, 10);
        });

        const allSizes = new Set();
        Object.values(colorMap).forEach((sizes) => {
          Object.keys(sizes).forEach((s) => allSizes.add(s));
        });

        const sizeOrder = [
          'XS',
          'S',
          'M',
          'L',
          'XL',
          'XXL',
          '38',
          '40',
          '42',
          '44',
          '46',
          '48',
          '50',
          '52',
          'Без размера',
        ];
        const sortedSizes = sizeOrder
          .filter((s) => allSizes.has(s))
          .concat([...allSizes].filter((s) => !sizeOrder.includes(s)));

        rows = Object.entries(colorMap).map(([color, sizeQtys]) => ({
          color,
          sizes: sortedSizes.map((size) => ({
            size,
            available: sizeQtys[size] || 0,
            quantity: '',
          })),
        }));
      } else {
        const fabricData = parseFabricData(order);
        const colors = [];
        fabricData.forEach((f) => {
          if (f.color && !colors.includes(f.color)) colors.push(f.color);
        });
        if (colors.length === 0) colors.push('Основной');

        const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
        const qtyPerColor = colors.length > 0 ? Math.floor(remaining / colors.length) : remaining;

        rows = colors.map((color) => ({
          color,
          sizes: sizes.map((size) => ({
            size,
            available: qtyPerColor,
            quantity: '',
          })),
        }));
      }

      setForm((f) => ({
        ...f,
        order_id: order.id,
        order_number: order.number || order.tz_code || '',
        order_name: order.product_name || order.name || '',
        client: order.client_name || order.client?.name || '',
        rows,
      }));
    } catch (err) {
      console.error('[handleSelectOrder]:', err);

      const colors = ['Основной'];
      const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      const rows = colors.map((color) => ({
        color,
        sizes: sizes.map((size) => ({
          size,
          available: 0,
          quantity: '',
        })),
      }));

      setForm((f) => ({
        ...f,
        order_id: order.id,
        order_number: order.number || order.tz_code || '',
        order_name: order.product_name || order.name || '',
        client: order.client_name || '',
        rows,
      }));
    }
  };

  const totalQty = form.rows.reduce(
    (sum, row) =>
      sum + row.sizes.reduce((s, sz) => s + parseInt(sz.quantity || 0, 10), 0),
    0
  );

  const handleSave = async () => {
    if (!form.order_id) {
      alert('⚠️ Выберите заказ');
      return;
    }
    if (totalQty === 0) {
      alert('⚠️ Укажите количество');
      return;
    }
    if (orderStats && totalQty > orderStats.remaining) {
      alert(
        `⚠️ Нельзя отгрузить больше остатка (${orderStats.remaining} шт). Учтены прошлые отгрузки и браки.`
      );
      return;
    }
    try {
      const item = await api.post('/api/shipments', {
        ...form,
        order_id: parseInt(form.order_id, 10),
        total_quantity: totalQty,
      });
      setShipments((prev) => [item, ...prev]);
      setShowForm(false);
      setSelectedOrder(null);
      setOrderStats(null);
      setForm(emptyForm());
      loadShipments();
      alert('✅ Отгрузка сохранена!');
    } catch (err) {
      alert(`❌ Ошибка: ${err.message}`);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Отгрузок', value: shipments.length, color: '#93c5fd', icon: '📦' },
          {
            label: 'Всего отгружено',
            value: `${shipments.reduce((s, sh) => s + parseInt(sh.total_quantity || 0, 10), 0)} шт`,
            color: '#4ade80',
            icon: '✅',
          },
          {
            label: 'Сегодня',
            value: shipments.filter((sh) => sh.shipment_date === today).length,
            color: '#fbbf24',
            icon: '🚚',
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: '#0a1628',
              border: `1px solid ${s.color}44`,
              borderRadius: 10,
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            background: '#a3e635',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          🚚 Создать отгрузку
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shipments.length === 0 ? (
          <div
            style={{
              background: '#0a1628',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: 40 }}>📦</div>
            <div style={{ marginTop: 8 }}>Отгрузок пока нет</div>
          </div>
        ) : (
          shipments.map((sh) => (
            <div
              key={sh.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewShipment(sh)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setViewShipment(sh);
                }
              }}
              style={{
                background: '#0a1628',
                border: '1px solid #1e3a5f',
                borderRadius: 12,
                padding: '16px 20px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#a3e635', fontWeight: 700, fontSize: 15 }}>
                    🚚 {sh.order_number}
                    <span
                      style={{
                        background: sh.shipment_type === 'defect' ? '#1a0505' : '#0a2a0a',
                        color: sh.shipment_type === 'defect' ? '#f87171' : '#4ade80',
                        border: '1px solid',
                        borderColor: sh.shipment_type === 'defect' ? '#f87171' : '#16a34a',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        marginLeft: 8,
                      }}
                    >
                      {sh.shipment_type === 'defect' ? '❌ Брак' : '📦 Товар'}
                    </span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>{sh.order_name}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#64748b', fontSize: 11 }}>
                      📅{' '}
                      {sh.shipment_date
                        ? new Date(sh.shipment_date).toLocaleDateString('ru-RU')
                        : '—'}
                    </span>
                    {sh.client ? (
                      <span
                        style={{
                          color: sh.client === 'WB' ? '#3b82f6' : '#94a3b8',
                          fontSize: 11,
                          fontWeight: sh.client === 'WB' ? 700 : 400,
                        }}
                      >
                        👤 {sh.client}
                      </span>
                    ) : null}
                    {sh.destination ? (
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>📍 {sh.destination}</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 20 }}>
                    {sh.total_quantity} шт
                  </div>
                  <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>👁 нажмите для просмотра</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm ? (
        <>
          <div
            role="presentation"
            onClick={() => {
              setShowForm(false);
              setSelectedOrder(null);
              setOrderStats(null);
            }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: `1px solid ${typeColor}`,
              borderRadius: 14,
              padding: '24px',
              width: 750,
              maxWidth: '95vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div style={{ color: typeColor, fontSize: 18, fontWeight: 700 }}>🚚 Создать отгрузку</div>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedOrder(null);
                  setOrderStats(null);
                }}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 22,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    shipment_type: 'goods',
                  }))
                }
                style={{
                  background: form.shipment_type === 'goods' ? '#0a2a0a' : '#1e2a3a',
                  color: form.shipment_type === 'goods' ? '#4ade80' : '#64748b',
                  border: '2px solid',
                  borderColor: form.shipment_type === 'goods' ? '#16a34a' : '#374151',
                  borderRadius: 10,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
                Отправка товара
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    marginTop: 4,
                    color: form.shipment_type === 'goods' ? '#4ade80' : '#475569',
                  }}
                >
                  Готовая продукция
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    shipment_type: 'defect',
                  }))
                }
                style={{
                  background: form.shipment_type === 'defect' ? '#1a0505' : '#1e2a3a',
                  color: form.shipment_type === 'defect' ? '#f87171' : '#64748b',
                  border: '2px solid',
                  borderColor: form.shipment_type === 'defect' ? '#f87171' : '#374151',
                  borderRadius: 10,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  textAlign: 'center',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>❌</div>
                Отправка брака
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    marginTop: 4,
                    color: form.shipment_type === 'defect' ? '#f87171' : '#475569',
                  }}
                >
                  Возврат / брак
                </div>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setShowAllOrders((s) => !s)}
                style={{
                  background: 'none',
                  color: showAllOrders ? '#a3e635' : '#64748b',
                  border: '1px solid',
                  borderColor: showAllOrders ? '#a3e635' : '#374151',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {showAllOrders ? '✅ Все заказы' : '🔍 Только активные'}
              </button>
            </div>

            <label style={LABEL}>📦 Заказ (ТЗ)</label>
            <select
              value={form.order_id}
              onChange={(e) => handleSelectOrder(e.target.value)}
              style={INPUT}
            >
              <option value="">— Выберите заказ —</option>
              {(showAllOrders ? allOrders : orders).map((o) => {
                const st = String(o.status || '').toLowerCase();
                const readyMark =
                  st === 'completed' || st === 'done' || st === 'otk_done' ? ' ✅' : '';
                return (
                  <option key={o.id} value={o.id}>
                    {o.number || o.tz_code} — {o.product_name || o.model_name || o.title || o.name}
                    {o.client_name ? ` (${o.client_name})` : ''}
                    {readyMark}
                  </option>
                );
              })}
            </select>

            {selectedOrder ? (
              <div
                style={{
                  background: '#0a1628',
                  border: '1px solid #1e3a5f',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 12,
                  display: 'flex',
                  gap: 16,
                  fontSize: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#64748b' }}>
                  Клиент:{' '}
                  <b style={{ color: '#e2e8f0' }}>{selectedOrder.client_name || '—'}</b>
                </span>
                <span style={{ color: '#64748b' }}>
                  Кол-во:{' '}
                  <b style={{ color: '#a3e635' }}>
                    {selectedOrder.quantity || selectedOrder.total_quantity || '—'} шт
                  </b>
                </span>
                <span style={{ color: '#64748b' }}>
                  Дедлайн:{' '}
                  <b style={{ color: '#fbbf24' }}>
                    {selectedOrder.deadline
                      ? new Date(selectedOrder.deadline).toLocaleDateString('ru-RU')
                      : '—'}
                  </b>
                </span>
              </div>
            ) : null}

            {orderStats ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {[
                  { label: 'Заказано', value: orderStats.totalQty, color: '#93c5fd', icon: '📦' },
                  {
                    label: 'Уже отгружено',
                    value: orderStats.alreadyShipped,
                    color: '#fbbf24',
                    icon: '🚚',
                  },
                  { label: 'Браки', value: orderStats.totalDefects, color: '#f87171', icon: '❌' },
                  {
                    label: 'Остаток',
                    value: orderStats.remaining,
                    color: orderStats.remaining > 0 ? '#4ade80' : '#64748b',
                    icon: '✅',
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: '#0a1628',
                      border: `1px solid ${s.color}44`,
                      borderRadius: 8,
                      padding: '10px 12px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18 }}>{s.icon}</div>
                    <div
                      style={{
                        color: s.color,
                        fontWeight: 700,
                        fontSize: 18,
                        marginTop: 2,
                      }}
                    >
                      {s.value}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {orderStats?.remaining === 0 ? (
              <div
                style={{
                  background: '#0a2a0a',
                  border: '1px solid #16a34a',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#4ade80',
                  fontSize: 13,
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                ✅ Этот заказ полностью отгружен
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>📅 Дата отгрузки</label>
                <input
                  type="date"
                  value={form.shipment_date}
                  onChange={(e) => setForm((f) => ({ ...f, shipment_date: e.target.value }))}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>📍 Направление / Склад</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  placeholder="Москва / WB склад..."
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>🚛 Перевозчик / ТК</label>
                <input
                  type="text"
                  value={form.carrier}
                  onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
                  placeholder="СДЭК / Деловые линии..."
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>🔢 Трек-номер</label>
                <input
                  type="text"
                  value={form.tracking}
                  onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
                  placeholder="123456789..."
                  style={INPUT}
                />
              </div>
            </div>

            {form.shipment_type === 'defect' ? (
              <>
                <label style={LABEL}>❌ Тип брака</label>
                <select
                  value={form.defect_type || ''}
                  onChange={(e) => setForm((f) => ({ ...f, defect_type: e.target.value }))}
                  style={INPUT}
                >
                  <option value="">— Выберите тип —</option>
                  {[
                    'Брак пошива',
                    'Брак ткани',
                    'Брак фурнитуры',
                    'Несоответствие размера',
                    'Загрязнение',
                    'Механическое повреждение',
                    'Прочее',
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label style={LABEL}>📝 Причина возврата</label>
                <textarea
                  value={form.defect_reason || ''}
                  onChange={(e) => setForm((f) => ({ ...f, defect_reason: e.target.value }))}
                  placeholder="Опишите причину возврата брака..."
                  rows={2}
                  style={{
                    ...INPUT,
                    border: '1px solid #f8717166',
                    color: '#f87171',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                />

                <label style={LABEL}>📍 Куда отправляем брак</label>
                <input
                  type="text"
                  value={form.defect_destination || ''}
                  onChange={(e) => setForm((f) => ({ ...f, defect_destination: e.target.value }))}
                  placeholder="Поставщик / на переделку / утиль..."
                  style={{
                    ...INPUT,
                    border: '1px solid #f8717166',
                  }}
                />
              </>
            ) : null}

            {form.rows.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    color: '#a3e635',
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 10,
                  }}
                >
                  📊 Количество по цвету и размеру
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 8,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: 12 }}>Быстрое заполнение:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        rows: f.rows.map((row) => ({
                          ...row,
                          sizes: row.sizes.map((sz) => ({
                            ...sz,
                            quantity: sz.available > 0 ? String(sz.available) : '',
                          })),
                        })),
                      }));
                    }}
                    style={{
                      background: '#1e3a5f',
                      color: '#93c5fd',
                      border: '1px solid #1e3a5f',
                      borderRadius: 6,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    📦 Заполнить всё доступное
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        rows: f.rows.map((row) => ({
                          ...row,
                          sizes: row.sizes.map((sz) => ({
                            ...sz,
                            quantity: '',
                          })),
                        })),
                      }));
                    }}
                    style={{
                      background: '#1e2a3a',
                      color: '#64748b',
                      border: '1px solid #374151',
                      borderRadius: 6,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    ✕ Очистить
                  </button>
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #1e3a5f', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1a237e' }}>
                        <th style={TH}>Цвет</th>
                        {form.rows[0]?.sizes.map((sz) => (
                          <th key={sz.size} style={TH}>
                            {sz.size}
                          </th>
                        ))}
                        <th style={{ ...TH, background: '#0a2a0a', color: '#4ade80' }}>Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((row, ri) => {
                        const rowTotal = row.sizes.reduce(
                          (s, sz) => s + parseInt(sz.quantity || 0, 10),
                          0
                        );
                        return (
                          <tr
                            key={row.color}
                            style={{ background: ri % 2 === 0 ? '#0a1628' : '#0f172a' }}
                          >
                            <td
                              style={{
                                ...TD,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    background: colorDot(row.color),
                                    border: '1px solid #374151',
                                  }}
                                />
                                {row.color}
                              </div>
                            </td>
                            {row.sizes.map((sz, si) => (
                              <td key={sz.size} style={TD}>
                                {sz.available > 0 ? (
                                  <div
                                    style={{
                                      color: '#64748b',
                                      fontSize: 9,
                                      textAlign: 'center',
                                      marginBottom: 2,
                                    }}
                                  >
                                    доступно: {sz.available}
                                  </div>
                                ) : null}
                                <input
                                  type="number"
                                  value={sz.quantity}
                                  max={sz.available || undefined}
                                  onChange={(e) => {
                                    let val = parseInt(e.target.value || 0, 10);
                                    if (sz.available > 0 && val > sz.available) {
                                      val = sz.available;
                                    }
                                    const strVal = val > 0 ? String(val) : '';
                                    setForm((f) => ({
                                      ...f,
                                      rows: f.rows.map((r, i) =>
                                        i === ri
                                          ? {
                                              ...r,
                                              sizes: r.sizes.map((s, j) =>
                                                j === si ? { ...s, quantity: strVal } : s
                                              ),
                                            }
                                          : r
                                      ),
                                    }));
                                  }}
                                  min="0"
                                  placeholder="0"
                                  style={{
                                    width: 52,
                                    background:
                                      sz.quantity && parseInt(sz.quantity, 10) > 0
                                        ? '#0a2a0a'
                                        : sz.available === 0
                                          ? '#1a0505'
                                        : '#1e2a3a',
                                    color:
                                      sz.quantity && parseInt(sz.quantity, 10) > 0
                                        ? '#4ade80'
                                        : sz.available === 0
                                          ? '#374151'
                                        : '#64748b',
                                    border: '1px solid',
                                    borderColor:
                                      sz.quantity && parseInt(sz.quantity, 10) > 0
                                        ? '#16a34a'
                                        : '#374151',
                                    borderRadius: 6,
                                    padding: '5px 4px',
                                    fontSize: 13,
                                    textAlign: 'center',
                                    fontWeight: 700,
                                    cursor: sz.available === 0 ? 'not-allowed' : 'text',
                                  }}
                                  disabled={sz.available === 0}
                                />
                              </td>
                            ))}
                            <td
                              style={{
                                ...TD,
                                textAlign: 'center',
                                fontWeight: 700,
                                color: rowTotal > 0 ? '#4ade80' : '#374151',
                                background: '#050d0a',
                                fontSize: 14,
                              }}
                            >
                              {rowTotal || '—'}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#050d1a', borderTop: '2px solid #1e3a5f' }}>
                        <td style={{ ...TD, fontWeight: 700, color: '#64748b' }}>ИТОГО</td>
                        {(form.rows[0]?.sizes || []).map((sz, si) => {
                          const colTotal = form.rows.reduce(
                            (s, row) => s + parseInt(row.sizes[si]?.quantity || 0, 10),
                            0
                          );
                          return (
                            <td
                              key={sz.size || si}
                              style={{
                                ...TD,
                                textAlign: 'center',
                                fontWeight: 700,
                                color: colTotal > 0 ? '#93c5fd' : '#374151',
                              }}
                            >
                              {colTotal || '—'}
                            </td>
                          );
                        })}
                        <td
                          style={{
                            ...TD,
                            textAlign: 'center',
                            fontWeight: 700,
                            color: '#a3e635',
                            fontSize: 16,
                            background: '#0a2a0a',
                          }}
                        >
                          {totalQty}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {totalQty > 0 ? (
                  <div
                    style={{
                      background: typeBg,
                      border: `1px solid ${form.shipment_type === 'defect' ? '#f87171' : '#16a34a'}`,
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        color: form.shipment_type === 'defect' ? '#f87171' : '#4ade80',
                        fontWeight: 600,
                      }}
                    >
                      Итого к отгрузке:
                    </span>
                    <span
                      style={{
                        color: form.shipment_type === 'defect' ? '#f87171' : '#4ade80',
                        fontWeight: 700,
                        fontSize: 20,
                      }}
                    >
                      {totalQty} шт
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <label style={{ ...LABEL, marginTop: 16 }}>💬 Примечание</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Дополнительная информация..."
              rows={2}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={totalQty === 0}
                style={{
                  flex: 1,
                  background:
                    totalQty > 0
                      ? form.shipment_type === 'defect'
                        ? '#dc2626'
                        : '#16a34a'
                      : '#1e2a3a',
                  color: totalQty > 0 ? '#fff' : '#64748b',
                  border: 'none',
                  borderRadius: 8,
                  padding: '14px',
                  cursor: totalQty > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {form.shipment_type === 'defect' ? `❌ Оформить возврат брака` : `🚚 Оформить отгрузку`}
                {totalQty > 0 ? ` (${totalQty} шт)` : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedOrder(null);
                  setOrderStats(null);
                }}
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '14px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      ) : null}

      {viewShipment ? (
        <>
          <div
            role="presentation"
            onClick={() => setViewShipment(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              padding: '24px',
              width: 700,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ color: '#a3e635', fontSize: 16, fontWeight: 700 }}>
                  📦 Отгрузка #{viewShipment.id}
                </div>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                  {viewShipment.shipment_date
                    ? new Date(viewShipment.shipment_date).toLocaleDateString('ru-RU')
                    : '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewShipment(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 22,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {[
                { label: 'Заказ', value: viewShipment.order_number, color: '#a3e635' },
                { label: 'Клиент', value: viewShipment.client || '—', color: '#93c5fd' },
                { label: 'Направление', value: viewShipment.destination || '—', color: '#e2e8f0' },
                { label: 'Перевозчик', value: viewShipment.carrier || '—', color: '#e2e8f0' },
                { label: 'Трек-номер', value: viewShipment.tracking || '—', color: '#fbbf24' },
                {
                  label: 'Итого',
                  value: `${viewShipment.total_quantity} шт`,
                  color: '#4ade80',
                },
              ].map((f) => (
                <div
                  key={f.label}
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>{f.label}</span>
                  <span style={{ color: f.color, fontSize: 13, fontWeight: 600 }}>{f.value}</span>
                </div>
              ))}
            </div>

            {(() => {
              const rows = parseRows(viewShipment.rows);
              if (!rows.length) return null;
              return (
                <div
                  style={{
                    overflowX: 'auto',
                    border: '1px solid #1e3a5f',
                    borderRadius: 10,
                    marginBottom: 12,
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1a237e' }}>
                        <th style={TH}>Цвет</th>
                        {SIZES.map((s) => (
                          <th key={s} style={TH}>
                            {s}
                          </th>
                        ))}
                        <th style={{ ...TH, color: '#4ade80' }}>Итого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const total = row.sizes.reduce(
                          (s, sz) => s + parseInt(sz.quantity || 0, 10),
                          0
                        );
                        return (
                          <tr
                            key={row.color || i}
                            style={{ background: i % 2 === 0 ? '#0a1628' : '#0f172a' }}
                          >
                            <td style={{ ...TD, fontWeight: 700, color: '#e2e8f0' }}>{row.color}</td>
                            {row.sizes.map((sz, j) => (
                              <td
                                key={sz.size || j}
                                style={{
                                  ...TD,
                                  textAlign: 'center',
                                  color:
                                    parseInt(sz.quantity || 0, 10) > 0 ? '#4ade80' : '#374151',
                                  fontWeight: parseInt(sz.quantity || 0, 10) > 0 ? 700 : 400,
                                }}
                              >
                                {sz.quantity || '—'}
                              </td>
                            ))}
                            <td
                              style={{
                                ...TD,
                                textAlign: 'center',
                                fontWeight: 700,
                                color: '#4ade80',
                                fontSize: 14,
                              }}
                            >
                              {total}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {viewShipment.note ? (
              <div
                style={{
                  background: '#0a1628',
                  border: '1px solid #1e3a5f',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#94a3b8',
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                💬 {viewShipment.note}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setViewShipment(null)}
              style={{
                width: '100%',
                background: '#1e2a3a',
                color: '#94a3b8',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '12px',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Закрыть
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
