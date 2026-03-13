/**
 * Страница печати задачи раскроя
 * /print/cutting/:id
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

const FLOOR_LABELS = {
  1: '1 этаж (Финиш)',
  2: '2 этаж (Пошив)',
  3: '3 этаж (Пошив)',
  4: '4 этаж (Пошив)',
};

export default function PrintCutting() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api.cutting
      .getTaskById(id)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PrintLayout backTo="/cutting" backLabel="К раскрою">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/cutting" backLabel="К раскрою">
        <p className="text-red-500">{error || 'Задача не найдена'}</p>
      </PrintLayout>
    );
  }

  const order = data.order || {};
  const orderName = order.tz_code && order.model_name
    ? `${order.tz_code} — ${order.model_name}`
    : order.title || '—';
  const variants = data.actual_variants || [];
  const totalPlan = variants.reduce((s, v) => s + (Number(v.quantity_planned) || 0), 0);
  const totalActual = variants.reduce((s, v) => s + (Number(v.quantity_actual) || 0), 0);
  const floorLabel = FLOOR_LABELS[data.floor] || `${data.floor} этаж`;

  return (
    <PrintLayout
      title="ЗАДАЧА РАСКРОЯ"
      backTo="/cutting"
      backLabel="К раскрою"
    >
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <span className="text-gray-600">Заказ:</span>
          <span className="ml-2 font-medium">{orderName}</span>
        </div>
        <div>
          <span className="text-gray-600">Клиент:</span>
          <span className="ml-2 font-medium">{order.client_name || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Тип раскроя:</span>
          <span className="ml-2 font-medium">{data.cutting_type || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Этаж:</span>
          <span className="ml-2 font-medium">{floorLabel}</span>
        </div>
        <div>
          <span className="text-gray-600">Ответственный:</span>
          <span className="ml-2 font-medium">{data.responsible || '—'}</span>
        </div>
        <div>
          <span className="text-gray-600">Дата начала:</span>
          <span className="ml-2 font-medium">{formatDate(data.start_date)}</span>
        </div>
        <div>
          <span className="text-gray-600">Дата окончания:</span>
          <span className="ml-2 font-medium">{formatDate(data.end_date)}</span>
        </div>
        <div>
          <span className="text-gray-600">Рост:</span>
          <span className="ml-2 font-medium">{data.height_value ?? '—'}</span>
        </div>
      </div>

      <table className="w-full print-table text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-black px-3 py-2 text-left">Цвет</th>
            <th className="border border-black px-3 py-2 text-left">Размер</th>
            <th className="border border-black px-3 py-2 text-right">План</th>
            <th className="border border-black px-3 py-2 text-right">Факт</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v, i) => (
            <tr key={i}>
              <td className="border border-black px-3 py-2">{v.color || '—'}</td>
              <td className="border border-black px-3 py-2">{v.size || '—'}</td>
              <td className="border border-black px-3 py-2 text-right">{v.quantity_planned ?? '—'}</td>
              <td className="border border-black px-3 py-2 text-right">{v.quantity_actual ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-between font-semibold">
        <span>Итого план: {totalPlan}</span>
        <span>Итого факт: {totalActual}</span>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="border-b border-black pb-1 mb-2">Раскройщик</div>
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
