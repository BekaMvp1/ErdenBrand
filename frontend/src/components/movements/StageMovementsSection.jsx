/**
 * Список перемещений по этапам (входящие / исходящие)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const STAGE_RU = {
  warehouse: 'Склад',
  cutting: 'Раскрой',
  sewing: 'Пошив',
  otk: 'ОТК',
  shipment: 'Отгрузка',
};

function money(v) {
  const n = Number(v);
  return `${Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ru-RU')} сом`;
}

export default function StageMovementsSection({
  incomingToStage,
  outgoingFromStage,
  title = 'Перемещения материалов',
  /** Не рендерить заголовок секции (если заголовок задан снаружи) */
  omitHeading = false,
  /** Без верхнего отступа — для встраивания во вкладку отчёта */
  compact = false,
}) {
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const loads = [];
      if (incomingToStage) {
        loads.push(
          api.movements.list({ to_stage: incomingToStage }).then((r) => {
            if (!cancelled) setIncoming(Array.isArray(r) ? r : []);
          })
        );
      } else {
        setIncoming([]);
      }
      if (outgoingFromStage) {
        loads.push(
          api.movements.list({ from_stage: outgoingFromStage }).then((r) => {
            if (!cancelled) setOutgoing(Array.isArray(r) ? r : []);
          })
        );
      } else {
        setOutgoing([]);
      }
      try {
        await Promise.all(loads);
      } catch {
        if (!cancelled) {
          setIncoming([]);
          setOutgoing([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [incomingToStage, outgoingFromStage]);

  const renderTable = (rows, emptyHint) => {
    if (loading) return <div className="py-4 text-sm text-white/60">Загрузка…</div>;
    if (!rows.length) {
      return <div className="py-3 text-sm text-white/50">{emptyHint}</div>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="py-2 pr-2">№ док.</th>
              <th className="py-2 pr-2">Дата</th>
              <th className="py-2 pr-2">Заказ</th>
              <th className="py-2 pr-2 max-w-[140px]">Склад откуда</th>
              <th className="py-2 pr-2 max-w-[140px]">Склад куда</th>
              <th className="py-2 pr-2">Откуда</th>
              <th className="py-2 pr-2 text-right">Кол-во</th>
              <th className="py-2 pr-2 text-right">Сумма</th>
              <th className="py-2 pr-2 text-right">Брак</th>
              <th className="py-2 pr-2">Статус</th>
              <th className="py-2 pr-2"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-white/10 text-[#ECECEC]">
                <td className="py-2 pr-2">{d.doc_number}</td>
                <td className="py-2 pr-2">{d.doc_date}</td>
                <td className="py-2 pr-2 max-w-[200px] truncate">{d.order_label || '—'}</td>
                <td className="py-2 pr-2 max-w-[140px] truncate text-white/80">
                  {d.FromWarehouse?.name || '—'}
                </td>
                <td className="py-2 pr-2 max-w-[140px] truncate text-white/80">
                  {d.ToWarehouse?.name || '—'}
                </td>
                <td className="py-2 pr-2">
                  {STAGE_RU[d.stage_meta?.from_stage] || d.stage_meta?.from_stage || '—'}
                </td>
                <td className="py-2 pr-2 text-right">{Number(d.total_qty || 0).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-2 text-right">{money(d.total_sum)}</td>
                <td className="py-2 pr-2 text-right">
                  {Number(d.defect_qty_total || 0).toLocaleString('ru-RU')}
                </td>
                <td className="py-2 pr-2">
                  {d.status === 'posted' ? (
                    <span className="text-green-400">Проведён</span>
                  ) : (
                    <span className="text-amber-300">Черновик</span>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <button
                    type="button"
                    className="text-sky-400 hover:underline"
                    onClick={() => navigate(`/movements/${d.id}`)}
                  >
                    👁 Просмотр
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!incomingToStage && !outgoingFromStage) return null;

  return (
    <div
      className={`rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4 ${compact ? '' : 'mt-8'}`}
    >
      {!omitHeading ? (
        <h2 className="mb-4 text-lg font-semibold text-[#ECECEC]">{title}</h2>
      ) : null}
      {incomingToStage ? (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-white/80">
            Входящие ({STAGE_RU[incomingToStage] || incomingToStage})
          </h3>
          {renderTable(incoming, 'Нет входящих перемещений')}
        </div>
      ) : null}
      {outgoingFromStage ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-white/80">
            Исходящие ({STAGE_RU[outgoingFromStage] || outgoingFromStage})
          </h3>
          {renderTable(outgoing, 'Нет исходящих перемещений')}
        </div>
      ) : null}
    </div>
  );
}
