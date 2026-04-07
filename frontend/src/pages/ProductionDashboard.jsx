/**
 * Дашборд производства — KPI, загрузка по дням, заказы, дедлайны.
 * Блоки грузятся независимо; общий таймаут не блокирует экран.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useOrderProgress } from '../context/OrderProgressContext';

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
  const navigate = useNavigate();
  const {
    dashboardStats,
    ordersProgress,
    loading: progressLoading,
    lastUpdated,
    refresh,
  } = useOrderProgress();
  const [dailyLoad, setDailyLoad] = useState([]);
  const [tasks, setTasks] = useState({});
  const [deadlines, setDeadlines] = useState([]);

  const [loadLoading, setLoadLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
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
      setLoadLoading(false);
      setTasksLoading(false);
      setDeadlinesLoading(false);
    }, 5000);

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
      fetchDailyLoad(),
      fetchTasksToday(),
      fetchDeadlines(),
    ]).finally(() => {
      clearTimeout(timeout);
      if (!cancelled) {
        setLoadLoading(false);
        setTasksLoading(false);
        setDeadlinesLoading(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const displayDaily = useMemo(() => mergeDailyWithWeek(dailyLoad), [dailyLoad]);

  const dashCards = [
    {
      label: 'Заказы в работе',
      value: dashboardStats?.active_orders ?? 0,
      onClick: () => navigate('/orders'),
      color: '#fff',
    },
    {
      label: 'Сегодня раскроено',
      value: dashboardStats?.today_cutting ?? 0,
      onClick: () => navigate('/cutting'),
      color: '#c8ff00',
    },
    {
      label: 'Сегодня сшито',
      value: dashboardStats?.today_sewing ?? 0,
      onClick: () => navigate('/sewing'),
      color: '#c8ff00',
    },
    {
      label: 'Сегодня проверено ОТК',
      value: dashboardStats?.today_otk ?? tasks.qc ?? 0,
      onClick: () => navigate('/otk'),
      color: '#4a9eff',
    },
    {
      label: 'Готово на складе',
      value: dashboardStats?.warehouse_total ?? 0,
      onClick: () => navigate('/warehouse'),
      color: '#1D9E75',
    },
    {
      label: 'Отгружено сегодня',
      value: dashboardStats?.today_shipped ?? 0,
      onClick: () => navigate('/shipments'),
      color: '#F59E0B',
    },
  ];

  return (
    <div className="min-h-screen px-3 md:px-6 lg:px-8 py-4 md:py-6 text-white bg-[#0f0f12] overflow-x-hidden">
      <div className="max-w-[1400px] mx-auto w-full min-w-0">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">Дашборд производства</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="text-xs rounded border border-white/20 bg-transparent px-3 py-1.5 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              Обновить
              {lastUpdated ? (
                <span className="ml-2 text-white/40">
                  Обновлено:{' '}
                  {lastUpdated.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 relative z-[2]"
          style={{ isolation: 'isolate' }}
        >
          {progressLoading && !dashboardStats ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-[#111] animate-pulse border border-[#222]" />
            ))
          ) : (
            dashCards.map((card, i) => (
              <button
                key={i}
                type="button"
                onClick={card.onClick}
                className="rounded-lg border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff00]/40"
                style={{
                  background: '#111',
                  borderColor: '#222',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 2,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#222';
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wide mb-2"
                  style={{ color: '#888' }}
                >
                  {card.label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: card.color,
                  }}
                >
                  {card.value}
                </div>
              </button>
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

          <div
            className="rounded-lg border overflow-hidden relative z-[2]"
            style={{ background: '#111', borderColor: '#222' }}
          >
            <div
              className="px-4 py-3 text-[13px]"
              style={{ borderBottom: '1px solid #222', color: '#888' }}
            >
              Задачи сегодня
            </div>
            {tasksLoading ? (
              <div className="text-white/50 py-4 px-4">Загрузка...</div>
            ) : (
              [
                {
                  label: 'Раскрой',
                  value: dashboardStats?.today_cutting ?? tasks.cutting ?? 0,
                  path: '/cutting',
                },
                {
                  label: 'Пошив',
                  value: dashboardStats?.today_sewing ?? tasks.sewing ?? 0,
                  path: '/sewing',
                },
                {
                  label: 'ОТК',
                  value: dashboardStats?.today_otk ?? tasks.qc ?? 0,
                  path: '/otk',
                },
              ].map((task, idx) => (
                <button
                  key={task.path}
                  type="button"
                  onClick={() => navigate(task.path)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors focus:outline-none focus-visible:bg-[#1a1a1a]"
                  style={{
                    borderBottom: idx < 2 ? '1px solid #1a1a1a' : undefined,
                    cursor: 'pointer',
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1a1a1a';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span className="text-sm text-white">{task.label}</span>
                  <span className="text-base font-bold" style={{ color: '#c8ff00' }}>
                    {task.value}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-[#1a1a1f] border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Заказы — прогресс цепочки</h2>
          {progressLoading && ordersProgress.length === 0 ? (
            <div className="text-white/50 py-4">Загрузка...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/15 text-left text-white/55">
                    <th className="py-2 pr-3">Заказ</th>
                    <th className="py-2 pr-3">Клиент</th>
                    <th className="py-2 pr-2 text-center">План</th>
                    <th className="py-2 pr-2 text-center">✂️ Раскрой</th>
                    <th className="py-2 pr-2 text-center">🧵 Пошив</th>
                    <th className="py-2 pr-2 text-center">✓ ОТК</th>
                    <th className="py-2 pr-2 text-center">📦 Склад</th>
                    <th className="py-2 pr-2 text-center">🚚 Отгрузка</th>
                    <th className="py-2 pr-0 min-w-[104px]">Прогресс</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersProgress.slice(0, 40).map((order) => {
                    const plan = order.plan_qty ?? 0;
                    const q = order.quantities || {};
                    const cells = [
                      q.cutting ?? 0,
                      q.sewing ?? 0,
                      q.otk_passed ?? 0,
                      q.warehouse ?? 0,
                      q.shipped ?? 0,
                    ];
                    return (
                      <tr key={order.id} className="border-b border-white/[0.06] hover:bg-white/[0.04]">
                        <td className="py-2 pr-3 align-top">
                          <Link
                            to={`/orders/${order.id}`}
                            className="font-semibold text-[#c8ff00] hover:underline block leading-snug"
                          >
                            {order.article ? `${order.article} — ` : ''}
                            {order.name || '—'}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-[#4a9eff] align-top">{order.client || '—'}</td>
                        <td className="py-2 pr-2 text-center font-semibold align-top">{plan}</td>
                        {cells.map((qty, i) => (
                          <td key={i} className="py-2 pr-2 text-center align-top">
                            <span
                              className={
                                qty > 0 && plan > 0 && qty >= plan
                                  ? 'text-[#c8ff00] font-semibold'
                                  : qty > 0
                                    ? 'text-white font-medium'
                                    : 'text-white/25'
                              }
                            >
                              {qty > 0 ? qty : '—'}
                            </span>
                          </td>
                        ))}
                        <td className="py-2 pr-0 align-top min-w-[104px]">
                          <div className="h-1.5 rounded bg-black/40 overflow-hidden">
                            <div
                              className="h-full rounded transition-all duration-500"
                              style={{
                                width: `${Math.min(100, order.total_progress ?? 0)}%`,
                                background:
                                  (order.total_progress ?? 0) >= 100 ? '#c8ff00' : '#4a9eff',
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5 text-right">
                            {order.total_progress ?? 0}%
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
