import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

const TH = {
  padding: '8px 10px',
  textAlign: 'left',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid #1e3a5f',
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '8px 10px',
  border: '1px solid #111',
  color: '#e2e8f0',
  fontSize: 12,
  verticalAlign: 'middle',
};

const FILTER_INPUT = {
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 12,
};

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU');
}

export default function BarcodePrintJournal() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [article, setArticle] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (article.trim()) params.article = article.trim();

      const q = new URLSearchParams(params).toString();
      const [logs, sum] = await Promise.all([
        api.get(`/api/barcodes/print-log${q ? `?${q}` : ''}`),
        api.get(`/api/barcodes/print-log/summary${q ? `?${q}` : ''}`),
      ]);
      setRows(Array.isArray(logs) ? logs : []);
      setSummary(Array.isArray(sum) ? sum : []);
    } catch {
      setRows([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, article]);

  useEffect(() => {
    load();
  }, [load]);

  const totalQty = rows.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={FILTER_INPUT}
          title="Дата с"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={FILTER_INPUT}
          title="Дата по"
        />
        <input
          type="text"
          value={article}
          onChange={(e) => setArticle(e.target.value)}
          placeholder="Артикул…"
          style={{ ...FILTER_INPUT, minWidth: 140 }}
        />
        <button
          type="button"
          onClick={load}
          style={{
            background: '#1e3a5f',
            color: '#93c5fd',
            border: '1px solid #1e3a5f',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Обновить
        </button>
      </div>

      {summary.length > 0 ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
            padding: '10px 14px',
            background: '#0a1628',
            border: '1px solid #1e3a5f',
            borderRadius: 8,
          }}
        >
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>
            Итого по дням:
          </span>
          {summary.map((s) => (
            <span
              key={String(s.date)}
              style={{
                background: '#1e3a5f',
                color: '#93c5fd',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {formatDay(s.date)} — {s.total_quantity} шт
              {s.total_documents > 0 ? ` · ${s.total_documents} док.` : ''}
            </span>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
          Загрузка журнала…
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a237e' }}>
                {[
                  'Дата',
                  'Артикул',
                  'Цвет',
                  'Размер',
                  'Кол-во',
                  'Кто напечатал',
                ].map((h) => (
                  <th key={h} style={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 40,
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    Записей не найдено
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                    }}
                  >
                    <td style={TD}>{formatDateTime(r.printed_at)}</td>
                    <td style={{ ...TD, color: '#a3e635', fontWeight: 600 }}>
                      {r.article || r.barcode || '—'}
                    </td>
                    <td style={TD}>{r.color || '—'}</td>
                    <td style={TD}>{r.size || '—'}</td>
                    <td
                      style={{
                        ...TD,
                        textAlign: 'center',
                        fontWeight: 700,
                        color: '#4ade80',
                      }}
                    >
                      {r.quantity}
                    </td>
                    <td style={TD}>{r.printed_by_name || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr style={{ background: '#1e3a5f' }}>
                  <td colSpan={4} style={{ ...TD, fontWeight: 700, color: '#cbd5e1' }}>
                    Итого по фильтру
                  </td>
                  <td
                    style={{
                      ...TD,
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#a3e635',
                    }}
                  >
                    {totalQty}
                  </td>
                  <td style={TD} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  );
}
