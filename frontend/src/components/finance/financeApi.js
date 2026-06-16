import { API_URL } from '../../apiBaseUrl';

const BASE = '/api/finance/finplan';

function getToken() {
  return sessionStorage.getItem('token');
}

async function finplanRequest(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ошибка ${res.status}`);
  }
  return data;
}

export const finplanApi = {
  listArticles: () => finplanRequest('/articles'),
  getSourceArticles: () => finplanRequest('/source-articles'),
  createArticle: (body) =>
    finplanRequest('/articles', { method: 'POST', body: JSON.stringify(body) }),
  updateArticle: (id, body) =>
    finplanRequest(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteArticle: (id) => finplanRequest(`/articles/${id}`, { method: 'DELETE' }),
  getEntries: (year) => finplanRequest(`/entries?year=${year}`),
  saveEntriesBulk: (items) =>
    finplanRequest('/entries/bulk', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getExpensesPanel: (year, month) => {
    const params = new URLSearchParams({ year: String(year) });
    if (month != null && month !== '') params.set('month', String(month));
    return expensesPanelRequest(`?${params}`);
  },
  markExpensePanel: (body) =>
    expensesPanelRequest('/mark', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const expensesPanelApi = {
  get: (year, month) => finplanApi.getExpensesPanel(year, month),
  mark: (body) => finplanApi.markExpensePanel(body),
};

async function expensesPanelRequest(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/finance/expenses-panel${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

export const MONTH_LABELS = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

export const SOURCE_LABELS = {
  manual: 'Вручную',
  planned_income: 'Плановое поступление',
  planned_expense: 'Планирование расходов',
};

export function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function parseAmount(value) {
  return parseFloat(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
}
