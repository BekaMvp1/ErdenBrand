/**
 * API клиент для backend
 */

import { API_URL } from './apiBaseUrl';

const API_TIMEOUT_MS = 15000;

function getToken() {
  return sessionStorage.getItem('token');
}

function isLikelyNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TypeError') return true;
  const m = String(err.message || '');
  return m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed');
}

async function request(path, options = {}) {
  const maxRetries = 3;
  const timeoutMs =
    Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0
      ? Number(options.timeout)
      : API_TIMEOUT_MS;
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
    const externalSignal = options.signal;
    const onAbort = () => timeoutController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) timeoutController.abort();
      else externalSignal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const { timeout: _timeout, ...fetchOptions } = options;
      const res = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers,
        mode: 'cors',
        credentials: 'include',
        cache: 'no-store',
        signal: timeoutController.signal,
      });

      if (res.status === 502) {
        console.log(`[API] 502 попытка ${attempt}/${maxRetries}, ждём…`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        const err502 = new Error('Сервер временно недоступен (502)');
        err502.status = 502;
        throw err502;
      }

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
        const err = new Error(data.error || 'Требуется вход');
        err.status = 401;
        throw err;
      }

      if (!res.ok) {
        const errMsg = data.error || `Ошибка ${res.status}`;
        const err = new Error(errMsg);
        err.status = res.status;
        err.details = data.stack || data.details;
        err.problematic = data.problematic;
        err.received = data.received;
        err.error = data.error;
        throw err;
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err?.name === 'AbortError') {
        console.error('[API] Таймаут запроса:', path);
      } else if (!err?.status) {
        console.error('[API] Сервер недоступен:', path);
      }
      if (err && err.status === 401) throw err;
      if (err && typeof err.status === 'number' && err.status !== 502 && err.status >= 400) {
        throw err;
      }
      if (err?.name === 'AbortError') throw err;
      if (attempt < maxRetries && isLikelyNetworkError(err)) {
        console.log(`[API] сеть попытка ${attempt}/${maxRetries}:`, err?.message || err);
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  throw lastError || new Error('Сеть недоступна');
}

