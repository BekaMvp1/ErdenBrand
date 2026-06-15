import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import {
  BARCODE_PRINT_DOCS_API,
  formatPrintDate,
  formatStatus,
} from './barcodeApi';
import BarcodePrintDocForm from './BarcodePrintDocForm';
import BarcodePrintDocView from './BarcodePrintDocView';

export default function BarcodePrintJournal() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(BARCODE_PRINT_DOCS_API);
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalLabels = docs.reduce(
    (s, d) => s + (parseInt(d.total_quantity, 10) || 0),
    0
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ color: '#64748b', fontSize: 12 }}>
          Документов: <b style={{ color: '#e2e8f0' }}>{docs.length}</b>
          {' · '}
          Этикеток всего: <b style={{ color: '#4ade80' }}>{totalLabels}</b>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            background: '#a3e635',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          + Создать документ
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
          Загрузка…
        </div>
      ) : docs.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            border: '1px dashed #1e3a5f',
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 36 }}>📋</div>
          <div style={{ marginTop: 8 }}>Документов печати пока нет</div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              marginTop: 16,
              background: '#1e3a5f',
              color: '#93c5fd',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            + Создать первый документ
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map((doc) => (
            <div
              key={doc.id}
              style={{
                background: '#0a1628',
                border: '1px solid #1e3a5f',
                borderRadius: 12,
                padding: '16px 20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      color: '#a3e635',
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {doc.name}
                  </div>
                  <div
                    style={{
                      color: '#64748b',
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    📅 {formatPrintDate(doc.printed_at)}
                    {' · '}
                    📋 {doc.items_count || 0} поз.
                    {' · '}
                    🏷 {doc.total_quantity || 0} этик.
                    {doc.created_by_name ? ` · ${doc.created_by_name}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      background:
                        doc.status === 'printed' ? '#0a2a0a' : '#1a1200',
                      color: doc.status === 'printed' ? '#4ade80' : '#fbbf24',
                      border: '1px solid',
                      borderColor:
                        doc.status === 'printed' ? '#16a34a44' : '#fbbf2444',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {formatStatus(doc.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewId(doc.id)}
                    style={{
                      background: '#1e3a5f',
                      color: '#93c5fd',
                      border: '1px solid #1e3a5f',
                      borderRadius: 8,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Открыть
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <BarcodePrintDocForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => {
          setShowCreate(false);
          load();
        }}
      />

      <BarcodePrintDocView
        docId={viewId}
        open={viewId != null}
        onClose={() => setViewId(null)}
        onUpdated={() => load()}
      />
    </div>
  );
}
