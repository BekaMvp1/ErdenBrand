/**
 * Дашборд производства — KPI, загрузка по дням, заказы, дедлайны.
 * Блоки грузятся независимо; общий таймаут не блокирует экран.
 */

import { useEffect, useMemo, useState } from 'react';
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

const EMPTY_STATS = {
  orders_in_progress: 0,
  cut_today: 0,
  sewn_today: 0,
  qc_today: 0,
  warehouse_ready: 0,
  shipped_today: 0,
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

/** 7 дней начиная с сегодня (локальный календарь) — запасной ряд, если API недоступен */
function generateDays() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    days.push(day);
  }
  return days;
}

function isoFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mergeDailyWithWeek(apiRows) {
  const byDate = {};
  (apiRows || []).forEach((row) => {
    const key = String(row.date || '').slice(0, 10);
    if (key) byDate[key] = row;
  });
  return generateDays().map((d) => {
    const iso = isoFromDate(d);
    const row = byDate[iso];
    return row || { date: iso, plan: 0, capacity: 0, overload: 0 };
  });
}

export default function ProductionDashboard() {
  const [stats, setStats] = useState(null);
  const [dailyLoad, setDailyLoad] = useState([]);
  const [tasks, setTasks] = useState({});
  const [orders, setOrders] = useState([]);
  const [deadlines, setDeadlines] = useState([]);

  const [statsLoading, setStatsLoading] = useState(true);
  const [loadLoading, setLoadLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);

  useEffect(() => {
    console.log('[Dashboard] монтирование');

    api.orders
      .stats()
      .then((r) => console.log('[Dashboard] stats:', r))
      .catch((e) => console.error('[Dashboard] stats ERROR:', e?.status, e?.message));

    api.productionPanel
      .dailyLoad()
      .then((r) => console.log('[Dashboard] daily-load:', r))
      .catch((e) => console.error('[Dashboard] daily-load ERROR:', e?.status, e?.message));

    api.productionPanel
      .tasksToday()
      .then((r) => console.log('[Dashboard] tasks:', r))
      .catch((e) => console.error('[Dashboard] tasks ERROR:', e?.status, e?.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      console.warn('[Dashboard] таймаут загрузки');
      setStatsLoading(false);
      setLoadLoading(false);
      setTasksLoading(false);
      setOrdersLoading(false);
      setDeadlinesLoading(false);
    }, 5000);

    const fetchStats = () =>
      api.dashboard
        .productionStats()
        .then((r) => {
          if (!cancelled) setStats(r?.production_stats ?? EMPTY_STATS);
        })
        .catch(() => {
          if (!cancelled) setStats(EMPTY_STATS);
        })
        .finally(() => {
          if (!cancelled) setStatsLoading(false);
        });

    const fetchDailyLoad = () =>
      api.productionPanel
        .dailyLoad()
        .then((r) => {
          if (!cancelled) setDailyLoad(Array.isArray(r) ? r : []);
        })
        .catch(() => {
          if (!cancelled) setDailyLoad([]);
        })
        .finally(() => {
          if (!cancelled) setLoadLoading(false);
        });

    const fetchTasksToday = () =>
      api.productionPanel
        .tasksToday()
        .then((r) => {
          if (!cancelled) setTasks(r && typeof r === 'object' ? r : {});
        })
        .catch(() => {
          if (!cancelled) setTasks({});
        })
        .finally(() => {
          if (!cancelled) setTasksLoading(false);
        });

    const fetchOrdersProgress = () =>
      api.dashboard
        .productionOrdersProgress()
        .then((r) => {
          if (!cancelled) setOrders(Array.isArray(r?.orders_progress) ? r.orders_progress : []);
        })
        .catch(() => {
          if (!cancelled) setOrders([]);
        })
        .finally(() => {
          if (!cancelled) setOrdersLoading(false);
        });

    const fetchDeadlines = () =>
      api.dashboard
        .productionDeadlines()
        .then((r) => {
          if (!cancelled) setDeadlines(Array.isArray(r?.deadlines) ? r.deadlines : []);
        })
        .catch(() => {
          if (!cancelled) setDeadlines([]);
        })
        .finally(() => {
          if (!cancelled) setDeadlinesLoading(false);
        });

    Promise.allSettled([
      fetchStats(),
      fetchDailyLoad(),
      fetchTasksToday(),
      fetchOrdersProgress(),
      fetchDeadlines(),
    ]).finally(() => {
      clearTimeout(timeout);
      if (!cancelled) {
        setStatsLoading(false);
        setLoadLoading(false);
        setTasksLoading(false);
        setOrdersLoading(false);
        setDeadlinesLoading(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const displayStats = stats ?? EMPTY_STATS;
  const displayDaily = useMemo(() => mergeDailyWithWeek(dailyLoad), [dailyLoad]);

  const statCards = [
    { key: 'orders_in_progress', label: 'Заказы в работе', value: displayStats.orders_in_progress ?? 0 },
    { key: 'cut_today', label: 'Сегодня раскроено', value: displayStats.cut_today ?? 0 },
    { key: 'sewn_today', label: 'Сегодня сшито', value: displayStats.sewn_today ?? 0 },
    { key: 'qc_today', label: 'Сегодня проверено ОТК', value: displayStats.qc_today ?? 0 },
    { key: 'warehouse_ready', label: 'Готово на складе', value: displayStats.warehouse_ready ?? 0 },
    { key: 'shipped_today', label: 'Отгружено сегодня', value: displayStats.shipped_today ?? 0 },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 md:py-6 text-white bg-[#0f0f12] overflow-x-hidden">
      <div className="max-w-[1400px] mx-auto w-full min-w-0">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-4 md:mb-6 text-white">Дашборд производства</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
          {statsLoading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse border border-white/10" />
            ))
          ) : (
            statCards.map(({ key, label, value }) => (
              <Link
                key={key}
                to={CARD_LINKS[key] || '#'}
                className="rounded-xl bg-[#1a1a1f] border border-white/10 p-4 hover:border-white/25 hover:bg-[#222] transition-colors"
              >
                <div className="text-xs uppercase tracking-wide text-white/50 mb-1">{label}</div>
                <div className="text-2xl font-bold">{value}</div>
              </Link>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Загрузка производства</h2>
            {loadLoading ? (
              <div className="text-white/50 py-6">Загрузка...</div>
            ) : (
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
                    {displayDaily.map((row) => (
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
            )}
          </div>

          <div className="rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Задачи сегодня</h2>
            {tasksLoading ? (
              <div className="text-white/50 py-4">Загрузка...</div>
            ) : (
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
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Заказы в производстве</h2>
          {ordersLoading ? (
            <div className="text-white/50 py-4">Загрузка...</div>
          ) : (
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
          )}
        </div>

        <div className="mt-6 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Дедлайны</h2>
          {deadlinesLoading ? (
            <div className="text-white/50 py-4">Загрузка...</div>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
