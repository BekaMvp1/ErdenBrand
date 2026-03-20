/**
 * Production Dashboard — панель контроля производства.
 * Главный экран для директора фабрики: KPI, загрузка, заказы, дедлайны.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const CARD_LINKS = {
  orders_in_progress: '/board',
  cut_today: '/cutting',
  sewn_today: '/sewing',
  qc_today: '/qc',
  warehouse_ready: '/warehouse',
  shipped_today: '/shipments',
};

const TASK_LINKS = { cutting: '/cutting', sewing: '/sewing', qc: '/qc' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function ProductionDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.dashboard
      .production()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Ошибка'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 md:py-6 text-white">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold mb-6">Production Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="mt-6 text-white/60">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 md:py-6 text-white">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold mb-4">Production Dashboard</h1>
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">{error}</div>
      </div>
    );
  }

  const stats = data?.production_stats || {};
  const daily = data?.daily_capacity || [];
  const orders = data?.orders_progress || [];
  const tasks = data?.today_tasks || {};
  const deadlines = data?.deadlines || [];

  const statCards = [
    { key: 'orders_in_progress', label: 'Заказы в работе', value: stats.orders_in_progress ?? 0 },
    { key: 'cut_today', label: 'Сегодня раскроено', value: stats.cut_today ?? 0 },
    { key: 'sewn_today', label: 'Сегодня сшито', value: stats.sewn_today ?? 0 },
    { key: 'qc_today', label: 'Сегодня проверено ОТК', value: stats.qc_today ?? 0 },
    { key: 'warehouse_ready', label: 'Готово на складе', value: stats.warehouse_ready ?? 0 },
    { key: 'shipped_today', label: 'Отгружено сегодня', value: stats.shipped_today ?? 0 },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 md:py-6 text-white bg-[#0f0f12] overflow-x-hidden">
      <div className="max-w-[1400px] mx-auto w-full min-w-0">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-4 md:mb-6 text-white">Production Dashboard</h1>

        {/* Block 1: Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
          {statCards.map(({ key, label, value }) => (
            <Link
              key={key}
              to={CARD_LINKS[key] || '#'}
              className="rounded-xl bg-[#1a1a1f] border border-white/10 p-4 hover:border-white/25 hover:bg-[#222] transition-colors"
            >
              <div className="text-xs uppercase tracking-wide text-white/50 mb-1">{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Block 2: Daily capacity chart */}
          <div className="xl:col-span-2 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Загрузка производства</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/60">
                    <th className="py-2 pr-4">День</th>
                    <th className="py-2 pr-4 text-right">План</th>
                    <th className="py-2 pr-4 text-right">Мощность</th>
                    <th className="py-2 text-right">Перегруз</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.slice(-14).map((row) => (
                    <tr key={row.date} className="border-b border-white/5">
                      <td className="py-2 pr-4">{formatDate(row.date)}</td>
                      <td className="py-2 pr-4 text-right">{row.plan}</td>
                      <td className="py-2 pr-4 text-right">{row.capacity}</td>
                      <td className={`py-2 text-right ${row.overload > 0 ? 'text-red-400' : 'text-white/50'}`}>
                        {row.overload > 0 ? `+${row.overload}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Block 4: Today tasks */}
          <div className="rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Задачи сегодня</h2>
            <div className="space-y-3">
              {[
                { key: 'cutting', label: 'Раскрой', count: tasks.cutting ?? 0 },
                { key: 'sewing', label: 'Пошив', count: tasks.sewing ?? 0 },
                { key: 'qc', label: 'ОТК', count: tasks.qc ?? 0 },
              ].map(({ key, label, count }) => (
                <Link
                  key={key}
                  to={TASK_LINKS[key]}
                  className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-4 py-3 hover:bg-white/10"
                >
                  <span>{label}</span>
                  <span className="text-xl font-bold">{count}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Block 3: Orders progress */}
        <div className="mt-6 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Заказы в производстве</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/60">
                  <th className="py-2 pr-4">Заказ</th>
                  <th className="py-2 pr-4">Клиент</th>
                  <th className="py-2 pr-4">Модель</th>
                  <th className="py-2 pr-4 text-right">План</th>
                  <th className="py-2 pr-4 text-right">Раскрой</th>
                  <th className="py-2 pr-4 text-right">Пошив</th>
                  <th className="py-2 pr-4 text-right">ОТК</th>
                  <th className="py-2 text-right">Склад</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((o) => (
                  <tr key={o.order_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-4">
                      <Link to={`/orders/${o.order_id}`} className="text-blue-400 hover:underline">
                        {o.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{o.client_name}</td>
                    <td className="py-2 pr-4">{o.model_name}</td>
                    <td className="py-2 pr-4 text-right">{o.plan}</td>
                    <td className="py-2 pr-4 text-right">{o.cutting}</td>
                    <td className="py-2 pr-4 text-right">{o.sewing}</td>
                    <td className="py-2 pr-4 text-right">{o.qc}</td>
                    <td className="py-2 text-right">{o.warehouse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Block 5: Deadlines */}
        <div className="mt-6 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Дедлайны</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/60">
                  <th className="py-2 pr-4">Заказ</th>
                  <th className="py-2 pr-4">Клиент</th>
                  <th className="py-2 pr-4">Дедлайн</th>
                  <th className="py-2 text-right">Осталось дней</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((d) => (
                  <tr
                    key={d.order_id}
                    className={`border-b border-white/5 hover:bg-white/5 ${d.days_left != null && d.days_left < 3 ? 'bg-red-500/10' : ''}`}
                  >
                    <td className="py-2 pr-4">
                      <Link to={`/orders/${d.order_id}`} className="text-blue-400 hover:underline">
                        {d.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{d.client_name}</td>
                    <td className="py-2 pr-4">{formatDate(d.deadline)}</td>
                    <td className={`py-2 text-right font-medium ${d.days_left != null && d.days_left < 3 ? 'text-red-400' : ''}`}>
                      {d.days_left != null ? d.days_left : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
