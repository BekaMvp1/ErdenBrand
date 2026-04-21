/**
 * Базовый URL для API.
 * В dev: пустой URL → fetch('/api/...') через proxy Vite (vite.config.js → backend).
 * В dev, если VITE_API_URL указывает на localhost/127.0.0.1 — тоже proxy (нет рассинхрона порта с бэкендом).
 * Иначе (удалённый API в dev или production) — используется VITE_API_URL.
 */
const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

/**
 * Если VITE_API_URL не попал в билд (например, не задан в Vercel), относительные
 * запросы уходят на origin фронта — «Failed to fetch» / ложный CORS.
 * Явный URL в Vercel по-прежнему предпочтителен; фолбэк — последняя известная прод-среда.
 */
const PRODUCTION_API_FALLBACK =
  (import.meta.env.VITE_API_FALLBACK_URL || '').trim().replace(/\/$/, '') ||
  'https://erdenbrand.onrender.com';

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

/** В dev при proxy — ''; иначе VITE_API_URL; в production без переменной — фолбэк на API-хост. */
export const API_URL = devShouldUseProxy()
  ? ''
  : raw || (import.meta.env.DEV ? 'http://localhost:3001' : PRODUCTION_API_FALLBACK);

if (!import.meta.env.DEV && !raw && API_URL) {
  console.warn(
    'VITE_API_URL не задан в окружении сборки; используется фолбэк API_URL. Задайте VITE_API_URL в Vercel для явного URL.',
  );
}
