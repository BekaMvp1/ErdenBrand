/**
 * Dashboard Summary — верхний информационный блок со сводкой по заказам
 * Карточки: Всего, Активные, Выполненные, % выполнения
 */

import { useNavigate } from 'react-router-dom';
import useIsMobile from '../hooks/useIsMobile';

const CARD_CONFIG = [
  {
    key: 'totalOrders',
    label: 'Всего',
    icon: '📋',
    background: '#0d2137',
    border: 'rgba(74, 158, 255, 0.25)',
    path: '/orders',
  },
  {
    key: 'activeOrders',
    label: 'Активные',
    icon: '⚡',
    background: '#0d1a2e',
    border: 'rgba(245, 158, 11, 0.25)',
    path: '/board',
  },
  {
    key: 'completedOrders',
    label: 'Выполненные',
    icon: '✅',
    background: '#0d2620',
    border: 'rgba(29, 158, 117, 0.25)',
    path: '/board?filter=done',
  },
  {
    key: 'completionPercent',
    label: '% выполнения',
    icon: '📊',
    suffix: '%',
    background: '#1a1a2e',
    border: 'rgba(200, 255, 0, 0.2)',
    path: '/production-dashboard',
  },
];

export default function DashboardSummary({ data, loading }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    gap: isMobile ? 8 : 16,
    marginBottom: isMobile ? 16 : 24,
    position: 'relative',
    zIndex: 1,
  };

  if (loading) {
    return (
      <div style={gridStyle}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse h-20 bg-white/5 border border-white/10"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={gridStyle}>
      {CARD_CONFIG.map(({ key, label, icon, suffix = '', background, border, path }) => (
        <button
          key={key}
          type="button"
          onClick={() => navigate(path)}
          className="rounded-xl p-4 text-left transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff00]/50"
          style={{
            background,
            border: `1px solid ${border}`,
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl opacity-90">{icon}</span>
            <span className="text-sm font-medium text-white/90">{label}</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {data[key] ?? 0}
            {suffix}
          </div>
        </button>
      ))}
    </div>
  );
}
