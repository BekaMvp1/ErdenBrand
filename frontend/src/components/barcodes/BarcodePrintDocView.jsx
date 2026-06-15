import { useEffect, useState } from 'react';
import { api } from '../../api';
import {
  BARCODE_PRINT_DOCS_API,
  formatPrintDate,
  formatStatus,
} from './barcodeApi';
import { openThermalPrintWindow } from './barcodeThermalPrint';

const LABEL_SIZES = [
  { key: '58x40', label: '58 × 40 мм', width: 58, height: 40 },
  { key: '58x30', label: '58 × 30 мм', width: 58, height: 30 },
  { key: '40x25', label: '40 × 25 мм', width: 40, height: 25 },
];

const TH = {
  padding: '8px 10px',
  textAlign: 'left',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid #1e3a5f',
};

const TD = {
  padding: '8px 10px',
  border: '1px solid #111',
  color: '#e2e8f0',
  fontSize: 12,
  verticalAlign: 'middle',
};

export default function BarcodePrintDocView({ docId, open, onClose, onUpdated }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labelSize, setLabelSize] = useState(LABEL_SIZES[0]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !docId) {
      setDoc(null);
      return;
    }
    setLoading(true);
    api
      .get(`${BARCODE_PRINT_DOCS_API}/${docId}`)
      .then((data) => setDoc(data))
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [open, docId]);

  const handlePrint = async () => {
    if (!doc?.items?.length) return;
    setPrinting(true);
    try {
      const printItems = doc.items.map((it) => ({
        tz: it.tz || '',
        article: it.article || '',
        color: it.color || '',
        size: it.size || '',
        barcode: it.barcode || '',
        printQty: it.quantity || 1,
        selected: true,
      }));

      const result = openThermalPrintWindow({
        items: printItems,
        title: doc.name,
        labelWidth: labelSize.width,
        labelHeight: labelSize.height,
        printDate: doc.printed_at,
      });

      if (!result.ok) {
        alert(result.error || 'Ошибка печати');
        return;
      }

      const updated = await api.post(`${BARCODE_PRINT_DOCS_API}/${doc.id}/print`);
      setDoc(updated);
      onUpdated?.(updated);

      for (const it of doc.items) {
        try {
          await api.post('/api/barcodes/print-log', {
            barcode_id: it.barcode_id,
            document_id: it.barcode_id,
            quantity: it.quantity,
            notes: JSON.stringify({
              article: it.article,
              color: it.color,
              size: it.size,
              barcode: it.barcode,
              print_doc_id: doc.id,
            }),
          });
        } catch {
          /* журнал — best effort */
        }
      }
    } catch (err) {
      alert(err?.message || 'Ошибка');
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    if (!doc || !confirm('Удалить документ?')) return;
    try {
      await api.delete(`${BARCODE_PRINT_DOCS_API}/${doc.id}`);
      onUpdated?.(null);
      onClose?.();
    } catch (err) {
      alert(err?.message || 'Ошибка удаления');
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 1100,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1101,
          background: '#0f172a',
          border: '1px solid #1e3a5f',
          borderRadius: 14,
          padding: '24px',
          width: 900,
          maxWidth: '95vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ color: '#a3e635', fontSize: 18, fontWeight: 700 }}>
            📋 {doc?.name || 'Документ печати'}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              color: '#64748b',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>
            Загрузка…
          </div>
        ) : !doc ? (
          <div style={{ color: '#f87171', padding: 40, textAlign: 'center' }}>
            Документ не найден
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                marginBottom: 16,
                padding: '12px 16px',
                background: '#0a1628',
                border: '1px solid #1e3a5f',
                borderRadius: 8,
              }}
            >
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Дата печати:{' '}
                <b style={{ color: '#e2e8f0' }}>{formatPrintDate(doc.printed_at)}</b>
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Статус:{' '}
                <b
                  style={{
                    color: doc.status === 'printed' ? '#4ade80' : '#fbbf24',
                  }}
                >
                  {formatStatus(doc.status)}
                </b>
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Позиций: <b style={{ color: '#e2e8f0' }}>{doc.items_count}</b>
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Этикеток: <b style={{ color: '#4ade80' }}>{doc.total_quantity}</b>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
                Размер этикетки
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {LABEL_SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setLabelSize(s)}
                    style={{
                      background:
                        labelSize.key === s.key ? '#1e3a5f' : '#0a1628',
                      color: labelSize.key === s.key ? '#93c5fd' : '#64748b',
                      border: '1px solid',
                      borderColor:
                        labelSize.key === s.key ? '#3b82f6' : '#1e2a3a',
                      borderRadius: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#1a237e' }}>
                    {[
                      'Артикул',
                      'Цвет',
                      'Размер',
                      'Штрихкод',
                      'Количество',
                    ].map((h) => (
                      <th key={h} style={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(doc.items || []).map((it, i) => (
                    <tr
                      key={it.id || i}
                      style={{
                        background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                      }}
                    >
                      <td style={{ ...TD, color: '#a3e635', fontWeight: 600 }}>
                        {it.article || '—'}
                      </td>
                      <td style={TD}>{it.color || '—'}</td>
                      <td style={TD}>{it.size || '—'}</td>
                      <td
                        style={{
                          ...TD,
                          fontFamily: 'monospace',
                          fontSize: 11,
                        }}
                      >
                        {it.barcode || '—'}
                      </td>
                      <td
                        style={{
                          ...TD,
                          textAlign: 'center',
                          fontWeight: 700,
                          color: '#4ade80',
                        }}
                      >
                        {it.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={printing}
                onClick={handlePrint}
                style={{
                  flex: 1,
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: printing ? 0.7 : 1,
                }}
              >
                🖨️ Распечатать этикетки ({doc.total_quantity} шт)
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  background: '#2a0a0a',
                  color: '#f87171',
                  border: '1px solid #f87171',
                  borderRadius: 8,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                🗑
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
