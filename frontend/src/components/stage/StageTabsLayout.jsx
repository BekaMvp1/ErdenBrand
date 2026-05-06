import { NavLink, Outlet } from 'react-router-dom';

const TAB_ITEMS = [
  { key: 'plan', label: 'План', to: 'plan' },
  { key: 'report', label: 'Внесение отчета', to: 'report' },
  { key: 'expenses', label: 'Планирование расходов', to: 'expenses' },
];

export default function StageTabsLayout({ title }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-neon-text">{title}</h1>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {TAB_ITEMS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-neon-surface2 text-neon-text hover:bg-white/10'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
