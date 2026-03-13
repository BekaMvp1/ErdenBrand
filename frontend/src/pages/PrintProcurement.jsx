/**
 * Страница печати отчёта закупа
 * /print/procurement/:id
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import PrintLayout from '../components/PrintLayout';

function formatDate(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

export default function PrintProcurement() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api.procurement
      .getById(id)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [id]);

  const orderName =
    data?.order?.tz_code && data?.order?.model_name
      ? `${data.order.tz_code} — ${data.order.model_name}`
      : data?.order?.title || '—';
  const items = data?.items || [];
  const totalSum = items.reduce((acc, i) => acc + Number(i.purchased_sum || 0), 0);
  const purchaseDate = data?.procurement?.completed_at
    ? formatDate(String(data.procurement.completed_at).slice(0, 10))
    : '—';
  const dueDate = formatDate(data?.procurement?.due_date || data?.order?.deadline);

  if (loading) {
    return (
      <PrintLayout backTo="/procurement" backLabel="К закупу">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/procurement" backLabel="К закупу">
        <p className="text-red-500 mb-4">{error || 'Закуп не найден'}</p>
      </PrintLayout>
    );
  }

  return (
    <PrintLayout title="ОТЧЁТ ЗАКУПА МАТЕРИАЛОВ" backTo="/procurement" backLabel="К закупу">
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <span className="text-gray-600">Заказ:</span>
          <span className="ml-2 font-medium">{orderName}</span>
        </div>
        <div>
          <span className="text-gray-600">Клиент:</span>
          <span className="ml-2 font-medium">{data?.order?.client_name || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Дата закупа:</span>
          <span className="ml-2 font-medium">{purchaseDate}</span>
        </div>
        <div>
          <span className="text-gray-600">Дедлайн:</span>
          <span className="ml-2 font-medium">{dueDate}</span>
        </div>
      </div>

      <table className="w-full print-table text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-black px-3 py-2 text-left">Материал</th>
            <th className="border border-black px-3 py-2 text-right">План</th>
            <th className="border border-black px-3 py-2 text-right">Куплено</th>
            <th className="border border-black px-3 py-2 text-center">Ед</th>
            <th className="border border-black px-3 py-2 text-right">Цена</th>
            <th className="border border-black px-3 py-2 text-right">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td className="border border-black px-3 py-2">{row.material_name || '—'}</td>
              <td className="border border-black px-3 py-2 text-right">{row.planned_qty ?? '—'}</td>
              <td className="border border-black px-3 py-2 text-right">{row.purchased_qty ?? '—'}</td>
              <td className="border border-black px-3 py-2 text-center">{row.unit || 'шт'}</td>
              <td className="border border-black px-3 py-2 text-right">
                {row.purchased_price != null ? Number(row.purchased_price).toFixed(2) : '—'}
              </td>
              <td className="border border-black px-3 py-2 text-right">
                {row.purchased_sum != null ? Number(row.purchased_sum).toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 text-right font-semibold">
        Итого: {totalSum.toFixed(2)} ₽
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="border-b border-black pb-1 mb-2">Закупщик</div>
          <div className="text-gray-400">&nbsp;</div>
        </div>
        <div>
          <div className="border-b border-black pb-1 mb-2">Проверил</div>
          <div className="text-gray-400">&nbsp;</div>
        </div>
        <div>
          <div className="border-b border-black pb-1 mb-2">Дата</div>
          <div className="text-gray-400">{purchaseDate}</div>
        </div>
      </div>
    </PrintLayout>
  );
}
