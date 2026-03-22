/**
 * Таблица планирования комплектов: одна строка на заказ, раскрытие — части (план / факт).
 * Данные: GET /api/planning/kit-rows
 */

import React, { useState, useMemo } from 'react';

function Chevron({ open }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * @param {{
 *   orders: Array<{
 *     order_id: number,
 *     title?: string,
 *     client_name?: string,
 *     kit_planned: number,
 *     kit_completed: number,
 *     parts: Array<{ part_name: string, planned: number, completed: number, floor_id?: number }>
 *   }>,
 *   weekLabel?: string,
 *   onPrintWeek?: () => void,
 * }} props
 */
export default function PlanningKitAccordion({ orders = [], weekLabel, onPrintWeek }) {
  const [open, setOpen] = useState(() => new Set());

  const toggle = (id) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rows = useMemo(() => orders.filter((o) => (o.parts || []).length > 0), [orders]);

  return (
    <div className="rounded-xl border border-white/15 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
        <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text">
          Комплекты {weekLabel ? `— ${weekLabel}` : ''}
        </h2>
        {onPrintWeek && (
          <button
            type="button"
            onClick={onPrintWeek}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary-600/80 text-white hover:bg-primary-600 no-print"
          >
            Печать недели
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/15 bg-white/5">
              <th className="text-left p-3 w-10" />
              <th className="text-left p-3">Заказ</th>
              <th className="text-left p-3">Клиент</th>
              <th className="text-right p-3">План (компл.)</th>
              <th className="text-right p-3">Факт (компл.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[#ECECEC]/60">
                  Нет комплектов за период
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const id = o.order_id;
              const isOpen = open.has(id);
              return (
                <React.Fragment key={id}>
                  <tr className="border-b border-white/10 hover:bg-white/5 cursor-pointer" onClick={() => toggle(id)}>
                    <td className="p-2 pl-3 align-middle">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-white/10 text-[#ECECEC]"
                        aria-expanded={isOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(id);
                        }}
                      >
                        <Chevron open={isOpen} />
                      </button>
                    </td>
                    <td className="p-3 font-medium text-[#ECECEC] dark:text-dark-text">
                      #{id} {o.title || o.tz_code || '—'}
                    </td>
                    <td className="p-3 text-[#ECECEC]/85">{o.client_name || '—'}</td>
                    <td className="p-3 text-right tabular-nums">{o.kit_planned ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums font-medium text-primary-400">
                      {o.kit_completed ?? 0}
                    </td>
                  </tr>
                  {isOpen &&
                    (o.parts || []).map((p, idx) => (
                      <tr key={`${id}-p-${idx}`} className="bg-black/20 border-b border-white/5">
                        <td />
                        <td className="p-2 pl-8 text-[#ECECEC]/90" colSpan={2}>
                          └ {p.part_name}
                          {p.floor_id != null && (
                            <span className="text-[#ECECEC]/50 text-xs ml-2">этаж {p.floor_id}</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums text-[#ECECEC]/80">{p.planned}</td>
                        <td className="p-2 text-right tabular-nums text-[#ECECEC]/80">{p.completed}</td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
