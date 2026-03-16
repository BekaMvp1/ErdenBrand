/**
 * Страница отгрузок. Отгрузка по партиям и размерам.
 * Остатки группируются по партии; отгрузка создаётся по партии с указанием количества по каждому размеру.
 * Нельзя отгрузить больше, чем есть на складе по партии и размеру.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

const SHIPMENTS_MODAL_KEY = 'shipments_modal_batch';
const SHIPMENTS_WORKSHOP_KEY = 'shipments_workshop_id';
import { createPortal } from 'react-dom';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import { NeonButton, NeonCard, NeonInput } from '../components/ui';
import ModelPhoto from '../components/ModelPhoto';

export default function Shipments() {
  const [stock, setStock] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState(() => {
    try { return sessionStorage.getItem(SHIPMENTS_WORKSHOP_KEY) || ''; } catch { return ''; }
  });
  const [modalBatch, setModalBatch] = useState(null);
  const [modalLegacy, setModalLegacy] = useState(null);
  const [shipQty, setShipQty] = useState('');
  const [formItems, setFormItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completingId, setCompletingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = workshopId ? { workshop_id: workshopId } : {};
    Promise.all([api.warehouseStock.stock(params), api.warehouseStock.shipments(params)])
      .then(([s, sh]) => {
        setStock(s);
        setShipments(sh);
      })
      .catch(() => {
        setStock([]);
        setShipments([]);
      })
      .finally(() => setLoading(false));
  }, [workshopId]);

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(SHIPMENTS_WORKSHOP_KEY, workshopId || ''); } catch (_) {}
  }, [workshopId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCompleteShipment = useCallback(async (shipmentId) => {
    setCompletingId(shipmentId);
    setError('');
    try {
      await api.warehouseStock.completeShipment(shipmentId);
      await load();
    } catch (err) {
      setError(err.message || err.error || 'Ошибка завершения отгрузки');
    } finally {
      setCompletingId(null);
    }
  }, [load]);

  const modelName = (row) =>
    row.Order?.model_name || row.Order?.title || `#${row.order_id}`;
  const sizeName = (row) =>
    row.size_name ?? row.ModelSize?.Size?.name ?? row.Size?.name ?? (row.model_size_id ? `#${row.model_size_id}` : '—');
  const batchCode = (row) => row.batch_code ?? row.batch ?? '—';
  const formatQty = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? String(Math.round(n)) : '0';
  };

  // Группировка остатков по партии (batch_id или batch для легаси)
  const stockByBatch = () => {
    const byBatch = new Map();
    stock.forEach((row) => {
      const key = row.batch_id != null ? `b-${row.batch_id}` : `legacy-${row.order_id}-${row.batch}`;
      if (!byBatch.has(key)) {
        byBatch.set(key, {
          batch_id: row.batch_id,
          batch_code: batchCode(row),
          order_id: row.order_id,
          modelName: modelName(row),
          rows: [],
        });
      }
      byBatch.get(key).rows.push(row);
    });
    return Array.from(byBatch.values());
  };

  const orderLabel = (row) => modelName(row) || `#${row.order_id}`;
  const workshopName = (row) => row.Order?.Workshop?.name || '';
  const tzCode = (row) => row.Order?.tz_code || '';
  const plannedQty = (row) => row.Order?.total_quantity ?? row.Order?.quantity ?? 0;

  const stockByOrder = useMemo(() => {
    const byOrder = new Map();
    stock.forEach((row) => {
      const key = row.order_id;
      const label = orderLabel(row);
      const tz = tzCode(row);
      const plan = plannedQty(row);
      const photo = row.Order?.photos?.[0];
      if (!byOrder.has(key)) byOrder.set(key, { order_id: key, label, tz, plan, photo, rows: [] });
      byOrder.get(key).rows.push(row);
    });
    return Array.from(byOrder.values());
  }, [stock]);

  const shipmentsByOrder = useMemo(() => {
    const byOrder = new Map();
    shipments.forEach((row) => {
      const oid = row.order_id ?? row.SewingBatch?.order_id ?? row.id;
      const label = row.Order?.model_name || row.Order?.title || `#${oid}`;
      const tz = row.Order?.tz_code || '';
      const plan = row.Order?.total_quantity ?? row.Order?.quantity ?? 0;
      const photo = row.Order?.photos?.[0];
      if (!byOrder.has(oid)) byOrder.set(oid, { order_id: oid, label, tz, plan, photo, rows: [] });
      byOrder.get(oid).rows.push(row);
    });
    return Array.from(byOrder.values());
  }, [shipments]);

  const openModalBatch = useCallback((group) => {
    setModalBatch(group);
    let byId = {};
    try {
      const stored = sessionStorage.getItem(`${SHIPMENTS_MODAL_KEY}_${group.batch_id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const it of parsed) byId[it.id] = it.qty;
      }
    } catch (_) {}
    const initial = group.rows.map((r) => ({
      id: r.id,
      warehouse_stock_id: r.id,
      model_size_id: r.model_size_id,
      size_name: sizeName(r),
      available: Number(r.qty) || 0,
      qty: byId[r.id] ?? 0,
    }));
    setFormItems(initial);
    setError('');
  }, []);

  const openModalLegacy = (row) => {
    setModalLegacy(row);
    setShipQty(String(row.qty ?? 0));
    setError('');
  };

  const handleChangeBatchItem = (itemId, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setFormItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== itemId) return it;
        return { ...it, qty: Math.min(num, it.available) };
      });
      if (modalBatch?.batch_id) {
        try {
          sessionStorage.setItem(`${SHIPMENTS_MODAL_KEY}_${modalBatch.batch_id}`, JSON.stringify(next.map((it) => ({ id: it.id, qty: it.qty }))));
        } catch (_) {}
      }
      return next;
    });
  };

  const handleShipBatch = async (e) => {
    e.preventDefault();
    if (!modalBatch?.batch_id) return;
    const items = formItems
      .filter((it) => it.qty > 0)
      .map((it) => (it.warehouse_stock_id ? { warehouse_stock_id: it.warehouse_stock_id, qty: it.qty } : { model_size_id: it.model_size_id, qty: it.qty }));
    if (items.length === 0) {
      setError('Укажите количество хотя бы по одному размеру');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.warehouseStock.postShipment({
        batch_id: modalBatch.batch_id,
        items,
      });
      try {
        sessionStorage.removeItem(`${SHIPMENTS_MODAL_KEY}_${modalBatch.batch_id}`);
      } catch (_) {}
      setModalBatch(null);
      load();
    } catch (err) {
      setError(err.message || 'Ошибка отгрузки');
    } finally {
      setSaving(false);
    }
  };

  const handleShipLegacy = async (e) => {
    e.preventDefault();
    if (!modalLegacy) return;
    const qty = parseInt(shipQty, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      setError('Введите количество больше 0');
      return;
    }
    if (qty > (modalLegacy.qty ?? 0)) {
      setError('Нельзя отгрузить больше, чем есть на складе');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.warehouseStock.postShipment({
        order_id: modalLegacy.order_id,
        model_size_id: modalLegacy.model_size_id,
        batch: modalLegacy.batch,
        qty,
      });
      setModalLegacy(null);
      load();
    } catch (err) {
      setError(err.message || 'Ошибка отгрузки');
    } finally {
      setSaving(false);
    }
  };

  const batches = stockByBatch();

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-neon-text">Отгрузка</h1>
        <div className="flex items-center gap-3">
          <select
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-accent-2/80 border border-white/25 text-neon-text min-w-[160px]"
          >
            <option value="">Все цеха</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <PrintButton />
        </div>
      </div>
      <p className="text-sm text-neon-muted mb-4">
        Отгрузка по партиям и размерам. Выберите партию и укажите количество по каждому размеру. Нельзя отгрузить больше остатка по партии.
      </p>

      <NeonCard className="rounded-card overflow-hidden p-0 mb-6">
        <div className="px-4 py-3 border-b border-white/20 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-neon-text">Остатки на складе</h2>
          {!loading && batches.filter((b) => b.batch_id != null).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neon-muted">Отгрузить по партии:</span>
              {batches.filter((b) => b.batch_id != null).map((group) => (
                <button
                  key={group.batch_code}
                  type="button"
                  onClick={() => openModalBatch(group)}
                  className="px-3 py-1.5 rounded-lg bg-primary-600/80 text-white text-sm hover:bg-primary-600"
                >
                  {group.batch_code}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-neon-muted">Загрузка...</div>
        ) : stock.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет остатков</div>
        ) : (
          <div className="divide-y divide-white/10">
            {stockByOrder.map(({ order_id, label, tz, plan, photo, rows }) => (
              <div key={order_id} className="p-4 first:pt-4">
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-white/20">
                  <ModelPhoto photo={photo} modelName={tz ? `${tz} — ${label}` : label} size={64} />
                  {plan > 0 && <span className="text-neon-muted font-normal">План: {plan}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="bg-accent-3/80 border-b border-white/25">
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Партия</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Размер</th>
                        <th className="text-right px-4 py-2 text-sm font-medium text-neon-text">Остаток</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-b border-white/15">
                          <td className="px-4 py-2 text-neon-text">{batchCode(row)}</td>
                          <td className="px-4 py-2 text-neon-text">{sizeName(row)}</td>
                          <td className="px-4 py-2 text-right font-medium">{row.qty ?? 0}</td>
                          <td className="px-4 py-2 text-neon-muted text-sm">
                            {row.batch_id != null ? '—' : (
                              <button
                                type="button"
                                onClick={() => openModalLegacy(row)}
                                disabled={!(row.qty > 0)}
                                className="text-primary-400 hover:underline disabled:opacity-50"
                              >
                                Отгрузить
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </NeonCard>

      <NeonCard className="rounded-card overflow-hidden p-0">
        <h2 className="px-4 py-3 text-lg font-medium text-neon-text border-b border-white/20">История отгрузок</h2>
        {shipments.length === 0 ? (
          <div className="p-8 text-neon-muted">Нет отгрузок</div>
        ) : (
          <div className="divide-y divide-white/10">
            {shipmentsByOrder.map(({ order_id, label, tz, plan, photo, rows }) => (
              <div key={order_id} className="p-4 first:pt-4">
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-white/20">
                  <ModelPhoto photo={photo} modelName={tz ? `${tz} — ${label}` : label} size={64} />
                  <div className="flex flex-col text-xs text-neon-muted">
                    {plan > 0 && <span>План: {plan}</span>}
                    {rows?.[0]?.Order?.Workshop?.name && (
                      <span>Цех: {rows[0].Order.Workshop.name}</span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="bg-accent-3/80 border-b border-white/25">
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Дата</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Партия</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text">Размер / Кол-во</th>
                        <th className="text-right px-4 py-2 text-sm font-medium text-neon-text">Итого</th>
                        <th className="text-left px-4 py-2 text-sm font-medium text-neon-text no-print">Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const batchCodeVal = row.SewingBatch?.batch_code ?? row.batch ?? '—';
                        const hasItems = row.ShipmentItems?.length > 0;
                        const isCompleted = String(row.status || '').toLowerCase() === 'completed';
                        return (
                          <tr key={row.id} className="border-b border-white/15">
                            <td className="px-4 py-2 text-neon-text">
                              {row.shipped_at ? new Date(row.shipped_at).toLocaleDateString('ru-RU') : '—'}
                            </td>
                            <td className="px-4 py-2 text-neon-text">{batchCodeVal}</td>
                            <td className="px-4 py-2 text-neon-text">
                              {hasItems
                                ? row.ShipmentItems.map((it) => {
                                    const sizeLabel =
                                      it.ModelSize?.Size?.name ??
                                      it.Size?.name ??
                                      (it.model_size_id != null
                                        ? `#${it.model_size_id}`
                                        : it.size_id != null
                                        ? `#${it.size_id}`
                                        : '—');
                                    return (
                                      <div
                                        key={it.id ?? `${sizeLabel}-${it.qty}`}
                                        className="text-neon-text"
                                      >
                                        {sizeLabel} | {formatQty(it.qty)}
                                      </div>
                                    );
                                  })
                                : (
                                  <span className="text-neon-text">
                                    {row.ModelSize?.Size?.name ?? '—'} | {formatQty(row.qty)}
                                  </span>
                                )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {hasItems
                                ? formatQty(row.ShipmentItems.reduce((s, it) => s + (Number(it.qty) || 0), 0))
                                : formatQty(row.qty)}
                            </td>
                            <td className="px-4 py-2 no-print">
                              {isCompleted ? (
                                <span className="text-green-400 text-sm">✓ Завершено</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCompleteShipment(row.id)}
                                  disabled={completingId === row.id}
                                  className="text-sm px-3 py-1.5 rounded-lg bg-green-600/80 text-white hover:bg-green-600 disabled:opacity-50"
                                >
                                  {completingId === row.id ? '...' : 'Завершить отгрузку'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </NeonCard>

      {modalBatch?.batch_id &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
            onClick={() => !saving && setModalBatch(null)}
          >
            <div
              className="bg-neon-bg2 border border-neon-border rounded-card p-6 max-w-md w-full shadow-xl my-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-neon-text mb-2">Отгрузка партии {modalBatch.batch_code}</h3>
              <p className="text-sm text-neon-muted mb-4">{modalBatch.modelName}</p>
              <form onSubmit={handleShipBatch} className="space-y-3">
                {formItems.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2">
                    <span className="text-neon-text">{it.size_name}</span>
                    <span className="text-neon-muted text-sm">доступно: {it.available}</span>
                    <NeonInput
                      type="number"
                      min={0}
                      max={it.available}
                      className="w-24"
                      value={it.qty}
                      onChange={(e) => handleChangeBatchItem(it.id, e.target.value)}
                    />
                  </div>
                ))}
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2 pt-2">
                  <NeonButton type="submit" disabled={saving}>
                    {saving ? 'Сохранение...' : 'Отгрузить'}
                  </NeonButton>
                  <NeonButton type="button" variant="secondary" onClick={() => setModalBatch(null)} disabled={saving}>
                    Отмена
                  </NeonButton>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {modalLegacy &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !saving && setModalLegacy(null)}
          >
            <div
              className="bg-neon-bg2 border border-neon-border rounded-card p-6 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-neon-text mb-2">Отгрузка</h3>
              <p className="text-sm text-neon-muted mb-1">
                {modelName(modalLegacy)} — {sizeName(modalLegacy)}, партия {modalLegacy.batch}
              </p>
              <p className="text-sm text-neon-muted mb-4">Доступно: {modalLegacy.qty ?? 0} шт.</p>
              <form onSubmit={handleShipLegacy} className="space-y-4">
                <div>
                  <label className="block text-sm text-neon-muted mb-1">Количество (шт)</label>
                  <NeonInput
                    type="number"
                    min={1}
                    max={modalLegacy.qty ?? 0}
                    value={shipQty}
                    onChange={(e) => setShipQty(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <NeonButton type="submit" disabled={saving}>
                    {saving ? 'Сохранение...' : 'Отгрузить'}
                  </NeonButton>
                  <NeonButton type="button" variant="secondary" onClick={() => setModalLegacy(null)} disabled={saving}>
                    Отмена
                  </NeonButton>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}