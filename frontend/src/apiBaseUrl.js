/**
 * Базовый URL для API.
 * В dev: пустой URL → fetch('/api/...') через proxy Vite (vite.config.js → backend).
 * В dev, если VITE_API_URL указывает на localhost/127.0.0.1 — тоже proxy (нет рассинхрона порта с бэкендом).
 * Иначе (удалённый API в dev или production) — используется VITE_API_URL.
 */
const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

function devShouldUseProxy() {
  if (!import.meta.env.DEV) return false;
  if (!raw) return true;
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** В dev при proxy — ''; иначе VITE_API_URL; в production без переменной — пусто (ошибка в консоли). */
export const API_URL = devShouldUseProxy()
  ? ''
  : raw || (import.meta.env.DEV ? 'http://localhost:3001' : '');

if (!import.meta.env.DEV && !API_URL) {
  console.error('VITE_API_URL is not defined');
}
