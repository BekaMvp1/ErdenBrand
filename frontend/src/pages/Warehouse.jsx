/**
 * Страница склада.
 * Остатки по размерам и партиям, сгруппированные по моделям. Отгрузка с проверкой ship_qty <= warehouse_qty.
 */

import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import NeonInput from '../components/ui/NeonInput';
import ModelPhoto from '../components/ModelPhoto';

const PAGE_BG = '#0f172a';
const CARD_BG = '#1e293b';
const BTN_PRIMARY = 'bg-green-600 hover:bg-green-500 text-white';
const BTN_SECONDARY = 'bg-blue-600 hover:bg-blue-500 text-white';
const WAREHOUSE_SHIP_INPUTS_KEY = 'warehouse_ship_inputs';
const WAREHOUSE_WORKSHOP_KEY = 'warehouse_workshop_id';

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
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shipInputs, setShipInputs] = useState(loadShipInputs);
  const [shipping, setShipping] = useState(null);
  const [error, setError] = useState('');
  const [workshops, setWorkshops] = useState([]);
  const [workshopId, setWorkshopId] = useState(() => {
    try { return sessionStorage.getItem(WAREHOUSE_WORKSHOP_KEY) || ''; } catch { return ''; }
  });

  const load = () => {
    setLoading(true);
    setError('');
    const params = workshopId ? { workshop_id: workshopId } : {};
    api.warehouseStock
      .stock(params)
      .then(setList)
      .catch(() => setList([]))
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
      <div className="no-print flex flex-wrap items-center justify-between gap-4 mb-6 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-white">Склад</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={workshopId}
            onChange={(e) => setWorkshopId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white min-w-[160px]"
          >
            <option value="">Все цеха</option>
            {workshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium ${BTN_SECONDARY} disabled:opacity-50`}
          >
            Обновить
          </button>
          <PrintButton />
        </div>
      </div>

      <div className="px-4 md:px-6 pb-8">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
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
