/**
 * Dashboard Summary — верхний информационный блок со сводкой по заказам
 * Карточки: Всего, Активные, Выполненные, % выполнения
 */

const CARD_CONFIG = [
  {
    key: 'totalOrders',
    label: 'Всего',
    icon: '📋',
    color: 'from-[#84934A] to-[#656D3F] dark:from-dark-2 dark:to-dark-3 shadow-md',
  },
  {
    key: 'activeOrders',
    label: 'Активные',
    icon: '⚡',
    color: 'from-[#656D3F] to-[#492828] dark:from-dark-2 dark:to-dark-1 shadow-md',
  },
  {
    key: 'completedOrders',
    label: 'Выполненные',
    icon: '✅',
    color: 'from-[#492828] to-[#84934A] dark:from-dark-3 dark:to-dark-2 shadow-md',
  },
  {
    key: 'completionPercent',
    label: '% выполнения',
    icon: '📊',
    suffix: '%',
    color: 'from-[#84934A] to-[#492828] dark:from-dark-2 dark:to-dark-3 shadow-md',
  },
];

export default function DashboardSummary({ data, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 md:mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-accent-1/30 dark:bg-dark-800 p-4 animate-pulse h-20"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {CARD_CONFIG.map(({ key, label, icon, suffix = '', color }, i) => (
        <div
          key={key}
          className={`rounded-xl bg-gradient-to-br ${color} p-4 shadow-lg shadow-black/5 dark:shadow-black/20 animate-slide-up animate-stagger transition-block hover:scale-[1.015] hover:shadow-xl`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl opacity-90">{icon}</span>
            <span className="text-sm font-medium text-white/90">{label}</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {data[key] ?? 0}
            {suffix}
          </div>
        </div>
      ))}
    </div>
  );
}
