/**
 * Контекст аутентификации
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from '../apiBaseUrl';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const storedUser = sessionStorage.getItem('user');
    if (!token || !storedUser) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    // Проверяем токен на сервере — иначе без логина заходило
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
          setUser(null);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.user) setUser(data.user);
      })
      .catch((e) => {
        if (e?.name === 'AbortError' || cancelled) {
          try {
            const u = JSON.parse(storedUser);
            if (u && typeof u === 'object' && !cancelled) setUser(u);
          } catch (_) {}
          return;
        }
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const login = (data) => {
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  const canAccess = (...roles) => roles.includes(user?.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
