/**
 * Страница печати планирования на месяц (дневной календарь)
 * /print/planning/:month?workshop_id=1&floor_id=2
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PrintLayout from '../components/PrintLayout';

export default function PrintPlanning() {
  const { month } = useParams();
  const [searchParams] = useSearchParams();
  const workshopId = searchParams.get('workshop_id') || '';
  const floorId = searchParams.get('floor_id') || '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!month || !workshopId) {
      setLoading(false);
      setError('Укажите месяц и цех (workshop_id в URL)');
      return;
    }
    setLoading(true);
    setError('');
    const params = { month, workshop_id: workshopId };
    if (floorId) params.floor_id = floorId;
    api.planning
      .calendar(params)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [month, workshopId, floorId]);

  const monthLabel = month
    ? new Date(month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    : '';

  if (loading) {
    return (
      <PrintLayout backTo="/planning" backLabel="К планированию">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/planning" backLabel="К планированию">
        <p className="text-red-500">{error || 'Нет данных'}</p>
      </PrintLayout>
    );
  }

  const rows = data.rows || [];
  const dates = data.dates || [];
  const summary = data.summary || {};
  const workshop = data.workshop;

  return (
    <PrintLayout
      title={`ОТЧЁТ ПЛАНИРОВАНИЯ — ${workshop?.name || 'Цех'} | ${monthLabel}`}
      backTo="/planning"
      backLabel="К планированию"
    >
      <table className="w-full print-table text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-black px-2 py-2 text-left">Заказ</th>
            <th className="border border-black px-2 py-2 text-left">Модель</th>
            <th className="border border-black px-2 py-2 text-left">Клиент</th>
            {dates.map((d) => (
              <th key={d.date} className="border border-black px-2 py-2 text-center">
                {d.label} {d.dayNum}
              </th>
            ))}
            <th className="border border-black px-2 py-2 text-right">Итого</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const total = row.days?.reduce((s, d) => s + (d.planned_qty || 0), 0) ?? row.total ?? 0;
            return (
              <tr key={row.order_id}>
                <td className="border border-black px-2 py-2">{row.order_title}</td>
                <td className="border border-black px-2 py-2">{row.model_name || '—'}</td>
                <td className="border border-black px-2 py-2">{row.client_name}</td>
                {dates.map((d) => {
                  const day = row.days?.find((x) => x.date === d.date);
                  return (
                    <td key={d.date} className="border border-black px-2 py-2 text-center">
                      {day?.planned_qty ?? '—'}
                    </td>
                  );
                })}
                <td className="border border-black px-2 py-2 text-right font-medium">{total}</td>
              </tr>
            );
          })}
          <tr className="font-semibold bg-gray-100">
            <td colSpan={3} className="border border-black px-2 py-2">МОЩНОСТЬ</td>
            {dates.map((d) => (
              <td key={`cap_${d.date}`} className="border border-black px-2 py-2 text-center">
                {summary.capacity?.[d.date] ?? '—'}
              </td>
            ))}
            <td className="border border-black px-2 py-2">—</td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={3} className="border border-black px-2 py-2">ЗАГРУЗКА</td>
            {dates.map((d) => (
              <td key={`load_${d.date}`} className="border border-black px-2 py-2 text-center">
                {summary.load?.[d.date] ?? 0}
              </td>
            ))}
            <td className="border border-black px-2 py-2 text-right">
              {Object.values(summary.load || {}).reduce((a, b) => a + (b || 0), 0)}
            </td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={3} className="border border-black px-2 py-2">СВОБОДНО</td>
            {dates.map((d) => (
              <td key={`free_${d.date}`} className="border border-black px-2 py-2 text-center">
                {summary.free?.[d.date] ?? '—'}
              </td>
            ))}
            <td className="border border-black px-2 py-2">—</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 text-right font-semibold">
        Итого за месяц: {Object.values(summary.load || {}).reduce((a, b) => a + (b || 0), 0)} шт
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="border-b border-black pb-1 mb-2">Ответственный</div>
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
