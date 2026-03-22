/**
 * Печать планирования
 * URL: /print/planning/:month?workshop_id=&floor_id=&week=YYYY-MM-DD&q=
 * week — понедельник выбранной недели (как на экране планирования).
 * Без week — весь месяц (legacy).
 */

import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PrintLayout from '../components/PrintLayout';
import './printPlanning.css';

function formatWeekLabel(weekStartIso) {
  if (!weekStartIso) return '';
  const d = new Date(weekStartIso + 'T12:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 5);
  const opts = { day: '2-digit', month: '2-digit' };
  return `${d.toLocaleDateString('ru-RU', opts)} — ${end.toLocaleDateString('ru-RU', opts)}`;
}

export default function PrintPlanning() {
  const { month } = useParams();
  const [searchParams] = useSearchParams();
  const workshopId = searchParams.get('workshop_id') || '';
  const floorId = searchParams.get('floor_id') || '';
  const weekParam = searchParams.get('week') || '';
  const dateFromParam = searchParams.get('date_from') || '';
  const dateToParam = searchParams.get('date_to') || '';
  const qParam = searchParams.get('q') || '';

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
    if (weekParam) {
      params.week = weekParam.slice(0, 10);
    } else if (dateFromParam && dateToParam) {
      params.date_from = dateFromParam.slice(0, 10);
      params.date_to = dateToParam.slice(0, 10);
    }
    if (qParam.trim()) params.q = qParam.trim();

    api.planning
      .calendar(params)
      .then(setData)
      .catch((err) => setError(err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [month, workshopId, floorId, weekParam, dateFromParam, dateToParam, qParam]);

  const monthLabel = month
    ? new Date(month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    : '';

  const titleText = useMemo(() => {
    const w = data?.workshop?.name || 'Цех';
    const weekStart = data?.week_start;
    if (weekStart) {
      return `Планирование — ${w} | неделя ${formatWeekLabel(weekStart)}`;
    }
    return `Планирование — ${w} | ${monthLabel}`;
  }, [data?.workshop?.name, data?.week_start, monthLabel]);

  if (loading) {
    return (
      <PrintLayout backTo="/planning" contentClassName="max-w-3xl mx-auto">
        <p className="text-center text-gray-500">Загрузка...</p>
      </PrintLayout>
    );
  }
  if (error || !data) {
    return (
      <PrintLayout backTo="/planning" contentClassName="max-w-3xl mx-auto">
        <p className="text-red-500">{error || 'Нет данных'}</p>
      </PrintLayout>
    );
  }

  const rows = data.rows || [];
  const dates = data.dates || [];
  const summary = data.summary || {};
  const workshop = data.workshop;
  const weekStart = data.week_start;

  const loadSum = dates.reduce((acc, d) => {
    const key = typeof d === 'string' ? d : d.date;
    return acc + (Number(summary.load?.[key]) || 0);
  }, 0);

  return (
    <PrintLayout backTo="/planning" contentClassName="print-planning-doc mx-auto px-1">
      <div className="print-planning-title">{titleText}</div>
      <div className="print-planning-meta">
        <span>Цех: {workshop?.name || '—'}</span>
        {floorId && <span>Этаж ID: {floorId}</span>}
        {weekStart && <span>Неделя с: {weekStart}</span>}
        {qParam && <span>Поиск: {qParam}</span>}
      </div>

      <div className="print-planning-table-wrap print-avoid-break">
        <table className="print-planning-table print-table">
          <colgroup>
            <col className="col-order" />
            <col className="col-model" />
            <col className="col-client" />
            {dates.map((d) => {
              const date = typeof d === 'string' ? d : d.date;
              return <col key={date} className="col-day" />;
            })}
            <col className="col-total" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Заказ</th>
              <th scope="col">Модель</th>
              <th scope="col">Клиент</th>
              {dates.map((d) => {
                const di = typeof d === 'string' ? { date: d, label: '', dayNum: d.slice(8, 10) } : d;
                return (
                  <th key={di.date} scope="col" className="col-day">
                    {di.label} {di.dayNum}
                  </th>
                );
              })}
              <th scope="col">Σ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4 + dates.length} className="text-center text-gray-600 py-4">
                  Нет заказов по фильтру
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const total =
                  row.days?.reduce((s, x) => s + (Number(x.planned_qty) || 0), 0) ??
                  row.total ??
                  0;
                return (
                  <tr key={`${row.order_id}-${row.part_name || ''}-${row.floor_id || ''}`}>
                    <td className="col-order">{row.order_title}</td>
                    <td className="col-model">{row.model_name || '—'}</td>
                    <td className="col-client">{row.client_name}</td>
                    {dates.map((d) => {
                      const date = typeof d === 'string' ? d : d.date;
                      const day = row.days?.find((x) => x.date === date);
                      const v = day?.planned_qty;
                      return (
                        <td key={date} className="col-day">
                          {v != null && v !== '' ? v : '—'}
                        </td>
                      );
                    })}
                    <td className="col-total">{total}</td>
                  </tr>
                );
              })
            )}
            <tr className="row-summary">
              <td colSpan={3}>Мощность (шт/день)</td>
              {dates.map((d) => {
                const date = typeof d === 'string' ? d : d.date;
                return (
                  <td key={`cap-${date}`} className="col-day">
                    {summary.capacity?.[date] ?? '—'}
                  </td>
                );
              })}
              <td className="col-total">—</td>
            </tr>
            <tr className="row-summary">
              <td colSpan={3}>Загрузка</td>
              {dates.map((d) => {
                const date = typeof d === 'string' ? d : d.date;
                return (
                  <td key={`load-${date}`} className="col-day">
                    {summary.load?.[date] ?? 0}
                  </td>
                );
              })}
              <td className="col-total">{loadSum}</td>
            </tr>
            <tr className="row-summary">
              <td colSpan={3}>Свободно</td>
              {dates.map((d) => {
                const date = typeof d === 'string' ? d : d.date;
                return (
                  <td key={`free-${date}`} className="col-day">
                    {summary.free?.[date] ?? '—'}
                  </td>
                );
              })}
              <td className="col-total">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-right font-semibold text-[10px]">
        Итого загрузка{weekStart ? ' за неделю' : ' за период'}: {loadSum} шт
      </div>

      <div className="print-planning-footer print-avoid-break">
        <div>
          <div className="text-[9px] text-gray-600">Ответственный</div>
          <div className="print-planning-sign" />
        </div>
        <div>
          <div className="text-[9px] text-gray-600">Проверил</div>
          <div className="print-planning-sign" />
        </div>
        <div>
          <div className="text-[9px] text-gray-600">Дата</div>
          <div className="pt-1 text-[9px]">{new Date().toLocaleDateString('ru-RU')}</div>
        </div>
      </div>
    </PrintLayout>
  );
}
