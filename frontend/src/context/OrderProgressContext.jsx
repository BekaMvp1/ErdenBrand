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
export function OrderProgressProvider({ children }) {
  const [ordersProgress, setOrdersProgress] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const activeControllerRef = useRef(null);
  const loadInFlightRef = useRef(false);

  const loadProgress = useCallback(async (options = {}, signal) => {
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
    try {
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    loadProgress({ silent: false }, controller.signal)
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeoutId);
        loadInFlightRef.current = false;
      });

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      loadInFlightRef.current = false;
    };
  }, [loadProgress]);

  const value = {
    ordersProgress,
    dashboardStats,
    loading,
    lastUpdated,
    refresh: () => {
      if (loadInFlightRef.current) return;
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      loadInFlightRef.current = true;
      loadProgress({ silent: false }, controller.signal)
        .catch(() => {})
        .finally(() => {
          window.clearTimeout(timeoutId);
          loadInFlightRef.current = false;
        });
    },
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
