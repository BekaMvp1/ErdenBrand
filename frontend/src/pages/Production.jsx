import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CostCalculation from './CostCalculation';
import ProductionWriteOff from './ProductionWriteOff';

const TABS = [
  { key: 'writeoff', label: '📋 Списание' },
  { key: 'cost', label: '💰 Себестоимость' },
];

export default function Production() {
  const location = useLocation();
  const navigate = useNavigate();
  const isCostPath = location.pathname.endsWith('/production/cost');
  const [tab, setTab] = useState(() => (isCostPath ? 'cost' : 'writeoff'));

  useEffect(() => {
    setTab(isCostPath ? 'cost' : 'writeoff');
  }, [isCostPath]);

  const selectTab = useCallback(
    (key) => {
      setTab(key);
      if (key === 'cost') navigate('/production/cost');
      else navigate('/production');
    },
    [navigate]
  );

  return (
    <div style={{ color: '#e2e8f0' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '16px 20px 0',
          borderBottom: '1px solid #1e3a5f',
          marginBottom: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              background: tab === t.key ? '#1e3a5f' : 'transparent',
              color: tab === t.key ? '#a3e635' : '#64748b',
              borderBottom: tab === t.key ? '2px solid #a3e635' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>{tab === 'writeoff' ? <ProductionWriteOff /> : <CostCalculation />}</div>
    </div>
  );
}
