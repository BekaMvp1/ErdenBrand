/**
 * Модалка просмотра закупа (VIEW MODE)
 * Открывается по кнопке «Открыть закуп» — только отображение фактических данных.
 * Поля Куплено и Цена — readonly. Редактирование запрещено.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';

export default function ProcurementViewModal({ open, orderId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    setError('');
    api.orders
      .getProcurement(orderId)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки закупа'))
      .finally(() => setLoading(false));
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const tzCode = String(data?.order?.tz_code || '').trim();
  const modelName = String(data?.order?.model_name || '').trim();
  const orderTitle = (tzCode && modelName ? `${tzCode} — ${modelName}` : '') || data?.order?.title || tzCode || modelName || '';
  const status = data?.procurement?.status || 'draft';
  const isCompleted = status === 'received';

  const displayRows = (data?.items || []).filter((r) => String(r.material_name || '').trim());
  const totalSum = displayRows.reduce((acc, r) => acc + Number(r.purchased_sum || 0), 0);

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
      <div
        className="card-neon rounded-card w-[min(96vw,56rem)] max-h-[90vh] p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#ECECEC]">Просмотр закупа</h2>
            <p className="text-sm text-[#ECECEC]/70">Заказ: {orderTitle || data?.order?.title || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-accent-1/30 text-[#ECECEC]">
            Закрыть
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto pr-1">
          {loading ? (
            <div className="py-8 text-center text-[#ECECEC]/70">Загрузка...</div>
          ) : (
            <>
              {isCompleted && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400">
                  ✅ Закуп выполнен
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Клиент</div>
                  <div className="text-sm text-[#ECECEC]">{data?.order?.client_name || '—'}</div>
                </div>
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Статус</div>
                  <div className="text-sm text-[#ECECEC]">
                    {status === 'received' ? 'Закуплено' : status === 'sent' ? 'Отправлено' : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-accent-2/40 p-3">
                  <div className="text-xs text-[#ECECEC]/70">Итого</div>
                  <div className="text-sm font-medium text-primary-400">{totalSum.toFixed(2)} ₽</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/20">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="bg-accent-3/80 border-b border-white/20">
                      <th className="text-left px-3 py-2">Материал</th>
                      <th className="text-left px-3 py-2">План</th>
                      <th className="text-left px-3 py-2">Ед</th>
                      <th className="text-left px-3 py-2">Куплено</th>
                      <th className="text-left px-3 py-2">Цена</th>
                      <th className="text-left px-3 py-2">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-[#ECECEC]/60">
                          Нет данных закупа
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row) => (
                        <tr key={row.id} className="border-b border-white/10">
                          <td className="px-3 py-2 text-[#ECECEC]">{row.material_name || '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC]">{row.planned_qty ?? '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC]">{row.unit || 'шт'}</td>
                          <td className="px-3 py-2 text-[#ECECEC]">{row.purchased_qty ?? '—'}</td>
                          <td className="px-3 py-2 text-[#ECECEC]">{row.purchased_price != null ? Number(row.purchased_price).toFixed(2) : '—'}</td>
                          <td className="px-3 py-2 font-medium text-[#ECECEC]">
                            {row.purchased_sum != null ? Number(row.purchased_sum).toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
