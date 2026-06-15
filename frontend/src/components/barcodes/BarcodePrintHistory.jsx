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

export default function BarcodePrintHistory({ documentId, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!documentId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({
        barcode_id: String(documentId),
        document_id: String(documentId),
      });
      const data = await api.get(`/api/barcodes/print-log?${q}`);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!documentId) {
    return (
      <div style={{ color: '#64748b', fontSize: 12, padding: 16, textAlign: 'center' }}>
        Выберите документ
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ color: '#64748b', fontSize: 12, padding: 16, textAlign: 'center' }}>
        Загрузка истории…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: 12, padding: 16, textAlign: 'center' }}>
        Печать по этому документу ещё не выполнялась
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#1a237e' }}>
            {['Дата', 'Артикул', 'Количество', 'Напечатал', 'Примечание'].map((h) => (
              <th key={h} style={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              style={{
                background: i % 2 === 0 ? '#0a1020' : '#0f172a',
              }}
            >
              <td style={TD}>{formatDateTime(r.printed_at)}</td>
              <td style={{ ...TD, color: '#a3e635', fontWeight: 600 }}>
                {r.article || r.barcode || '—'}
                {r.color || r.size ? (
                  <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                    {[r.color, r.size].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </td>
              <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{r.quantity}</td>
              <td style={TD}>{r.printed_by_name || '—'}</td>
              <td style={{ ...TD, color: '#94a3b8', maxWidth: 160 }}>
                {r.notes && !r.notes.startsWith('{') ? r.notes : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
