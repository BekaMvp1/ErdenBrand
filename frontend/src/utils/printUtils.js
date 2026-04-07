/**
 * Общие утилиты для печати (заказы, планирование).
 */

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function toBase64(url) {
  if (!url) return null;
  const u = String(url).trim();
  if (!u) return null;
  if (u.startsWith('data:')) return u;
  try {
    const res = await fetch(u, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function formatWeek(dateStr) {
  if (!dateStr) return '—';
  const start = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return '—';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'май',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]}–${end.getDate()} ${months[end.getMonth()]}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}
