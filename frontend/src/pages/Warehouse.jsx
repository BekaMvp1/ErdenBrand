/**
 * Страница склада.
 * Остатки по размерам и партиям, сгруппированные по моделям. Отгрузка с проверкой ship_qty <= warehouse_qty.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import { useOrderProgress } from '../context/OrderProgressContext';
import PrintButton from '../components/PrintButton';
import NeonInput from '../components/ui/NeonInput';
import ModelPhoto from '../components/ModelPhoto';

const PAGE_BG = '#0f172a';
const CARD_BG = '#1e293b';
const BTN_PRIMARY = 'bg-green-600 hover:bg-green-500 text-white';
const BTN_SECONDARY = 'bg-blue-600 hover:bg-blue-500 text-white';
const WAREHOUSE_SHIP_INPUTS_KEY = 'warehouse_ship_inputs';
const WAREHOUSE_OTK_SHIP_KEY = 'warehouse_otk_ship_inputs';
const WAREHOUSE_WORKSHOP_KEY = 'warehouse_workshop_id';

function loadOtkShipInputs() {
  try {
    const s = sessionStorage.getItem(WAREHOUSE_OTK_SHIP_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

function saveOtkShipInputs(obj) {
  try {
    sessionStorage.setItem(WAREHOUSE_OTK_SHIP_KEY, JSON.stringify(obj));
  } catch (_) {}
}

function otkChainStatusLabel(status) {
  if (status === 'shipped') return { label: 'Отгружено', color: '#94a3b8' };
  if (status === 'partial') return { label: 'Частично отгружено', color: '#F59E0B' };
  return { label: 'На складе', color: '#22c55e' };
}

/** Матрица цвет × размер для блока склада по ОТК */
function OtkWarehouseMatrix({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const colors = [...new Set(list.map((i) => String(i.color ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru')
  );
  const sizes = [...new Set(list.map((i) => String(i.size ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru')
  );
  if (!colors.length || !sizes.length) return null;
  const getItem = (color, size) =>
    list.find((i) => String(i.color ?? '').trim() === color && String(i.size ?? '').trim() === size);
  return (
    <div className="px-3 py-2 overflow-x-auto border-b border-white/10">
      <div className="text-xs text-white/50 mb-2">Матрица цвет × размер</div>
      <table className="text-xs border-collapse" style={{ minWidth: 280 }}>
        <thead>
          <tr>
            <th className="text-left p-1 text-white/60">Цвет</th>
            {sizes.map((sz) => (
              <th key={sz} className="text-center p-1 px-2 text-white/70 min-w-[64px]">
                {sz}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colors.map((color) => (
            <tr key={color}>
              <td className="p-1 text-white/90 pr-2 whitespace-nowrap">{color}</td>
              {sizes.map((size) => {
                const it = getItem(color, size);
                if (!it) {
                  return (
                    <td key={size} className="p-1 text-center text-white/20">
                      —
                    </td>
                  );
                }
                const q = Math.max(0, parseInt(it.quantity, 10) || 0);
                const sh = Math.max(0, parseInt(it.shipped_qty, 10) || 0);
                const rest = Math.max(0, q - sh);
                return (
                  <td key={size} className="p-1 text-center align-top">
                    <div className="font-bold text-white">{q}</div>
                    <div style={{ color: rest > 0 ? '#c8ff00' : '#64748b', fontSize: 10 }}>ост {rest}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function loadShipInputs() {
  try {
    const s = sessionStorage.getItem(WAREHOUSE_SHIP_INPUTS_KEY);
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

function saveShipInputs(inputs) {
  try {
    sessionStorage.setItem(WAREHOUSE_SHIP_INPUTS_KEY, JSON.stringify(inputs));
  } catch (_) {}
}

export default function Warehouse() {
  const { refresh: refreshOrderProgress } = useOrderProgress();
  const [list, setList] = useState([]);
  const [kitOrders, setKitOrders] = useState([]);
  const [otkGroups, setOtkGroups] = useState([]);
  const [otkLoading, setOtkLoading] = useState(true);
  const [otkShipInputs, setOtkShipInputs] = useState(loadOtkShipInputs);
  const [otkShipping, setOtkShipping] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shipInputs, setShipInputs] = useState(loadShipInputs);
  const [shipping, setShipping] = useState(null);
  const [error, setError] = useState('');
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState(() => {
    try { return sessionStorage.getItem(WAREHOUSE_WORKSHOP_KEY) || ''; } catch { return ''; }
  });

  const loadOtkSummary = useCallback(() => {
    setOtkLoading(true);
    api.warehouseStock
      .otkChainSummary()
      .then((data) => setOtkGroups(Array.isArray(data) ? data : []))
      .catch(() => setOtkGroups([]))
      .finally(() => setOtkLoading(false));
  }, []);

  const load = () => {
    setLoading(true);
    setError('');
    const params = workshopId ? { workshop_id: workshopId } : {};
    api.warehouseStock
      .stock(params)
      .then((data) => {
        const rows = Array.isArray(data) ? data : (data?.rows ?? []);
        setList(rows);
        setKitOrders(Array.isArray(data) ? [] : (data?.kit_orders ?? []));
      })
      .catch(() => {
        setList([]);
        setKitOrders([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.workshops.list().then(setWorkshops).catch(() => setWorkshops([]));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(WAREHOUSE_WORKSHOP_KEY, workshopId || ''); } catch (_) {}
  }, [workshopId]);

  useEffect(() => {
    load();
  }, [workshopId]);

  useEffect(() => {
    loadOtkSummary();
  }, [loadOtkSummary]);

  const filteredOtkGroups = useMemo(() => {
    if (!workshopId) return otkGroups;
    return otkGroups.filter((g) => String(g.Order?.workshop_id ?? '') === String(workshopId));
  }, [otkGroups, workshopId]);

  const setOtkShipQty = (id, value) => {
    setOtkShipInputs((prev) => {
      const next = { ...prev, [id]: value };
      saveOtkShipInputs(next);
      return next;
    });
  };

  const handleOtkShipApply = async (item) => {
    const id = item.id;
    const qty = Math.max(0, parseInt(otkShipInputs[id], 10) || 0);
    const max = Math.max(0, parseInt(item.quantity, 10) || 0);
    setError('');
    if (qty > max) {
      setError(`Отгружено не может быть больше ${max} (на складе по строке)`);
      return;
    }
    setOtkShipping(id);
    try {
      await api.warehouseStock.patchOtkChainItem(id, { shipped_qty: qty });
      setOtkShipInputs((prev) => {
        const next = { ...prev };
        delete next[id];
        saveOtkShipInputs(next);
        return next;
      });
      loadOtkSummary();
      refreshOrderProgress();
    } catch (err) {
      setError(err.message || err.error || 'Ошибка сохранения отгрузки');
    } finally {
      setOtkShipping(null);
    }
  };

  const batchCode = (row) => row.batch_code ?? row.batch ?? `#${row.batch_id || row.id}`;
  const modelName = (row) => row.Order?.model_name || row.Order?.title || `#${row.order_id}`;
  const tzCode = (row) => row.Order?.tz_code || '';
  const plannedQty = (row) => row.Order?.total_quantity ?? row.Order?.quantity ?? 0;
  const sizeName = (row) => row.size_name ?? row.ModelSize?.Size?.name ?? row.Size?.name ?? row.model_size_id ?? '—';
  const warehouseQty = (row) => parseInt(row.qty, 10) || 0;

  const listByOrder = useMemo(() => {
    const byOrder = {};
    for (const row of list) {
      const key = row.order_id;
      if (!byOrder[key]) {
        byOrder[key] = {
          order_id: key,
          label: modelName(row),
          tz: tzCode(row),
          plan: plannedQty(row),
          photo: row.Order?.photos?.[0],
          rows: [],
        };
      }
      byOrder[key].rows.push(row);
    }
    return Object.values(byOrder);
  }, [list]);

  const setShipQty = (id, value) => {
    setShipInputs((prev) => {
      const next = { ...prev, [id]: value };
      saveShipInputs(next);
      return next;
    });
  };

  const handleShip = async (row) => {
    const id = row.id;
    const qty = parseInt(shipInputs[id], 10) || 0;
    const currentQty = warehouseQty(row);
    setError('');
    if (qty <= 0) {
      setError('Введите количество для отгрузки');
      return;
    }
    if (qty > currentQty) {
      setError(`Нельзя отгрузить больше ${currentQty}. На складе: ${currentQty}`);
      return;
    }
    const kitOrder = kitOrders.find((ko) => ko.order_id === row.order_id);
    if (kitOrder && qty > kitOrder.kit_qty) {
      setError(`Нельзя отгрузить больше ${kitOrder.kit_qty} комплектов (готово к отгрузке: ${kitOrder.kit_qty})`);
      return;
    }
    setShipping(id);
    try {
      await api.warehouseStock.ship(id, qty);
      setShipInputs((prev) => {
        const next = { ...prev };
        delete next[id];
        saveShipInputs(next);
        return next;
      });
      load();
    } catch (err) {
      setError(err.message || err.error || 'Ошибка отгрузки');
    } finally {
      setShipping(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>
      <div className="no-print flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 md:mb-6 px-3 md:px-6 lg:px-8 pt-2 sm:pt-4">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">Склад</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <select
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white w-full sm:min-w-[160px] sm:w-auto"
          >
            <option value="">Все цеха</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              load();
              loadOtkSummary();
            }}
            disabled={loading && otkLoading}
            className={`px-4 py-2 rounded-lg font-medium w-full sm:w-auto ${BTN_SECONDARY} disabled:opacity-50`}
          >
            Обновить
          </button>
          <PrintButton />
        </div>
      </div>

      <div className="px-3 md:px-6 lg:px-8 pb-6 md:pb-8 overflow-x-hidden">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        <div
          className="rounded-xl overflow-hidden border border-green-500/25 mb-6 print-area"
          style={{ background: CARD_BG }}
        >
          <div className="px-4 py-3 border-b border-green-500/25 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Склад по ОТК (план цеха)</h2>
            <div className="flex flex-wrap items-center gap-2">
              {import.meta.env.DEV ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const data = await api.otk.syncToWarehouse();
                      window.alert(`Синхронизировано: ${data?.synced ?? 0} строк`);
                      loadOtkSummary();
                      refreshOrderProgress();
                    } catch (e) {
                      window.alert(e?.message || 'Ошибка');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-white/70 hover:bg-white/10"
                >
                  [DEV] Синхронизировать со складом
                </button>
              ) : null}
            </div>
          </div>
          {otkLoading ? (
            <div className="p-8 text-center text-white/70">Загрузка остатков ОТК…</div>
          ) : filteredOtkGroups.length === 0 ? (
            <div className="p-8 text-white/70 text-sm">
              Нет позиций на складе по документам ОТК. Введите «принято» в модуле ОТК — количество появится здесь
              автоматически.
            </div>
          ) : (
            <div className="p-3 md:p-4 space-y-6">
              {filteredOtkGroups.map((group) => {
                const o = group.Order;
                const photo = o?.photos?.[0];
                const article = String(o?.article || o?.tz_code || '').trim();
                const title = String(o?.title || o?.model_name || '').trim();
                const head = article && title ? `${article} — ${title}` : article || title || `Заказ #${group.order_id}`;
                const rem = Math.max(0, (group.total_quantity || 0) - (group.total_shipped || 0));
                return (
                  <div key={group.order_id ?? `g-${head}`} className="rounded-lg border border-white/10 overflow-hidden">
                    <div
                      className="flex flex-wrap items-center gap-3 px-4 py-2"
                      style={{ background: '#1a1a2e', borderLeft: '3px solid #c8ff00' }}
                    >
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          width={32}
                          height={32}
                          className="rounded object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-white/10" />
                      )}
                      <span className="text-[#c8ff00] font-semibold text-sm">{head}</span>
                      <span className="text-white/60 text-sm">
                        На складе: <span className="text-white">{group.total_quantity}</span> шт | Отгружено:{' '}
                        <span className="text-white">{group.total_shipped}</span> шт | Остаток:{' '}
                        <span className="text-cyan-300">{rem}</span> шт
                      </span>
                    </div>
                    <OtkWarehouseMatrix items={group.items || []} />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[900px]">
                        <thead>
                          <tr className="border-b border-white/15 bg-white/5 text-white/90">
                            <th className="text-left px-3 py-2">Фото</th>
                            <th className="text-left px-3 py-2">TZ — MODEL</th>
                            <th className="text-left px-3 py-2">Цвет</th>
                            <th className="text-left px-3 py-2">Размер</th>
                            <th className="text-right px-3 py-2">На складе</th>
                            <th className="text-right px-3 py-2">Отгружено</th>
                            <th className="text-right px-3 py-2">Остаток</th>
                            <th className="text-right px-3 py-2">Принято</th>
                            <th className="text-left px-3 py-2">Статус</th>
                            <th className="text-left px-3 py-2 no-print">Отгрузить</th>
                            <th className="text-left px-3 py-2">Комментарий</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(group.items || []).map((row) => {
                            const q = Math.max(0, parseInt(row.quantity, 10) || 0);
                            const sh = Math.max(0, parseInt(row.shipped_qty, 10) || 0);
                            const rest = Math.max(0, q - sh);
                            const st = otkChainStatusLabel(row.status);
                            return (
                              <tr key={row.id} className="border-b border-white/10 hover:bg-white/5">
                                <td className="px-3 py-2 align-top">
                                  {photo ? (
                                    <img src={photo} alt="" width={40} height={40} className="rounded object-cover" />
                                  ) : (
                                    <div className="w-10 h-10 rounded bg-white/10" />
                                  )}
                                </td>
                                <td className="px-3 py-2 text-white align-top max-w-[200px]">{head}</td>
                                <td className="px-3 py-2 text-white align-top">{row.color || '—'}</td>
                                <td className="px-3 py-2 text-white align-top">{row.size || '—'}</td>
                                <td className="px-3 py-2 text-right font-semibold text-white align-top">{q}</td>
                                <td className="px-3 py-2 text-right text-white/90 align-top">{sh}</td>
                                <td
                                  className="px-3 py-2 text-right font-medium align-top"
                                  style={{ color: rest > 0 ? '#c8ff00' : '#64748b' }}
                                >
                                  {rest}
                                </td>
                                <td className="px-3 py-2 text-right text-white/80 align-top">{q}</td>
                                <td className="px-3 py-2 align-top" style={{ color: st.color }}>
                                  {st.label}
                                </td>
                                <td className="px-3 py-2 no-print align-top">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <NeonInput
                                      type="number"
                                      min={0}
                                      step={1}
                                      placeholder="шт"
                                      value={otkShipInputs[row.id] ?? ''}
                                      onChange={(e) => setOtkShipQty(row.id, e.target.value)}
                                      className="max-w-[72px] bg-black/30 border border-white/20 text-white placeholder-white/40 text-xs py-1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleOtkShipApply(row)}
                                      disabled={otkShipping === row.id}
                                      className={`px-2 py-1 rounded text-xs font-medium text-white ${BTN_PRIMARY} disabled:opacity-50`}
                                    >
                                      {otkShipping === row.id ? '…' : 'OK'}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <input
                                    key={`${row.id}-note-${row.updated_at || ''}`}
                                    type="text"
                                    className="w-full max-w-[140px] bg-black/20 border border-white/15 rounded px-2 py-1 text-xs text-white/90"
                                    defaultValue={row.note || ''}
                                    onBlur={(e) => {
                                      const v = e.target.value.trim();
                                      if (v === (row.note || '')) return;
                                      api.warehouseStock
                                        .patchOtkChainItem(row.id, { note: v || null })
                                        .then(() => loadOtkSummary())
                                        .catch(() => {});
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <details className="mb-6 rounded-xl border border-white/10" style={{ background: CARD_BG }}>
          <summary className="px-4 py-3 cursor-pointer text-white font-medium select-none">
            Остатки по партиям (QC / warehouse_stock)
          </summary>
          <div className="px-0 pb-4 border-t border-white/10">
        {kitOrders.length > 0 && (
          <div
            className="rounded-xl overflow-hidden border border-blue-500/30 mb-6 print-area"
            style={{ background: CARD_BG }}
          >
            <div className="px-4 py-2 border-b border-blue-500/30 font-medium text-white">Сводка по комплектам (готово на складе)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-white/20" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th className="text-left px-4 py-2 font-medium text-white/90">Модель</th>
                    <th className="text-right px-4 py-2 font-medium text-white/90">Части</th>
                    <th className="text-right px-4 py-2 font-medium text-white/90">Комплект</th>
                    <th className="text-right px-4 py-2 font-medium text-white/70 text-xs">Остатки</th>
                  </tr>
                </thead>
                <tbody>
                  {kitOrders.map((ko) => (
                    <tr key={ko.order_id} className="border-b border-white/10">
                      <td className="px-4 py-2 text-white">{ko.order_title}</td>
                      <td className="px-4 py-2 text-right text-white/90">
                        {(ko.parts || []).map((p) => `${p.part_name}: ${p.qty}`).join(' | ')}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-green-400">{ko.kit_qty}</td>
                      <td className="px-4 py-2 text-right text-white/60 text-xs">
                        {(ko.parts || []).map((p) => `${p.part_name}: ${p.remainder ?? 0}`).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          className="rounded-xl overflow-hidden border border-white/10 print-area"
          style={{ background: CARD_BG }}
        >
          <h1 className="print-title print-only py-4 text-center text-lg font-semibold text-white">
            Склад — остатки
          </h1>
          {loading ? (
            <div className="p-8 text-center text-white/70">Загрузка...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-white/70">Нет остатков на складе</div>
          ) : (
          <div className="divide-y divide-white/10">
            {listByOrder.map(({ order_id, label, tz, plan, photo, rows }) => (
              <div key={order_id} className="p-4 first:pt-4">
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-white/20">
                  <ModelPhoto photo={photo} modelName={tz ? `${tz} — ${label}` : label} size={64} />
                  {plan > 0 && <span className="text-white/70 font-normal">План: {plan}</span>}
                </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr className="border-b border-white/20" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <th className="text-left px-4 py-2 text-sm font-medium text-white col-print-hide">Партия</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-white">Размер</th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-white">Остаток</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-white no-print">Отгрузить</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-white no-print">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="border-b border-white/10 hover:bg-white/5">
                            <td className="px-4 py-2 text-white col-print-hide">{batchCode(row)}</td>
                            <td className="px-4 py-2 text-white">{sizeName(row)}</td>
                            <td className="px-4 py-2 text-right font-medium text-white">{warehouseQty(row)}</td>
                            <td className="px-4 py-2 no-print">
                              <NeonInput
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Количество"
                                value={shipInputs[row.id] ?? ''}
                                onChange={(e) => setShipQty(row.id, e.target.value)}
                                className="max-w-[120px] bg-black/30 border border-white/20 text-white placeholder-white/40"
                              />
                            </td>
                            <td className="px-4 py-2 no-print">
                              <button
                                type="button"
                                onClick={() => handleShip(row)}
                                disabled={shipping === row.id}
                                className={`px-3 py-1.5 rounded-lg font-medium text-white text-sm ${BTN_PRIMARY} disabled:opacity-50`}
                              >
                                {shipping === row.id ? '...' : 'Отгрузить'}
                              </button>
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
        </div>
          </div>
        </details>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area .col-print-hide { display: none !important; }
          .print-area table { border-collapse: collapse; }
          .print-area table th, .print-area table td { border: 1px solid #333; padding: 6px 8px; color: #000; }
          .print-area table th { background: #e2e8f0 !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
