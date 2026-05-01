/**
 * Единый поток агрегата цепочки: /api/progress → дашборд, панель заказов, планирование.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../api';

const OrderProgressContext = createContext(null);
const POLL_MS = 30000;

export function OrderProgressProvider({ children }) {
  const [ordersProgress, setOrdersProgress] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const loadProgress = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    const token =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('token')
        : null;
    if (!token) {
      setOrdersProgress([]);
      setDashboardStats(null);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const signal = controller.signal;
      const [progressRes, statsRes] = await Promise.all([
        api.progress.ordersProgress({ signal }),
        api.progress.dashboardStats({ signal }),
      ]);
      setOrdersProgress(Array.isArray(progressRes) ? progressRes : []);
      setDashboardStats(statsRes && typeof statsRes === 'object' ? statsRes : null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
        console.error('[Progress] Ошибка загрузки:', err?.message || err);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress({ silent: false });

    intervalRef.current = window.setInterval(() => {
      loadProgress({ silent: true });
    }, POLL_MS);

    const onFocus = () => loadProgress({ silent: true });
    window.addEventListener('focus', onFocus);

    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [loadProgress]);

  const value = {
    ordersProgress,
    dashboardStats,
    loading,
    lastUpdated,
    refresh: () => loadProgress({ silent: false }),
  };

  return (
    <OrderProgressContext.Provider value={value}>
      {children}
    </OrderProgressContext.Provider>
  );
}

export function useOrderProgress() {
  const ctx = useContext(OrderProgressContext);
  if (!ctx) {
    return {
      ordersProgress: [],
      dashboardStats: null,
      loading: false,
      lastUpdated: null,
      refresh: () => {},
    };
  }
  return ctx;
}
