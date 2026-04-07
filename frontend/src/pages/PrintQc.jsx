/**
 * Страница печати акта ОТК
 * /print/qc/:id — id = batch_id (SewingBatch)
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

export default function PrintQc() {
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
      <PrintLayout backTo="/otk" backLabel="К ОТК">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/otk" backLabel="К ОТК">
        <p className="text-red-500">{error || 'Партия не найдена'}</p>
      </PrintLayout>
    );
  }

  const order = data.Order || {};
  const orderName = order.tz_code && order.model_name
    ? `${order.tz_code} — ${order.model_name}`
    : order.title || '—';
  const qc = data.QcBatch;
  const items = qc?.QcBatchItems || data.SewingBatchItems || [];
  const hasQc = !!qc;

  // Если ОТК проведён — показываем checked, passed, defect; иначе — план/факт как к контролю
  const totalChecked = hasQc ? (Number(qc.checked_total) || 0) : items.reduce((s, i) => s + (Number(i.fact_qty) || 0), 0);
  const totalPassed = hasQc ? (Number(qc.passed_total) || 0) : totalChecked;
  const totalDefect = hasQc ? (Number(qc.defect_total) || 0) : 0;

  return (
    <PrintLayout
      title="АКТ ОТК (КОНТРОЛЬ КАЧЕСТВА)"
      backTo="/otk"
      backLabel="К ОТК"
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
          <span className="text-gray-600">Дата:</span>
          <span className="ml-2 font-medium">{formatDate(qc?.createdAt || data.createdAt)}</span>
        </div>
      </div>

      <table className="w-full print-table text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-black px-3 py-2 text-left">Размер</th>
            {hasQc ? (
              <>
                <th className="border border-black px-3 py-2 text-right">Проверено</th>
                <th className="border border-black px-3 py-2 text-right">Принято</th>
                <th className="border border-black px-3 py-2 text-right">Брак</th>
              </>
            ) : (
              <>
                <th className="border border-black px-3 py-2 text-right">План</th>
                <th className="border border-black px-3 py-2 text-right">К контролю</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sizeName = item.ModelSize?.Size?.name || (item.ModelSize ? `#${item.model_size_id}` : '—');
            if (hasQc && item.checked_qty != null) {
              return (
                <tr key={item.id}>
                  <td className="border border-black px-3 py-2">{sizeName}</td>
                  <td className="border border-black px-3 py-2 text-right">{item.checked_qty ?? '—'}</td>
                  <td className="border border-black px-3 py-2 text-right">{item.passed_qty ?? '—'}</td>
                  <td className="border border-black px-3 py-2 text-right">{item.defect_qty ?? '—'}</td>
                </tr>
              );
            }
            return (
              <tr key={item.id}>
                <td className="border border-black px-3 py-2">{sizeName}</td>
                <td className="border border-black px-3 py-2 text-right">{item.planned_qty ?? '—'}</td>
                <td className="border border-black px-3 py-2 text-right">{item.fact_qty ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex justify-between font-semibold">
        <span>Итого проверено: {totalChecked}</span>
        <span>Принято: {totalPassed}</span>
        {hasQc && <span>Брак: {totalDefect}</span>}
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="border-b border-black pb-1 mb-2">Контролёр ОТК</div>
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
