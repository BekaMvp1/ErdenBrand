/**
 * Основной layout: Topbar + Sidebar + контент + ИИ-ассистент
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePrintHeader } from '../context/PrintContext';
import PrintDocHeader from './PrintDocHeader';
import { api } from '../api';
import { normalizeUserRole } from '../utils/userRole';
import DashboardSummary from './DashboardSummary';

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер',
  technologist: 'Технолог',
  operator: 'Швея',
};

const NAV_ICONS = {
  dashboard: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  board: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18M6 7v10m6-10v10m6-10v10" />
    </svg>
  ),
  orders: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  create: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  planning: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  finance: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  references: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  procurement: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  cutting: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm-6.364 0a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243z" />
    </svg>
  ),
  floorTasks: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  warehouse: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  qc: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  shipments: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  dispatcher: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  assistant: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 3 3-1 3-1m6-9a9 9 0 11-18 0 9 9 0 0118 0zm-4.5 0a4.5 4.5 0 10-9 0 4.5 4.5 0 009 0z" />
    </svg>
  ),
};

const SIDEBAR_LOCK_KEY = 'sidebar_locked';
const SIDEBAR_LOCK_EXPANDED_KEY = 'sidebar_locked_expanded';

export default function Layout() {
  const { user, logout } = useAuth();
  const userRole = normalizeUserRole(user?.role);
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [cuttingTypes, setCuttingTypes] = useState([]);
  const [cuttingOpen, setCuttingOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverOk, setServerOk] = useState(true);
  /** 'waking' — 502 / сеть (часто Render засыпает); 'offline' — остальные ошибки API */
  const [serverIssueMode, setServerIssueMode] = useState(null);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarLocked, setSidebarLocked] = useState(() => {
    try { return sessionStorage.getItem(SIDEBAR_LOCK_KEY) === '1'; } catch { return false; }
  });
  const [lockedExpanded, setLockedExpanded] = useState(() => {
    try { return sessionStorage.getItem(SIDEBAR_LOCK_EXPANDED_KEY) === '1'; } catch { return false; }
  });

  // При фиксации: сохраняем текущее состояние (открыт/закрыт). Если открыт — фиксируем открытым.
  const toggleSidebarLock = () => {
    setSidebarLocked((prev) => {
      const next = !prev;
      if (next) {
        // Фиксируем: expanded = если сейчас наведён или mobile menu открыт
        const expanded = sidebarHovered || mobileMenuOpen;
        setLockedExpanded(expanded);
        try {
          sessionStorage.setItem(SIDEBAR_LOCK_KEY, '1');
          sessionStorage.setItem(SIDEBAR_LOCK_EXPANDED_KEY, expanded ? '1' : '0');
        } catch (_) {}
      } else {
        try { sessionStorage.setItem(SIDEBAR_LOCK_KEY, '0'); } catch (_) {}
      }
      return next;
    });
  };

  const isReferences = location.pathname === '/references';

  // Заголовок для печати по текущему маршруту
  const printTitles = {
    '/': 'Панель заказов',
    '/orders': 'Заказы',
    '/production-dashboard': 'Дашборд',
    '/board': 'Панель заказов',
    '/orders/create': 'Создать заказ',
    '/procurement': 'Закуп',
    '/planning': 'Планирование',
    '/planning-draft': 'Планирование месяц',
    '/planning-week': 'Планирование неделя',
    '/sewing': 'Пошив',
    '/finance': 'Финансы',
    '/warehouse': 'Склад',
    '/otk': 'ОТК',
    '/shipping-plan': 'План отгрузки',
    '/qc': 'ОТК (партии)',
    '/shipments': 'Отгрузка',
    '/cutting': 'Раскрой',
    '/references': 'Справочники',
    '/settings': 'Настройки',
    '/settings/production-cycle': 'Настройки цикла',
    '/production-chain': 'План цеха',
    '/assistant': 'ИИ Ассистент',
  };
  const basePath = location.pathname.replace(/\/$/, '') || '/';
  const printTitle = printTitles[basePath] || printTitles[location.pathname] || (basePath.startsWith('/cutting') ? 'Раскрой' : basePath.startsWith('/orders/') ? 'Заказ' : 'Документ');
  usePrintHeader(printTitle, '');
  const isBoard = location.pathname === '/board';
  const isAssistant = location.pathname === '/assistant';
  const shouldShowSummary = !isReferences && !isBoard && !isAssistant;
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const checkServer = useCallback(async () => {
    try {
      await api.health();
      setServerOk(true);
      setServerIssueMode(null);
    } catch (e) {
      setServerOk(false);
      const msg = String(e?.message || '');
      const waking =
        e?.status === 502 ||
        /502/i.test(msg) ||
        msg.includes('Failed to fetch') ||
        msg.includes('Сервер временно недоступен') ||
        e?.name === 'TypeError';
      setServerIssueMode(waking ? 'waking' : 'offline');
    }
  }, []);

  const loadLayoutData = useCallback(() => {
    if (!shouldShowSummary) return;
    setSummaryLoading(true);
    api.dashboard
      .summary()
      .then((d) => {
        setSummary(d);
        setSummaryLoading(false);
      })
      .catch(() => {
        setSummary(null);
        setSummaryLoading(false);
      });
  }, [shouldShowSummary]);

  useEffect(() => {
    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, [checkServer]);

  useEffect(() => {
    if (serverOk && shouldShowSummary) {
      loadLayoutData();
    }
  }, [serverOk, shouldShowSummary, loadLayoutData]);

  // Структура sidebar: Дашборд сверху, блок заказов, разделитель, производственный блок, разделитель, системный блок
  const dashboardItem = { type: 'item', to: '/production-dashboard', label: 'Дашборд', icon: 'dashboard' };
  const orderBlockItems =
    userRole === 'operator'
      ? [
          { type: 'item', to: '/board', label: 'Панель заказов', icon: 'board' },
          { type: 'item', to: '/orders', label: 'Заказы', icon: 'orders', end: true },
        ]
      : [
          { type: 'item', to: '/board', label: 'Панель заказов', icon: 'board' },
          { type: 'item', to: '/orders', label: 'Заказы', icon: 'orders', end: true },
          { type: 'item', to: '/orders/create', label: 'Создать заказ', icon: 'create' },
          { type: 'item', to: '/planning', label: 'Планирование месяц', icon: 'planning', end: true },
          { type: 'item', to: '/planning-week', label: 'Планирование неделя', icon: 'planning', end: true },
          { type: 'item', to: '/production-chain', label: 'План цеха', icon: 'planning', end: true },
        ];
  // ОТК и производственный блок: admin, manager, technologist (не operator)
  const canSeeProduction = ['admin', 'manager', 'technologist'].includes(userRole);
  const productionBlockItems = canSeeProduction
    ? [
        { type: 'item', to: '/procurement', label: 'Закуп', icon: 'procurement' },
        { type: 'item', to: '/cutting', label: 'Раскрой', icon: 'cutting' },
        { type: 'item', to: '/sewing', label: 'Пошив', icon: 'floorTasks' },
        { type: 'item', to: '/otk', label: 'ОТК', icon: 'qc' },
        { type: 'item', to: '/shipping-plan', label: 'План отгрузки', icon: 'shipments' },
        { type: 'item', to: '/warehouse', label: 'Склад', icon: 'warehouse' },
        { type: 'item', to: '/shipments', label: 'Отгрузка', icon: 'shipments' },
      ]
    : [];
  const systemBlockItems = [
    ...(userRole !== 'operator' ? [{ type: 'item', to: '/finance', label: 'Финансы', icon: 'finance' }] : []),
    { type: 'item', to: '/assistant', label: 'ИИ Ассистент', icon: 'assistant' },
    { type: 'item', to: '/references', label: 'Справочники', icon: 'references' },
    ...(userRole && ['admin', 'manager'].includes(userRole)
      ? [{ type: 'item', to: '/settings/production-cycle', label: 'Настройки цикла', icon: 'references', end: true }]
      : []),
    { type: 'item', to: '/settings', label: 'Настройки', icon: 'settings' },
  ];

  /** При наведении всегда показываем подписи; при уходе мыши — остаётся развёрнутым только если зафиксировано открытым */
  const sidebarExpanded = sidebarHovered || (sidebarLocked && lockedExpanded);

  const navStructure = [
    dashboardItem,
    { type: 'divider' },
    ...orderBlockItems,
    { type: 'divider' },
    { type: 'spacer' }, // отступ сверху производственного блока
    ...productionBlockItems,
    { type: 'spacer' }, // отступ снизу производственного блока
    { type: 'divider' },
    ...systemBlockItems,
  ];

  return (
    <div className="flex h-screen bg-neon-bg text-neon-text overflow-hidden">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — на десктопе свёрнут; при наведении раскрывается; замок фиксирует текущее состояние */}
      <aside
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`fixed lg:relative inset-y-0 left-0 z-50 bg-neon-bg2 sidebar-header-border flex flex-col transform transition-all duration-200 ease-out overflow-hidden
          w-[min(100vw-2rem,16rem)] max-w-[16rem] sm:w-64
          ${sidebarExpanded ? 'lg:w-56' : 'lg:w-16'}
          ${mobileMenuOpen ? 'translate-x-0 max-lg:pointer-events-auto' : '-translate-x-full lg:translate-x-0 max-lg:pointer-events-none max-lg:[&_*]:pointer-events-none'}`}
      >
        <div className={`header-top flex items-center gap-2 p-4 lg:px-2 lg:py-3 shrink-0 border-b border-white/10 ${sidebarExpanded ? 'lg:justify-start' : 'lg:justify-center'}`}>
          {/* Свёрнуто: логотип (только desktop lg+) */}
          <div className={`hidden lg:flex items-center justify-center flex-1 min-w-0 ${sidebarExpanded ? 'lg:hidden' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" className="w-9 h-9 flex-shrink-0 rounded-full overflow-hidden" aria-label="ERDEN BRAND">
              <defs>
                <clipPath id="sidebar-logo-circle">
                  <circle cx="512" cy="512" r="512" />
                </clipPath>
              </defs>
              <image width="1024" height="1024" clipPath="url(#sidebar-logo-circle)" href="/erden-logo.png" preserveAspectRatio="xMidYMid slice" />
            </svg>
          </div>
          {/* Развёрнуто: название и замок */}
          <div className={`flex items-center gap-2 flex-1 min-w-0 ${sidebarExpanded ? '' : 'lg:hidden'}`}>
            <h1 className="text-base sm:text-lg font-semibold text-neon-text truncate overflow-hidden whitespace-nowrap text-center lg:text-left flex-1 min-w-0">
              ERDEN BRAND
            </h1>
            <button
              type="button"
              onClick={toggleSidebarLock}
              title={sidebarLocked ? 'Разблокировать (раскрывать при наведении)' : 'Фиксировать меню в текущем положении'}
              className="p-1.5 rounded-lg hover:bg-white/10 text-neon-muted hover:text-neon-text transition-colors flex-shrink-0"
              aria-label={sidebarLocked ? 'Разблокировать меню' : 'Заблокировать меню'}
            >
              {sidebarLocked ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-x-hidden">
          {navStructure.map((entry, idx) => {
            if (entry.type === 'divider') {
              return <div key={`divider-${idx}`} className="border-t border-white/10 my-2" aria-hidden="true" />;
            }
            if (entry.type === 'spacer') {
              return <div key={`spacer-${idx}`} className="py-2" aria-hidden="true" />;
            }
            const { to, label, icon, end } = entry;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-300 ease-out min-w-0 ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-neon-text/85 hover:bg-white/5 hover:text-neon-text'
                  }`
                }
              >
                <span className="flex-shrink-0">{NAV_ICONS[icon]}</span>
                <span className={`truncate whitespace-nowrap ${mobileMenuOpen ? 'inline' : 'max-lg:hidden'} ${sidebarExpanded ? 'lg:inline' : 'lg:hidden'}`}>{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="header-top bg-neon-surface flex items-center justify-between px-3 md:px-6 lg:px-8 gap-2 min-h-[3rem]">
          <div className="flex items-center gap-1 min-w-0">
            <Link
              to="/production-dashboard"
              className="shrink-0 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
              style={{ fontWeight: 700, fontSize: 18, color: '#c8ff00' }}
            >
              ERDEN
            </Link>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg lg:hidden hover:bg-white/10 text-neon-text shrink-0"
              aria-label="Меню"
            >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0 min-w-0">
            <span className="text-xs sm:text-sm text-neon-text truncate max-w-[100px] sm:max-w-[200px] md:max-w-none">
              {user?.name}
              {user?.role && (ROLE_LABELS[user.role] || user.role) !== user?.name && (
                <span className="hidden sm:inline"> • {ROLE_LABELS[user.role] || user.role}</span>
              )}
            </span>
            <button
              onClick={logout}
              className="btn-neon px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-neon-surface2 text-neon-text hover:shadow-neon shrink-0 whitespace-nowrap"
            >
              Выход
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:py-4 md:px-6 md:py-5 lg:px-8 lg:py-6 bg-transparent relative">
          <PrintDocHeader />
          {!serverOk && (
            <div
              className="no-print mb-4 flex flex-wrap items-center gap-2"
              style={{
                background:
                  serverIssueMode === 'waking'
                    ? 'rgba(200, 100, 0, 0.15)'
                    : 'rgba(200, 0, 0, 0.15)',
                border: serverIssueMode === 'waking' ? '1px solid #F59E0B' : '1px solid #ff4444',
                padding: '12px 16px',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  color: serverIssueMode === 'waking' ? '#F59E0B' : '#ff6b6b',
                  fontWeight: 600,
                }}
              >
                {serverIssueMode === 'waking'
                  ? '⏳ Сервер просыпается…'
                  : '🔴 Сервер не отвечает.'}
              </span>
              <span style={{ color: '#aaa', marginLeft: 8, fontSize: 13 }}>
                {serverIssueMode === 'waking'
                  ? 'Render Free засыпает при бездействии. Подождите 30–60 секунд.'
                  : 'Запустите backend:'}
              </span>
              {serverIssueMode !== 'waking' ? (
                <code
                  style={{
                    background: '#1a1a1a',
                    color: '#c8ff00',
                    padding: '2px 8px',
                    borderRadius: 4,
                    marginLeft: 8,
                    fontSize: 12,
                  }}
                >
                  cd backend && npm run dev
                </code>
              ) : null}
              <button
                type="button"
                onClick={() => checkServer()}
                style={{
                  marginLeft: 16,
                  padding: '4px 12px',
                  background: 'transparent',
                  border: `0.5px solid ${serverIssueMode === 'waking' ? '#F59E0B' : '#666'}`,
                  color: serverIssueMode === 'waking' ? '#F59E0B' : '#888',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Повторить подключение
              </button>
            </div>
          )}
          {shouldShowSummary && (
            <div className="no-print">
              <DashboardSummary data={summary} loading={summaryLoading} />
            </div>
          )}
          <div key={location.pathname} className="animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
}
