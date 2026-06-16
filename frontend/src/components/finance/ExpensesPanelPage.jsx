import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../apiBaseUrl';
import { expensesPanelApi, formatNum } from './financeApi';

const SECTIONS = [
  { key: 'procurement', title: '🛒 ЗАКУП', color: '#93c5fd' },
  { key: 'planned_expense', title: '📋 ПЛАНИРОВАНИЕ РАСХОДОВ', color: '#fbbf24' },
  { key: 'sewing', title: '✂️ ПОШИВ', color: '#a3e635' },
  { key: 'otk', title: '✅ ОТК', color: '#4ade80' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU');
}

function toIsoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toIsoDateLocal(from), dateTo: toIsoDateLocal(to) };
}

async function fetchExpensesPanel(dateFrom, dateTo) {
  const token = sessionStorage.getItem('token');
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  const res = await fetch(`${API_URL}/api/finance/expenses-panel?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

function ExpenseSection({ section, rows, showAll, onMark, markingId }) {
  const visible = showAll ? rows : rows.filter((r) => !r.is_distributed);
  const undistributedSum = rows
    .filter((r) => !r.is_distributed)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div
      className="rounded-xl border border-white/20 overflow-hidden mb-6"
      style={{ background: 'rgba(15, 23, 42, 0.85)' }}
    >
      <div
        className="px-4 py-3 flex flex-wrap justify-between items-center gap-2 border-b border-white/15"
        style={{ background: 'rgba(30, 58, 95, 0.35)' }}
      >
        <div className="font-bold text-sm" style={{ color: section.color }}>
          {section.title}
        </div>
        <div className="text-xs text-[#94a3b8]">
          Нераспределено:{' '}
          <span className="text-[#fbbf24] font-semibold">
            {formatNum(undistributedSum)} сом
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-8 text-center text-[#64748b] text-sm">
          {showAll ? 'Нет записей за период' : 'Все расходы распределены'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10 text-[#94a3b8] text-xs">
                <th className="text-left px-4 py-2 font-semibold">Дата</th>
                <th className="text-left px-4 py-2 font-semibold">Статья / Название</th>
                <th className="text-right px-4 py-2 font-semibold">Сумма</th>
                <th className="text-left px-4 py-2 font-semibold">Статус</th>
                <th className="text-right px-4 py-2 font-semibold w-[140px]">Действие</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rowKey = `${section.key}_${row.id}`;
                const isMarking = markingId === rowKey;
                const distributed = row.is_distributed;
                return (
                  <tr
                    key={rowKey}
                    className="border-b border-white/5"
                    style={{
                      opacity: distributed ? 0.4 : 1,
                      background: distributed ? 'rgba(100,116,139,0.08)' : 'transparent',
                    }}
                  >
                    <td className="px-4 py-2 text-[#e2e8f0]">{formatDate(row.date)}</td>
                    <td className="px-4 py-2 text-[#e2e8f0]">{row.name}</td>
                    <td className="px-4 py-2 text-right text-[#fbbf24] font-semibold">
                      {formatNum(row.amount)}
                    </td>
                    <td className="px-4 py-2 text-[#94a3b8]">{row.status || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {distributed ? (
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          <span className="text-[10px] px-2 py-1 rounded bg-[#374151] text-[#94a3b8]">
                            Распределён
                          </span>
                          <button
                            type="button"
                            disabled={isMarking}
                            onClick={() => onMark(section.key, row.id, false)}
                            className="text-xs px-2 py-1 rounded border border-[#475569] text-[#94a3b8] hover:bg-white/5 disabled:opacity-50"
                          >
                            ↩ Отменить
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isMarking}
                          onClick={() => onMark(section.key, row.id, true)}
                          className="text-xs px-3 py-1.5 rounded font-semibold text-white disabled:opacity-50"
                          style={{ background: '#16a34a' }}
                        >
                          {isMarking ? '…' : '✓ Распределить'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ExpensesPanelPage() {
  const defaultRange = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchExpensesPanel(dateFrom, dateTo);
      setData(d);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMark = async (source, sourceId, isDistributed) => {
    const rowKey = `${source}_${sourceId}`;
    setMarkingId(rowKey);
    try {
      await expensesPanelApi.mark({ source, source_id: sourceId, is_distributed: isDistributed });
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        const list = Array.isArray(next[source]) ? [...next[source]] : [];
        const idx = list.findIndex((r) => r.id === sourceId);
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            is_distributed: isDistributed,
            distributed_at: isDistributed ? new Date().toISOString() : null,
          };
          next[source] = list;
        }
        return next;
      });
    } catch (err) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setMarkingId(null);
    }
  };

  const totalUndistributed = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    for (const section of SECTIONS) {
      const rows = data[section.key] || [];
      sum += rows
        .filter((r) => !r.is_distributed)
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }
    return sum;
  }, [data]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end justify-between mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[10px] text-[#64748b] uppercase mb-1">С</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 border border-white/25 text-[#ECECEC] text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] text-[#64748b] uppercase mb-1">ПО</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-accent-2/80 border border-white/25 text-[#ECECEC] text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              !showAll ? 'bg-primary-600 text-white' : 'bg-accent-1/30 text-[#ECECEC]'
            }`}
          >
            Только нераспределённые
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              showAll ? 'bg-primary-600 text-white' : 'bg-accent-1/30 text-[#ECECEC]'
            }`}
          >
            Показать все
          </button>
        </div>
      </div>

      <div
        className="mb-6 px-4 py-3 rounded-lg border border-[#fbbf24]/40"
        style={{ background: 'rgba(42, 26, 0, 0.35)' }}
      >
        <span className="text-[#94a3b8] text-sm">Итого нераспределённых: </span>
        <span className="text-[#fbbf24] text-lg font-bold">
          {formatNum(totalUndistributed)} сом
        </span>
      </div>

      {error ? (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80">Загрузка...</div>
      ) : data ? (
        SECTIONS.map((section) => (
          <ExpenseSection
            key={section.key}
            section={section}
            rows={data[section.key] || []}
            showAll={showAll}
            onMark={handleMark}
            markingId={markingId}
          />
        ))
      ) : (
        <div className="p-8 text-center text-[#ECECEC]/80">Нет данных</div>
      )}
    </div>
  );
}
