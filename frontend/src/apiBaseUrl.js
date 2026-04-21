/**
 * Базовый URL для API.
 * 1) VITE_API_URL — если задан, используется он.
 * 2) Иначе VITE_API_FALLBACK_URL — если задан, используется он.
 * 3) Иначе в dev — пустая строка (fetch на /api через прокси Vite, см. vite.config.js).
 * 4) Иначе в production — пустая строка и предупреждение в консоль.
 */

const primary = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
const secondary = (import.meta.env.VITE_API_FALLBACK_URL || '').trim().replace(/\/$/, '');

const resolved = primary || secondary;

export const API_URL = resolved || (import.meta.env.DEV ? '' : '');

if (!import.meta.env.DEV && !resolved) {
  console.warn(
    'API URL не задан: укажите VITE_API_URL или VITE_API_FALLBACK_URL в окружении сборки (например в Vercel).',
  );
}
