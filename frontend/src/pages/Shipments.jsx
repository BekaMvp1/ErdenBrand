/**
 * Отгрузка: документы отгрузки, приёмка, дашборд
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ReceptionTab from '../components/ReceptionTab';
import ShipmentDashboard from '../components/ShipmentDashboard';
import ShipmentForm from '../components/ShipmentForm';
import StockTab from '../components/StockTab';

export default function Shipments() {
  const [activeTab, setActiveTab] = useState('shipment');
  const [receptions, setReceptions] = useState([]);
  const [orders, setOrders] = useState([]);

  const loadReceptions = useCallback(() => {
    api
      .get('/api/receptions')
      .then((rows) => setReceptions(Array.isArray(rows) ? rows : []))
      .catch(() => setReceptions([]));
  }, []);

  const loadOrders = useCallback(() => {
    api.orders
      .list({ limit: 200 })
      .then((r) => {
        const list = r?.orders || r?.rows || r || [];
        setOrders(Array.isArray(list) ? list : []);
      })
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    loadReceptions();
    loadOrders();
  }, [loadReceptions, loadOrders]);

  return (
    <div>
      <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text mb-4 md:mb-6">
        Отгрузка
      </h1>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          borderBottom: '1px solid #1e3a5f',
          paddingBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        {[
          { key: 'shipment', label: '📦 Отгрузка товаров' },
          { key: 'reception', label: '🔄 Приёмка товаров' },
          { key: 'stock', label: '🏭 Остаток товаров' },
          { key: 'dashboard', label: '📊 Дашборд' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key ? '#a3e635' : '#0f172a',
              color: activeTab === tab.key ? '#000' : '#94a3b8',
              border: '1px solid',
              borderColor: activeTab === tab.key ? '#a3e635' : '#1e3a5f',
              borderRadius: 8,
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'shipment' ? <ShipmentForm /> : null}

      {activeTab === 'reception' ? (
        <ReceptionTab
          onSaved={() => {
            loadReceptions();
          }}
        />
      ) : null}

      {activeTab === 'stock' ? <StockTab /> : null}

      {activeTab === 'dashboard' ? (
        <ShipmentDashboard orders={orders} receptions={receptions} />
      ) : null}
    </div>
  );
}
