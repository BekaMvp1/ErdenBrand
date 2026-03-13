/**
 * Страница печати партии пошива
 * /print/sewing/:id — id = batch_id (SewingBatch)
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

export default function PrintSewing() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api.warehouseStock
      .batchById(id)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PrintLayout backTo="/sewing" backLabel="К пошиву">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/sewing" backLabel="К пошиву">
        <p className="text-red-500">{error || 'Партия не найдена'}</p>
      </PrintLayout>
    );
  }

  const order = data.Order || {};
  const orderName = order.tz_code && order.model_name
    ? `${order.tz_code} — ${order.model_name}`
    : order.title || '—';
  const items = data.SewingBatchItems || [];
  const totalPlanned = items.reduce((s, i) => s + (Number(i.planned_qty) || 0), 0);
  const totalFact = items.reduce((s, i) => s + (Number(i.fact_qty) || 0), 0);
  const floorName = data.BuildingFloor?.name || `Этаж ${data.floor_id || '—'}`;

  return (
    <PrintLayout
      title="ОТЧЁТ ПАРТИИ ПОШИВА"
      backTo="/sewing"
      backLabel="К пошиву"
    >
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <span className="text-gray-600">Партия:</span>
          <span className="ml-2 font-medium">{data.batch_code || `#${data.id}`}</span>
        </div>
        <div>
          <span className="text-gray-600">Заказ:</span>
          <span className="ml-2 font-medium">{orderName}</span>
        </div>
        <div>
          <span className="text-gray-600">Клиент:</span>
          <span className="ml-2 font-medium">{order.Client?.name || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Этаж:</span>
          <span className="ml-2 font-medium">{floorName}</span>
        </div>
        <div>
          <span className="text-gray-600">Статус:</span>
          <span className="ml-2 font-medium">{data.status || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Дата:</span>
          <span className="ml-2 font-medium">{formatDate(data.createdAt)}</span>
        </div>
      </div>

      <table className="w-full print-table text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-black px-3 py-2 text-left">Размер</th>
            <th className="border border-black px-3 py-2 text-right">План</th>
            <th className="border border-black px-3 py-2 text-right">Факт</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="border border-black px-3 py-2">
                {item.ModelSize?.Size?.name || item.size_id || '—'}
              </td>
              <td className="border border-black px-3 py-2 text-right">{item.planned_qty ?? '—'}</td>
              <td className="border border-black px-3 py-2 text-right">{item.fact_qty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-between font-semibold">
        <span>Итого план: {totalPlanned}</span>
        <span>Итого факт: {totalFact}</span>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="border-b border-black pb-1 mb-2">Бригадир</div>
          <div className="text-gray-400">&nbsp;</div>
        </div>
        <div>
          <div className="border-b border-black pb-1 mb-2">Проверил</div>
          <div className="text-gray-400">&nbsp;</div>
        </div>
        <div>
          <div className="border-b border-black pb-1 mb-2">Дата</div>
          <div className="text-gray-400">{new Date().toLocaleDateString('ru-RU')}</div>
        </div>
      </div>
    </PrintLayout>
  );
}
