/**
 * Согласовать роль с бэкендом (auth normalizeRole) и значениями в sessionStorage.
 */

export function normalizeUserRole(role) {
  const s = String(role ?? '')
    .trim()
    .toLowerCase();
  if (s === 'administrator' || s === 'администратор') return 'admin';
  if (s === 'менеджер') return 'manager';
  if (s === 'технолог') return 'technologist';
  if (s === 'оператор' || s === 'швея') return 'operator';
  if (['admin', 'manager', 'technologist', 'operator'].includes(s)) return s;
  return s;
}
