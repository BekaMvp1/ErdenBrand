import { useState, useEffect } from 'react';
import { api } from '../api';

const TD = {
  padding: '8px 12px',
  verticalAlign: 'middle',
  border: '1px solid #111',
};

export default function StockTab() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadStock = async () => {
    setLoading(true);
    try {
      const rows = await api.get('/api/stock');
      setStock(Array.isArray(rows) ? rows : []);
    } catch {
      setStock([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const onShelf = stock.filter((i) => parseInt(i.quantity, 10) > 0);

  const filtered = onShelf.filter(
    (item) =>
      !search ||
      (item.order_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.order_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.client || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = onShelf.length;
  const totalQty = onShelf.reduce((s, i) => s + parseInt(i.quantity || 0, 10), 0);

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Позиций на складе', value: totalItems, color: '#93c5fd', icon: '📦' },
          { label: 'Всего единиц', value: `${totalQty} шт`, color: '#4ade80', icon: '🏭' },
          {
            label: 'Готово к отгрузке',
            value: onShelf.filter((i) => i.status === 'ready').length,
            color: '#a3e635',
            icon: '✅',
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
            <div
              style={{
                color: s.color,
                fontWeight: 700,
                fontSize: 22,
                marginTop: 4,
              }}
            >
              {s.value}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Поиск по заказу, названию, клиенту..."
        style={{
          width: '100%',
          background: '#1e2a3a',
          color: '#e2e8f0',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          boxSizing: 'border-box',
          marginBottom: 16,
        }}
      />

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>⏳ Загрузка...</div>
      ) : filtered.length === 0 ? (
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
          <div style={{ fontSize: 40 }}>🏭</div>
          <div style={{ marginTop: 8 }}>Склад пуст</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#475569' }}>
            Товар появится когда ОТК закроет заказ
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: '#1a237e' }}>
                {['Фото', 'Заказ', 'Название', 'Клиент', 'Цвет', 'Размер', 'Кол-во', 'Статус', 'Источник'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'left',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        border: '1px solid #1e3a5f',
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const created = item.created_at || item.createdAt;
                return (
                  <tr
                    key={item.id}
                    style={{
                      background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                      borderBottom: '1px solid #111',
                    }}
                  >
                    <td style={TD}>
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: 'cover',
                            borderRadius: 6,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            background: '#1e2a3a',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                          }}
                        >
                          👗
                        </div>
                      )}
                    </td>
                    <td style={{ ...TD, color: '#a3e635', fontWeight: 700 }}>{item.order_number}</td>
                    <td style={{ ...TD, color: '#cbd5e1', maxWidth: 180 }}>{item.order_name}</td>
                    <td
                      style={{
                        ...TD,
                        color: item.client === 'WB' ? '#3b82f6' : '#94a3b8',
                        fontWeight: item.client === 'WB' ? 700 : 400,
                      }}
                    >
                      {item.client || '—'}
                    </td>
                    <td style={{ ...TD, color: '#e2e8f0' }}>{item.color || '—'}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontWeight: 600,
                      }}
                    >
                      {item.size || '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 15,
                        color: parseInt(item.quantity || 0, 10) > 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {item.quantity} шт
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          background:
                            item.status === 'ready'
                              ? '#0a2a0a'
                              : item.status === 'partial'
                                ? '#2a1a00'
                                : '#1e2a3a',
                          color:
                            item.status === 'ready'
                              ? '#4ade80'
                              : item.status === 'partial'
                                ? '#fbbf24'
                                : '#94a3b8',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {item.status === 'ready'
                          ? '✅ Готов'
                          : item.status === 'partial'
                            ? '⚡ Частично'
                            : '📦 На складе'}
                      </span>
                    </td>
                    <td style={{ ...TD, color: '#64748b', fontSize: 11 }}>
                      {item.source === 'otk'
                        ? '🔍 ОТК'
                        : item.source === 'reception'
                          ? '📥 Приёмка'
                          : '—'}
                      <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>
                        {created ? new Date(created).toLocaleDateString('ru-RU') : ''}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
