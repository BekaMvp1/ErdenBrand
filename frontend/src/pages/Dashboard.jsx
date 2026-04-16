/**
 * Dashboard — таблица заказов
 * Заголовок по центру, фильтр статусов, поиск по клиенту и названию (debounce 300ms)
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';
import { NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';
import ModelPhoto from '../components/ModelPhoto';

const STATUS_COLORS = {
  Принят: 'bg-gray-500/20 text-gray-900 dark:text-gray-100',
  'В работе': 'bg-lime-500/20 text-lime-400',
  Готов: 'bg-green-500/20 text-green-400',
  Просрочен: 'bg-red-500/20 text-red-400',
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orderPhotoRaw(order) {
  const p = order.photos?.[0];
  if (typeof p === 'string' && p.trim()) return p.trim();
  if (p && typeof p === 'object' && typeof p.url === 'string' && p.url.trim()) return p.url.trim();
  if (typeof order.image_url === 'string' && order.image_url.trim()) return order.image_url.trim();
  return null;
}

function orderStatusName(order) {
  return order.OrderStatus?.name || '';
}

/** Колонка «Дата поступления»: receipt_date, иначе дата создания записи */
function formatOrderReceiptColumn(order) {
  const raw = order?.receipt_date || order?.created_at;
  if (!raw) return '—';
  const s = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}.${m}.${y}`;
  }
  try {
    return new Date(raw).toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}

function isOrderDoneByStatus(order) {
  const n = String(orderStatusName(order)).trim();
  return n === 'Готов';
}

function isOrderOverdueForPrint(order) {
  const d = order.deadline;
  if (!d) return false;
  const today = new Date().toISOString().slice(0, 10);
  const dd = String(d).slice(0, 10);
  if (dd >= today) return false;
  return !isOrderDoneByStatus(order);
}

/** Бейдж печати: классы s-* как в шаблоне таблицы */
function printTableStatus(order) {
  const n = String(orderStatusName(order)).trim();
  if (n === 'Готов') return { label: 'Выполнен', cls: 's-done' };
  if (n === 'В работе') return { label: 'В работе', cls: 's-active' };
  if (n === 'Принят') return { label: 'Принят', cls: 's-accepted' };
  return { label: n || 'Принят', cls: 's-default' };
}

function isOrderActiveOrAccepted(order) {
  const n = String(orderStatusName(order)).trim();
  return n === 'В работе' || n === 'Принят';
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === orders.length && orders.length > 0) {
        return new Set();
      }
      return new Set(orders.map((o) => o.id));
    });
  }, [orders]);

  const loadStatuses = useCallback(async () => {
    try {
      const data = await api.references.orderStatus();
      setStatuses(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter) params.status_id = statusFilter;
      if (searchTerm) params.search = searchTerm;
      const data = await api.orders.list(params);
      const list = Array.isArray(data) ? data : (data?.rows ?? data?.data ?? data?.orders ?? []);
      setOrders(list);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Ошибка загрузки заказов');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Автообновление при возврате в приложение (телефон, другая вкладка)
  useRefreshOnVisible(loadOrders);

  // Debounce поиска 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearchTerm('');
  }, []);

  const printOrders = useCallback(async () => {
    if (orders.length === 0) return;
    const ordersToPrint =
      selectMode && selectedIds.size > 0
        ? orders.filter((o) => selectedIds.has(o.id))
        : orders;
    if (ordersToPrint.length === 0) return;

    setIsPrinting(true);
    const today = new Date();
    try {
      const toBase64 = async (url) => {
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
      };

      const ordersWithPhotos = await Promise.all(
        ordersToPrint.map(async (order) => ({
          ...order,
          photoBase64: await toBase64(orderPhotoRaw(order)),
        }))
      );

      const totalQtySum = ordersWithPhotos.reduce(
        (s, o) => s + (Number(o.quantity) || Number(o.qty_order) || 0),
        0
      );
      const overdueCount = ordersWithPhotos.filter((o) => isOrderOverdueForPrint(o)).length;
      const doneCount = ordersWithPhotos.filter((o) => isOrderDoneByStatus(o)).length;
      const inWorkCount = ordersWithPhotos.filter((o) => isOrderActiveOrAccepted(o)).length;

      const tbodyHtml = ordersWithPhotos
        .map((order, idx) => {
          const planQty = Number(order.quantity) || Number(order.qty_order) || 0;
          const overdue = isOrderOverdueForPrint(order);
          const st = printTableStatus(order);
          const orderDate = order.receipt_date || order.created_at || order.order_date || order.date;
          const deadlineDate = order.deadline || order.due_date;
          const receiptStr = orderDate
            ? escapeHtml(new Date(orderDate).toLocaleDateString('ru-RU'))
            : '—';
          const deadlineStr = deadlineDate
            ? escapeHtml(new Date(deadlineDate).toLocaleDateString('ru-RU'))
            : '—';
          const workshop = escapeHtml(
            order.Workshop?.name ||
              order.Floor?.name ||
              order.workshop_name ||
              order.sewing_workshop ||
              '—'
          );
          const clientName = escapeHtml(order.Client?.name || order.client_name || '—');
          const title = escapeHtml(order.title || order.model_name || '—');
          const tzCell = escapeHtml(
            String(order.article || order.color || order.tz_code || order.id || '—')
          );
          const thumbFallback = escapeHtml(
            String(order.article || order.color || order.tz_code || '?').slice(0, 4)
          );

          const photoHtml = order.photoBase64
            ? `<img src="${order.photoBase64}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:4px;border:1px solid #ddd">`
            : `<div style="width:38px;height:38px;background:#e8eaf6;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#3949ab;font-weight:700;border:1px solid #c5cae9">${thumbFallback}</div>`;

          return `<tr>
          <td class="col-num">${idx + 1}</td>
          <td class="col-photo">${photoHtml}</td>
          <td class="col-tz">${tzCell}</td>
          <td class="col-name"><div class="name-main">${title}</div></td>
          <td class="col-client">${clientName}</td>
          <td class="col-qty">${planQty} шт</td>
          <td class="col-date">${receiptStr}</td>
          <td class="col-deadline${overdue ? ' overdue' : ''}">${deadlineStr}${overdue ? ' ⚠' : ''}</td>
          <td class="col-status"><span class="status-badge ${st.cls}">${escapeHtml(st.label)}</span></td>
          <td class="col-workshop">${workshop}</td>
        </tr>`;
        })
        .join('');

      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Заказы ERDEN</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #000; padding: 6mm; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 2px solid #1a237e; }
    .page-title { font-size: 16px; font-weight: 700; color: #1a237e; }
    .page-meta { font-size: 10px; color: #666; margin-top: 3px; }
    .brand { font-size: 20px; font-weight: 700; color: #1a237e; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead tr { background: #1a237e; color: #fff; }
    thead th { padding: 6px 8px; text-align: left; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; border-right: 0.5px solid rgba(255,255,255,0.2); white-space: nowrap; }
    thead th:last-child { border-right: none; }
    tbody tr { border-bottom: 0.5px solid #e0e0e0; break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f9f9f9; }
    tbody tr:hover { background: #f0f0f0; }
    td { padding: 5px 8px; vertical-align: middle; border-right: 0.5px solid #eee; }
    td:last-child { border-right: none; }
    .col-num { width: 30px; text-align: center; color: #999; font-size: 9px; }
    .col-photo { width: 44px; text-align: center; }
    .col-tz { width: 70px; font-weight: 700; color: #1a237e; font-size: 10px; }
    .col-name { min-width: 140px; }
    .name-main { font-weight: 600; font-size: 10px; }
    .col-client { width: 80px; color: #1a237e; font-weight: 600; }
    .col-qty { width: 55px; text-align: right; font-weight: 700; font-size: 11px; }
    .col-date { width: 80px; font-size: 9px; }
    .col-deadline { width: 80px; font-size: 9px; }
    .col-status { width: 70px; text-align: center; }
    .col-workshop { width: 80px; font-size: 9px; }
    .status-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; }
    .s-accepted { background:#e8f5e9; color:#2e7d32; }
    .s-active { background:#e3f2fd; color:#1565c0; }
    .s-done { background:#ede7f6; color:#4527a0; }
    .s-default { background:#f5f5f5; color:#666; }
    .overdue { color:#c62828; font-weight:700; }
    .summary { display: flex; gap: 24px; padding: 8px 10px; background: #e8eaf6; border-top: 2px solid #1a237e; margin-top: 6px; border-radius: 0 0 4px 4px; }
    .sum-item { display: flex; flex-direction: column; gap: 1px; }
    .sum-label { font-size: 8px; color: #888; text-transform: uppercase; }
    .sum-value { font-weight: 700; font-size: 13px; }
    .signatures { display: flex; gap: 32px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #ccc; }
    .sig-line { border-bottom: 1px solid #000; height: 18px; margin-bottom: 3px; }
    .sig-label { font-size: 9px; color: #777; }
    @media print { body { padding: 4mm; } @page { margin: 8mm; size: A4 landscape; } }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="page-title">СПИСОК ЗАКАЗОВ</div>
      <div class="page-meta">
        Дата: ${escapeHtml(today.toLocaleDateString('ru-RU'))} &nbsp;·&nbsp;
        Всего заказов: ${ordersWithPhotos.length} &nbsp;·&nbsp;
        Общее кол-во: ${totalQtySum} шт
      </div>
    </div>
    <div class="brand">ERDEN</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-num">№</th>
        <th class="col-photo">Фото</th>
        <th class="col-tz">ТЗ</th>
        <th class="col-name">Название</th>
        <th class="col-client">Клиент</th>
        <th class="col-qty">Кол-во</th>
        <th class="col-date">Дата поступления</th>
        <th class="col-deadline">Дедлайн</th>
        <th class="col-status">Статус</th>
        <th class="col-workshop">Цех пошива</th>
      </tr>
    </thead>
    <tbody>
      ${tbodyHtml}
    </tbody>
  </table>
  <div class="summary">
    <div class="sum-item"><span class="sum-label">Всего заказов</span><span class="sum-value">${ordersWithPhotos.length}</span></div>
    <div class="sum-item"><span class="sum-label">Общее количество</span><span class="sum-value">${totalQtySum} шт</span></div>
    <div class="sum-item"><span class="sum-label">Просрочено</span><span class="sum-value" style="color:#c62828">${overdueCount}</span></div>
    <div class="sum-item"><span class="sum-label">Выполнено</span><span class="sum-value" style="color:#2e7d32">${doneCount}</span></div>
    <div class="sum-item"><span class="sum-label">В работе</span><span class="sum-value" style="color:#1565c0">${inWorkCount}</span></div>
  </div>
  <div class="signatures">
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Менеджер</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Руководитель</div></div>
    <div style="flex:1"><div class="sig-line"></div><div class="sig-label">Дата</div></div>
  </div>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 800);
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setIsPrinting(false);
    }
  }, [orders, selectMode, selectedIds]);

  const handleDelete = async (e, orderId) => {
    e.preventDefault();
    e.stopPropagation();
    const tz = orders.find((o) => o.id === orderId)?.tz_code || orderId;
    if (!confirm(`Удалить заказ ТЗ ${tz}? Данные будут удалены безвозвратно.`)) return;
    setDeletingId(orderId);
    try {
      await api.orders.delete(orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      alert(err.message || 'Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = user?.role === 'admin' || user?.role === 'manager';
  const canEdit = !!user;

  return (
    <div className="text-neon-text">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 md:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Заказы</h1>
          <div className="no-print flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectMode((m) => {
                  if (m) setSelectedIds(new Set());
                  return !m;
                });
              }}
              style={{
                padding: '8px 14px',
                background: selectMode ? 'rgba(200,255,0,0.15)' : 'transparent',
                border: `0.5px solid ${selectMode ? '#c8ff00' : '#444'}`,
                color: selectMode ? '#c8ff00' : '#888',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ☑ {selectMode ? 'Отмена выбора' : 'Выбрать'}
            </button>
            {selectMode && (
              <button
                type="button"
                onClick={toggleSelectAll}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '0.5px solid #444',
                  color: '#888',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {selectedIds.size === orders.length && orders.length > 0 ? 'Снять все' : 'Выбрать все'}
              </button>
            )}
            {selectMode && selectedIds.size > 0 && (
              <span className="text-[13px]" style={{ color: '#c8ff00' }}>
                Выбрано: {selectedIds.size}
              </span>
            )}
            <button
              type="button"
              onClick={() => printOrders()}
              disabled={isPrinting || loading || orders.length === 0}
              className="font-semibold text-white disabled:cursor-not-allowed"
              style={{
                padding: '8px 18px',
                background: '#1a237e',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: isPrinting || loading || orders.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: isPrinting ? 0.7 : 1,
              }}
              title="Печать: все заказы или только отмеченные в режиме выбора"
            >
              {isPrinting ? '⏳ Подготовка...' : '🖨 Печать'}
              {selectMode && selectedIds.size > 0 && (
                <span
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    padding: '1px 6px',
                    borderRadius: 3,
                    fontSize: 11,
                  }}
                >
                  {selectedIds.size}
                </span>
              )}
            </button>
          </div>
          <NeonButton
            type="button"
            onClick={() => loadOrders()}
            disabled={loading}
            variant="secondary"
            className="p-2"
            title="Обновить список"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </NeonButton>
        </div>
        <div className="flex-1 flex justify-center items-center gap-2 max-w-md w-full sm:w-auto sm:mx-auto">
          <NeonInput
            type="text"
            placeholder="Просто поиск"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
          <NeonButton
            type="button"
            onClick={clearSearch}
            variant="secondary"
            className="p-2"
            title="Очистить"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </NeonButton>
          )}
        </div>
        {statuses.length > 0 && (
          <NeonSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="shrink-0"
          >
            <option value="">Все статусы</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NeonSelect>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-between gap-3">
          <span>{error}</span>
          <NeonButton type="button" onClick={() => loadOrders()} variant="secondary" className="shrink-0">
            Повторить
          </NeonButton>
        </div>
      )}

      <NeonCard className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 md:p-8 text-center text-neon-muted">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="p-6 md:p-8 text-center text-neon-muted">
            {error ? 'Не удалось загрузить заказы' : 'Нет заказов'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                {selectMode && (
                  <th className="w-10 px-2 py-3 text-center text-sm font-medium text-neon-muted">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === orders.length && orders.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 cursor-pointer"
                      style={{ accentColor: '#c8ff00' }}
                      title="Выбрать все"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">ТЗ</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Название</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Клиент</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Кол-во</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Дата поступления заказа</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Дедлайн</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted">Статус</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-neon-muted hidden lg:table-cell">Цех пошива</th>
                {(canEdit || canDelete) && <th className="w-24 px-4 py-3 text-neon-muted">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  role={selectMode ? undefined : 'button'}
                  tabIndex={selectMode ? -1 : 0}
                  onClick={(e) => {
                    if (selectMode) {
                      if (e.target.closest('input, a, button')) return;
                      toggleSelect(order.id);
                    } else {
                      navigate(`/orders/${order.id}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!selectMode && e.key === 'Enter') navigate(`/orders/${order.id}`);
                  }}
                  className={`border-b border-white/10 transition-colors duration-300 ease-out ${
                    selectMode ? 'cursor-pointer' : 'hover:bg-white/5 cursor-pointer'
                  }`}
                  style={{
                    borderBottom: '0.5px solid rgba(26,26,26,0.6)',
                    ...(selectedIds.has(order.id)
                      ? {
                          background: 'rgba(200,255,0,0.06)',
                          outline: '1px solid rgba(200,255,0,0.2)',
                          outlineOffset: -1,
                        }
                      : {}),
                  }}
                >
                  {selectMode && (
                    <td
                      className="w-10 px-2 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelect(order.id)}
                        className="h-4 w-4 cursor-pointer"
                        style={{ accentColor: '#c8ff00' }}
                        aria-label={`Выбрать заказ ${order.tz_code || order.id}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-primary-400">
                    {order.tz_code || order.id || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-neon-text"
                    onClick={selectMode ? (e) => e.stopPropagation() : undefined}
                  >
                    <ModelPhoto
                      photo={order.photos?.[0]}
                      modelName={order.title}
                      size={48}
                    />
                  </td>
                  <td className="px-4 py-3 text-neon-muted">{order.Client?.name}</td>
                  <td className="px-4 py-3 text-neon-muted">{order.quantity}</td>
                  <td className="px-4 py-3 text-neon-muted whitespace-nowrap hidden md:table-cell">
                    {formatOrderReceiptColumn(order)}
                  </td>
                  <td className="px-4 py-3 text-neon-muted whitespace-nowrap hidden md:table-cell">{order.deadline || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        STATUS_COLORS[order.OrderStatus?.name] || 'bg-accent-1/30 text-[#ECECEC]/90'
                      }`}
                    >
                      {order.OrderStatus?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neon-muted hidden lg:table-cell">{order.Workshop?.name || order.Floor?.name || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Link
                            to={`/orders/${order.id}`}
                            className="p-1.5 rounded text-primary-400 hover:bg-accent-1/30"
                            title="Редактировать"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, order.id)}
                            disabled={deletingId === order.id}
                            className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            title="Удалить"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
    </NeonCard>
    </div>
  );
}