export const api = {
  health: (opts = {}) => request('/api/health', opts),
  dashboard: {
    summary: () => request('/api/dashboard/summary'),
    get: () => request('/api/dashboard'),
    production: () => request('/api/dashboard/production'),
    productionStats: () => request('/api/dashboard/production-stats'),
    productionOrdersProgress: () => request('/api/dashboard/production-orders-progress'),
    productionDeadlines: () => request('/api/dashboard/production-deadlines'),
  },
  progress: {
    ordersProgress: (opts = {}) => request('/api/progress/orders-progress', opts),
    dashboardStats: (opts = {}) => request('/api/progress/dashboard-stats', opts),
  },
  productionPanel: {
    dailyLoad: () => request('/api/production/daily-load'),
    tasksToday: () => request('/api/production/tasks-today'),
  },
  auth: {
    login: (email, password) =>
      request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },
  orders: {
    stats: () => request('/api/orders/stats'),
    byWorkshop: (workshopId) =>
      request(`/api/orders/by-workshop?workshop_id=${workshopId}`),
    list: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/orders${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/api/orders/${id}`),
    photo: (id) => request(`/api/orders/${id}/photo`),
    stages: (id) => request(`/api/orders/${id}/stages`),
    create: (data) =>
      request('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) =>
      request(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) =>
      request(`/api/orders/${id}`, { method: 'DELETE' }),
    complete: (id) => request(`/api/orders/${id}/complete`, { method: 'POST' }),
    updateOperationActual: (orderId, opId, actualQuantity) =>
      request(`/api/orders/${orderId}/operations/${opId}/actual`, {
        method: 'PUT',
        body: JSON.stringify({ actual_quantity: actualQuantity }),
      }),
    addPhoto: (id, photo) =>
      request(`/api/orders/${id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ photo }),
      }),
    deletePhoto: (id, index) =>
      request(`/api/orders/${id}/photos/${index}`, { method: 'DELETE' }),
    addComment: (id, data) =>
      request(`/api/orders/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateParts: (id, parts) =>
      request(`/api/orders/${id}/parts`, {
        method: 'PUT',
        body: JSON.stringify({ parts }),
      }),
    getProcurement: (id) =>
      request(`/api/orders/${id}/procurement`),
    getProductionStages: (id) =>
      request(`/api/orders/${id}/production-stages`),
    completeProcurement: (id, items) =>
      request(`/api/orders/${id}/procurement/complete`, { method: 'POST', body: JSON.stringify({ items: items || [] }) }),
    completePlanning: (id) =>
      request(`/api/orders/${id}/planning/complete`, { method: 'POST' }),
    completeWarehouse: (id) =>
      request(`/api/orders/${id}/warehouse/complete`, { method: 'POST' }),
    saveProcurementPlan: (id, data) =>
      request(`/api/orders/${id}/procurement/plan`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteProcurement: (id) =>
      request(`/api/orders/${id}/procurement`, { method: 'DELETE' }),
  },
  dekatirovka: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/dekatirovka${q ? `?${q}` : ''}`);
    },
    create: (body) =>
      request('/api/dekatirovka', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/dekatirovka/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  proverka: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/proverka${q ? `?${q}` : ''}`);
    },
    create: (body) =>
      request('/api/proverka', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/proverka/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  planning: {
    updateOperation: (id, data) =>
      request(`/api/planning/operations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    day: (date) => request(`/api/planning/day?date=${date}`),
    week: (from, to) => request(`/api/planning/week?from=${from}&to=${to}`),
    month: (month) => request(`/api/planning/month?month=${month}`),
    floors: (workshopId) =>
      request(`/api/planning/floors?workshop_id=${workshopId}`),
    table: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/table?${q}`);
    },
    calendar: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/calendar?${q}`);
    },
    modelTable: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/model-table?${q}`);
    },
    /** Комплекты: план/факт по частям, фильтр недели через date_from/date_to */
    kitRows: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/kit-rows?${q}`);
    },
    kitSummary: (orderId) => request(`/api/planning/kit-summary/${orderId}`),
    plan: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/plan?${q}`);
    },
    planDay: (data) =>
      request('/api/planning/plan-day', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    updateDay: (data) =>
      request('/api/planning/day', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    cuttingSummary: (orderId) =>
      request(`/api/planning/cutting-summary?order_id=${orderId}`),
    calcCapacity: (data) =>
      request('/api/planning/calc-capacity', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    applyCapacity: (data) =>
      request('/api/planning/apply-capacity', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    flowCalc: (data) =>
      request('/api/planning/flow/calc', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    flowApplyAuto: (data) =>
      request('/api/planning/flow/apply-auto', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Периоды планирования (месяцы)
    periods: () => request('/api/planning/periods'),
    closePeriod: (periodId) =>
      request(`/api/planning/periods/close?period_id=${periodId}`, { method: 'POST' }),
    // Недельное планирование (params: period_id или month, workshop_id, floor_id)
    weekly: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/weekly?${q}`);
    },
    weeklyManual: (data) =>
      request('/api/planning/weekly/manual', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    saveCapacity: (data) =>
      request('/api/planning/capacity', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    matrixOrdersMeta: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/matrix-orders-meta?${q}`);
    },
    matrixSnapshotGet: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/planning/matrix-snapshot?${q}`);
    },
    matrixSnapshotSave: (body) =>
      request('/api/planning/matrix-snapshot', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    productionDraftGet: (params) => {
      const q = new URLSearchParams();
      q.set('month_key', params.month_key);
      if (params.workshop_id != null && String(params.workshop_id).trim() !== '') {
        q.set('workshop_id', String(params.workshop_id));
      }
      if (params.building_floor_id != null && String(params.building_floor_id).trim() !== '') {
        q.set('building_floor_id', String(params.building_floor_id));
      }
      return request(`/api/planning/production-draft?${q}`);
    },
    productionDraftPut: (body) =>
      request('/api/planning/production-draft', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    monthFactsGet: (params) => {
      const q = new URLSearchParams();
      q.set('month_key', params.month_key);
      if (params.workshop_id != null && String(params.workshop_id).trim() !== '') {
        q.set('workshop_id', String(params.workshop_id));
      }
      if (params.building_floor_id != null && String(params.building_floor_id).trim() !== '') {
        q.set('building_floor_id', String(params.building_floor_id));
      }
      q.set('week_slice_start', String(params.week_slice_start ?? 0));
      return request(`/api/planning/month-facts?${q}`);
    },
    monthFactPost: (body) =>
      request('/api/planning/month-fact', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    chainList: () => request('/api/planning/chain'),
    /** План/факт шт. для колонок Декатировка и Проверка (план из month facts, факт из facts-таблиц) */
    chainDekatProverka: (monthKey, orderIds) => {
      const q = new URLSearchParams();
      q.set('month_key', String(monthKey).slice(0, 7));
      if (orderIds && orderIds.length) q.set('order_ids', orderIds.join(','));
      return request(`/api/planning/chain/dekat-proverka?${q}`);
    },
    chainPost: (body) =>
      request('/api/planning/chain', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    chainPatch: (id, body) =>
      request(`/api/planning/chain/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    chainSyncDocuments: (chain_ids) =>
      request('/api/planning/chain/sync-documents', {
        method: 'POST',
        body: JSON.stringify({ chain_ids }),
      }),
  },
  orderOperations: {
    floorTasks: (floorId) =>
      request(`/api/order-operations/floor-tasks?floor_id=${floorId}`),
    updateStatus: (id, status) =>
      request(`/api/order-operations/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    updateVariants: (id, variants) =>
      request(`/api/order-operations/${id}/variants`, {
        method: 'PUT',
        body: JSON.stringify({ variants }),
      }),
    complete: (id) =>
      request(`/api/order-operations/${id}/complete`, { method: 'POST' }),
    updateFloor: (id, floorId) =>
      request(`/api/order-operations/${id}/floor`, {
        method: 'PUT',
        body: JSON.stringify({ floor_id: floorId }),
      }),
  },
  board: {
    getOrders: (params = {}) => {
      const cleaned = {};
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (k === 'q' && String(v).trim() === '') continue;
        cleaned[k] = v;
      }
      const q = new URLSearchParams(cleaned).toString();
      return request(`/api/board/orders${q ? `?${q}` : ''}`);
    },
  },
  sewing: {
    tasks: (params = {}) => {
      const cleaned = {};
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (k === 'q' && String(v).trim() === '') continue;
        cleaned[k] = v;
      }
      const q = new URLSearchParams(cleaned).toString();
      return request(`/api/sewing/tasks${q ? `?${q}` : ''}`);
    },
    board: (params = {}) => {
      const cleaned = {};
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (k === 'q' && String(v).trim() === '') continue;
        cleaned[k] = v;
      }
      const status = cleaned.status === 'in_progress' ? 'IN_PROGRESS' : cleaned.status === 'done' ? 'DONE' : (cleaned.status === 'all' ? 'ALL' : 'IN_PROGRESS');
      cleaned.status = status;
      const qs = new URLSearchParams(cleaned).toString();
      return request(`/api/sewing/board${qs ? `?${qs}` : ''}`);
    },
    completeStatus: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/sewing/complete-status${q ? `?${q}` : ''}`);
    },
    planDates: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/sewing/plan-dates${q ? `?${q}` : ''}`);
    },
    saveFact: (body) =>
      request('/api/sewing/fact', { method: 'PUT', body: JSON.stringify(body) }),
    saveFactTotal: (body) =>
      request('/api/sewing/fact-total', { method: 'PUT', body: JSON.stringify(body) }),
    factAdd: (body) =>
      request('/api/sewing/fact-add', { method: 'PUT', body: JSON.stringify(body) }),
    matrix: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/sewing/matrix?${q}`);
    },
    factMatrix: (body) =>
      request('/api/sewing/fact-matrix', { method: 'PUT', body: JSON.stringify(body) }),
    saveFactBulk: (body) =>
      request('/api/sewing/fact/bulk', { method: 'POST', body: JSON.stringify(body) }),
    complete: (body) =>
      request('/api/sewing/complete', { method: 'POST', body: JSON.stringify(body) }),
    factsByOrder: (order_ids) =>
      request(`/api/sewing/facts-by-order${order_ids ? `?order_ids=${encodeURIComponent(order_ids)}` : ''}`),
    documentsList: () => request('/api/sewing/documents'),
    documentFactsList: (docId) => request(`/api/sewing/documents/${docId}/facts`),
    documentPatch: (id, body) =>
      request(`/api/sewing/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    chainFactPatch: (factId, body) =>
      request(`/api/sewing/facts/${factId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    syncToOtk: () =>
      request('/api/sewing/sync-to-otk', {
        method: 'POST',
      }),
    // ensure-batch удалён: партия создаётся только через complete (Завершить пошив → ОТК)
  },
  shipping: {
    documentsList: () => request('/api/shipping/documents'),
    documentPatch: (id, body) =>
      request(`/api/shipping/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    documentsFromChain: (chain_ids) =>
      request('/api/shipping/documents/from-chain', {
        method: 'POST',
        body: JSON.stringify({ chain_ids }),
      }),
  },
  otk: {
    documentsList: () => request('/api/otk/documents'),
    documentFactsList: (docId) => request(`/api/otk/documents/${docId}/facts`),
    documentPatch: (id, body) =>
      request(`/api/otk/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    chainFactPatch: (factId, body) =>
      request(`/api/otk/facts/${factId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    syncToWarehouse: () =>
      request('/api/otk/sync-to-warehouse', {
        method: 'POST',
      }),
  },
  settings: {
    deleteAllOrders: () =>
      request('/api/settings/delete-all-orders', { method: 'POST' }),
    productionCycleGet: () => request('/api/settings/production-cycle'),
    productionCycleSave: (body) =>
      request('/api/settings/production-cycle', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  ai: {
    query: (query) =>
      request('/api/ai/query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  },
  finance: {
    bdr2026: () => request('/api/finance/2026/bdr'),
    bdds2026: () => request('/api/finance/2026/bdds'),
    updatePlan: (data) =>
      request('/api/finance/plan', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    addFact: (data) =>
      request('/api/finance/fact', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  procurement: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/procurement${q ? `?${q}` : ''}`);
    },
    getById: (id) =>
      request(`/api/procurement/${id}`),
    complete: (id, items) =>
      request(`/api/procurement/${id}/complete`, {
        method: 'PUT',
        body: JSON.stringify({ items: items || [] }),
      }),
    addItem: (requestId, data) =>
      request(`/api/procurement/${requestId}/items`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateItem: (itemId, data) =>
      request(`/api/procurement/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteItem: (itemId) =>
      request(`/api/procurement/items/${itemId}`, { method: 'DELETE' }),
    updateStatus: (requestId, status) =>
      request(`/api/procurement/${requestId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },
  purchase: {
    documentsList: () => request('/api/purchase/documents'),
    documentsFromChain: (chain_ids) =>
      request('/api/purchase/documents/from-chain', {
        method: 'POST',
        body: JSON.stringify({ chain_ids }),
      }),
    documentPatch: (id, body) =>
      request(`/api/purchase/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  cutting: {
    getTaskById: (id) => request(`/api/cutting/tasks/${id}`),
    tasks: (cuttingType) =>
      request(`/api/cutting/tasks${cuttingType ? `?cutting_type=${encodeURIComponent(cuttingType)}` : ''}`),
    addTask: (data) =>
      request('/api/cutting/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTask: (id, data) =>
      request(`/api/cutting/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteTask: (id) =>
      request(`/api/cutting/tasks/${id}`, { method: 'DELETE' }),
    complete: (data) =>
      request('/api/cutting/complete', { method: 'POST', body: JSON.stringify(data) }),
    sendToSewing: (data) =>
      request('/api/cutting/send-to-sewing', { method: 'POST', body: JSON.stringify(data) }),
    factsByOrder: (order_ids) =>
      request(`/api/cutting/facts-by-order${order_ids ? `?order_ids=${encodeURIComponent(order_ids)}` : ''}`),
    documentsList: () => request('/api/cutting/documents'),
    documentsFromChain: (chain_ids) =>
      request('/api/cutting/documents/from-chain', {
        method: 'POST',
        body: JSON.stringify({ chain_ids }),
      }),
    documentPatch: (id, body) =>
      request(`/api/cutting/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    documentFactsList: (docId) => request(`/api/cutting/documents/${docId}/facts`),
    documentFactCreate: (docId, body) =>
      request(`/api/cutting/documents/${docId}/facts`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    factPatch: (factId, body) =>
      request(`/api/cutting/facts/${factId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    factDelete: (factId) => request(`/api/cutting/facts/${factId}`, { method: 'DELETE' }),
    syncToSewing: () =>
      request('/api/cutting/sync-to-sewing', {
        method: 'POST',
      }),
  },
  warehouse: {
    items: () => request('/api/warehouse/items'),
    addItem: (data) =>
      request('/api/warehouse/items', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addMovement: (data) =>
      request('/api/warehouse/movements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    movements: (params) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/warehouse/movements${q ? `?${q}` : ''}`);
    },
  },
  // Склад по размерам/партиям (ОТК → склад → отгрузка), без ручного ввода
  warehouseStock: {
    batchesPendingQc: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/warehouse-stock/batches/pending-qc${qs ? `?${qs}` : ''}`);
    },
    batchById: (id) => request(`/api/warehouse-stock/batches/${id}`),
    postQcBatch: (data) =>
      request('/api/warehouse-stock/qc/batch', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // qc/pending удалён; очередь ОТК только через batchesPendingQc (batches/pending-qc)
    qc: (orderId) => request(`/api/warehouse-stock/qc?order_id=${orderId}`),
    postQc: (data) =>
      request('/api/warehouse-stock/qc', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    stock: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/warehouse-stock/stock${q ? `?${q}` : ''}`);
    },
    shipments: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/warehouse-stock/shipments${q ? `?${q}` : ''}`);
    },
    postShipment: (data) =>
      request('/api/warehouse-stock/shipments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ship: (warehouseStockId, qty) =>
      request('/api/warehouse-stock/ship', {
        method: 'POST',
        body: JSON.stringify({ warehouse_stock_id: warehouseStockId, qty }),
      }),
    completeShipment: (id) =>
      request(`/api/warehouse-stock/shipments/${id}/complete`, { method: 'POST' }),
    otkChainItems: () => request('/api/warehouse-stock/otk-chain/items'),
    otkChainSummary: () => request('/api/warehouse-stock/otk-chain/summary'),
    patchOtkChainItem: (id, body) =>
      request(`/api/warehouse-stock/otk-chain/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  // sewing-plans отключён; партии создаются только через Пошив → «Завершить пошив → ОТК»
  sewingPlans: {
    finishBatch: () => Promise.reject(new Error('Используйте «Завершить пошив → ОТК» на странице Пошив')),
  },
  sizes: {
    list: () => request('/api/sizes'),
    add: (name) =>
      request('/api/sizes', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  workshops: {
    list: (all) => request(`/api/workshops${all ? '?all=1' : ''}`),
    add: (data) =>
      request('/api/workshops', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`/api/workshops/${id}`, { method: 'DELETE' }),
  },
  references: {
    floors: (limit) =>
      request(`/api/references/floors${limit ? `?limit=${limit}` : ''}`),
    buildingFloors: (limit) =>
      request(`/api/references/building-floors${limit ? `?limit=${limit}` : ''}`),
    addBuildingFloor: (name) =>
      request('/api/references/building-floors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    deleteBuildingFloor: (id) =>
      request(`/api/references/building-floors/${id}`, { method: 'DELETE' }),
    addFloor: (name) =>
      request('/api/references/floors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    deleteFloor: (id) =>
      request(`/api/references/floors/${id}`, { method: 'DELETE' }),
    colors: (search) =>
      request(`/api/references/colors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    addColor: (name) =>
      request('/api/references/colors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    clients: () => request('/api/references/clients'),
    addClient: (name) =>
      request('/api/references/clients', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    deleteClient: (id) =>
      request(`/api/references/clients/${id}`, { method: 'DELETE' }),
    operations: () => request('/api/references/operations'),
    addOperation: (data) =>
      request('/api/references/operations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteOperation: (id) =>
      request(`/api/references/operations/${id}`, { method: 'DELETE' }),
    orderStatus: () => request('/api/references/order-status'),
    cuttingTypes: (all) =>
      request(`/api/references/cutting-types${all ? '?all=1' : ''}`),
    addCuttingType: (name) =>
      request('/api/references/cutting-types', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    updateCuttingType: (id, data) =>
      request(`/api/references/cutting-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteCuttingType: (id) =>
      request(`/api/references/cutting-types/${id}`, { method: 'DELETE' }),
  },
};

export default api;
