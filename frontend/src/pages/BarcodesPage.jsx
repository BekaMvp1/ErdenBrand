import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import BarcodePrintHistory from '../components/barcodes/BarcodePrintHistory';
import BarcodePrintJournal from '../components/barcodes/BarcodePrintJournal';

const LABEL_SIZES = [
  {
    key: '58x40',
    label: '58 × 40 мм',
    desc: 'Стандарт WB/OZON',
    width: 58,
    height: 40,
  },
  {
    key: '58x30',
    label: '58 × 30 мм',
    desc: 'Компактная',
    width: 58,
    height: 30,
  },
  {
    key: '40x25',
    label: '40 × 25 мм',
    desc: 'Маленькая',
    width: 40,
    height: 25,
  },
  {
    key: '100x50',
    label: '100 × 50 мм',
    desc: 'Большая',
    width: 100,
    height: 50,
  },
  {
    key: '100x150',
    label: '100 × 150 мм',
    desc: 'A6 / товарная',
    width: 100,
    height: 150,
  },
  {
    key: 'custom',
    label: 'Свой размер',
    desc: 'Указать вручную',
    width: 0,
    height: 0,
  },
];

export default function BarcodesPage() {
  const [pageTab, setPageTab] = useState('docs');
  const [printModalTab, setPrintModalTab] = useState('print');
  const [printHistoryKey, setPrintHistoryKey] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [printItems, setPrintItems] = useState([]);
  const [showPrint, setShowPrint] = useState(false);
  const [labelSize, setLabelSize] = useState({
    width: 58,
    height: 40,
    key: '58x40',
  });
  const [customW, setCustomW] = useState(58);
  const [customH, setCustomH] = useState(40);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    tz: '',
    name: '',
    note: '',
  });

  const [rows, setRows] = useState([
    { barcode: '', article: '', color: '', size: '', qty: 1 },
  ]);

  useEffect(() => {
    api
      .get('/api/barcodes')
      .then((data) => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { barcode: '', article: '', color: '', size: '', qty: 1 },
    ]);
  };

  const removeRow = (i) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateRow = (i, field, val) => {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: val } : r))
    );
  };

  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const imported = data
          .slice(1)
          .filter((r) => r.length > 0 && r.some((c) => c))
          .map((r) => ({
            barcode: String(r[0] || '').trim(),
            article: String(r[1] || '').trim(),
            color: String(r[2] || '').trim(),
            size: String(r[3] || '').trim(),
            qty: parseInt(r[4] || 1, 10) || 1,
          }))
          .filter((r) => r.barcode || r.article);

        if (imported.length > 0) {
          setRows(imported);
          alert(`✅ Импортировано ${imported.length} строк из Excel`);
        } else {
          alert('⚠️ Не найдено данных в файле');
        }
      } catch (err) {
        alert(`❌ Ошибка чтения файла: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!form.tz) {
      alert('⚠️ Укажите ТЗ');
      return;
    }
    const validRows = rows.filter((r) => r.barcode || r.article);
    if (validRows.length === 0) {
      alert('⚠️ Добавьте хотя бы одну строку');
      return;
    }
    try {
      const res = await api.post('/api/barcodes', { ...form, rows: validRows });
      setDocuments((prev) => [res, ...prev]);
      setShowForm(false);
      setForm({ tz: '', name: '', note: '' });
      setRows([{ barcode: '', article: '', color: '', size: '', qty: 1 }]);
      alert('✅ Документ сохранён!');
    } catch (err) {
      alert(`❌ Ошибка: ${err.message}`);
    }
  };

  const parseDocRows = (doc) => {
    if (Array.isArray(doc.rows)) return doc.rows;
    try {
      return JSON.parse(doc.rows || '[]');
    } catch {
      return [];
    }
  };

  const handlePrint = (doc) => {
    const docRows = parseDocRows(doc);
    setPrintItems(
      docRows.map((r) => ({
        ...r,
        tz: doc.tz,
        printQty: r.qty || 1,
      }))
    );
    setSelectedDoc(doc);
    setPrintModalTab('print');
    setShowPrint(true);
  };

  const logPrintEntries = async (docId, items) => {
    for (const item of items) {
      const notes = JSON.stringify({
        article: item.article || '',
        color: item.color || '',
        size: item.size || '',
        barcode: item.barcode || '',
      });
      await api.post('/api/barcodes/print-log', {
        barcode_id: docId,
        document_id: docId,
        quantity: parseInt(item.printQty || 1, 10) || 1,
        notes,
      });
    }
    setPrintHistoryKey((k) => k + 1);
  };

  const docDate = (doc) => {
    const raw = doc.created_at || doc.createdAt;
    return raw ? new Date(raw).toLocaleDateString('ru-RU') : '—';
  };

  return (
    <div
      style={{
        padding: '24px',
        background: '#020b18',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            color: '#e2e8f0',
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
          }}
        >
          ▦ Штрихкоды
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
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

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 20,
          borderBottom: '1px solid #1e3a5f',
          paddingBottom: 8,
        }}
      >
        {[
          { key: 'docs', label: '▦ Документы' },
          { key: 'journal', label: '📋 Журнал печати ШК' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setPageTab(tab.key)}
            style={{
              background: pageTab === tab.key ? '#1e3a5f' : 'transparent',
              color: pageTab === tab.key ? '#93c5fd' : '#64748b',
              border: '1px solid',
              borderColor: pageTab === tab.key ? '#3b82f6' : '#1e2a3a',
              borderRadius: 8,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: pageTab === tab.key ? 700 : 500,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {pageTab === 'journal' ? (
        <div
          style={{
            background: '#0a1628',
            border: '1px solid #1e3a5f',
            borderRadius: 12,
            padding: '16px 20px',
          }}
        >
          <BarcodePrintJournal />
        </div>
      ) : (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {documents.length === 0 ? (
          <div
            style={{
              background: '#0a1628',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: 40 }}>▦</div>
            <div style={{ marginTop: 8 }}>Документов пока нет</div>
          </div>
        ) : (
          documents.map((doc) => {
            const docRows = parseDocRows(doc);
            return (
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
                      ТЗ: {doc.tz}
                    </div>
                    {doc.name && (
                      <div
                        style={{
                          color: '#cbd5e1',
                          fontSize: 13,
                          marginTop: 2,
                        }}
                      >
                        {doc.name}
                      </div>
                    )}
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        marginTop: 4,
                      }}
                    >
                      📋 {docRows.length} позиций • {docDate(doc)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handlePrint(doc)}
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
                      🖨️ Печать
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Удалить?')) return;
                        await api.delete(`/api/barcodes/${doc.id}`);
                        setDocuments((prev) =>
                          prev.filter((d) => d.id !== doc.id)
                        );
                      }}
                      style={{
                        background: '#2a0a0a',
                        color: '#f87171',
                        border: '1px solid #f87171',
                        borderRadius: 8,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginTop: 10,
                  }}
                >
                  {docRows.slice(0, 5).map((r, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #1e3a5f',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                    >
                      {r.article || r.barcode}
                      {r.color ? ` · ${r.color}` : ''}
                      {r.size ? ` · ${r.size}` : ''}
                    </div>
                  ))}
                  {docRows.length > 5 && (
                    <div
                      style={{
                        color: '#475569',
                        fontSize: 11,
                        padding: '4px 6px',
                      }}
                    >
                      +{docRows.length - 5} ещё
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {showForm && (
        <>
          <div
            role="presentation"
            onClick={() => setShowForm(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #a3e635',
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
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#a3e635',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                ▦ Создать документ штрихкодов
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
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

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <label style={LABEL}>ТЗ</label>
                <input
                  type="text"
                  value={form.tz}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tz: e.target.value }))
                  }
                  placeholder="26/204"
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Название документа</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Прюки прок Атлас..."
                  style={INPUT}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={addRow}
                style={{
                  background: '#1e3a5f',
                  color: '#93c5fd',
                  border: '1px solid #1e3a5f',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                + Добавить строку
              </button>

              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                ref={fileInputRef}
                onChange={handleExcelImport}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#0a2a0a',
                  color: '#4ade80',
                  border: '1px solid #16a34a',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                📊 Импорт из Excel
              </button>

              <button
                type="button"
                onClick={() => {
                  const wb = XLSX.utils.book_new();
                  const templateData = [
                    ['ШК (штрихкод)', 'Артикул', 'Цвет', 'Размер', 'Кол-во'],
                    ['4660000000001', 'ART-001-BLK', 'Чёрный', 'S', 10],
                    ['4660000000002', 'ART-001-BLK', 'Чёрный', 'M', 15],
                    ['4660000000003', 'ART-001-BLK', 'Чёрный', 'L', 12],
                    ['4660000000004', 'ART-001-WHT', 'Белый', 'S', 8],
                    ['4660000000005', 'ART-001-WHT', 'Белый', 'M', 10],
                  ];
                  const ws = XLSX.utils.aoa_to_sheet(templateData);
                  ws['!cols'] = [
                    { wch: 18 },
                    { wch: 16 },
                    { wch: 12 },
                    { wch: 8 },
                    { wch: 8 },
                  ];
                  XLSX.utils.book_append_sheet(wb, ws, 'Штрихкоды');
                  XLSX.writeFile(wb, 'шаблон_штрихкоды.xlsx');
                }}
                style={{
                  background: '#2a1a00',
                  color: '#fbbf24',
                  border: '1px solid #fbbf24',
                  borderRadius: 8,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                📥 Скачать шаблон
              </button>

              <div
                style={{
                  color: '#475569',
                  fontSize: 11,
                  padding: '8px 0',
                  marginLeft: 4,
                }}
              >
                Формат Excel: ШК | Артикул | Цвет | Размер | Кол-во
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: '#1a237e' }}>
                    {[
                      '№',
                      'ШК (штрихкод)',
                      'Артикул',
                      'Цвет',
                      'Размер',
                      'Кол-во',
                      '',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          border: '1px solid #1e3a5f',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                      }}
                    >
                      <td
                        style={{
                          ...TD,
                          color: '#64748b',
                          width: 30,
                          textAlign: 'center',
                        }}
                      >
                        {i + 1}
                      </td>
                      <td style={TD}>
                        <input
                          type="text"
                          value={row.barcode}
                          onChange={(e) =>
                            updateRow(i, 'barcode', e.target.value)
                          }
                          placeholder="4660000000000"
                          style={{
                            ...CELL_INPUT,
                            fontFamily: 'monospace',
                            fontSize: 12,
                            letterSpacing: 1,
                          }}
                        />
                      </td>
                      <td style={TD}>
                        <input
                          type="text"
                          value={row.article}
                          onChange={(e) =>
                            updateRow(i, 'article', e.target.value)
                          }
                          placeholder="ART-001"
                          style={CELL_INPUT}
                        />
                      </td>
                      <td style={TD}>
                        <input
                          type="text"
                          value={row.color}
                          onChange={(e) =>
                            updateRow(i, 'color', e.target.value)
                          }
                          placeholder="Чёрный"
                          style={CELL_INPUT}
                        />
                      </td>
                      <td style={TD}>
                        <input
                          type="text"
                          value={row.size}
                          onChange={(e) =>
                            updateRow(i, 'size', e.target.value)
                          }
                          placeholder="M / 44"
                          style={{
                            ...CELL_INPUT,
                            width: 60,
                          }}
                        />
                      </td>
                      <td style={TD}>
                        <input
                          type="number"
                          value={row.qty}
                          onChange={(e) =>
                            updateRow(
                              i,
                              'qty',
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          min="1"
                          style={{
                            ...CELL_INPUT,
                            width: 60,
                            textAlign: 'center',
                            color: '#a3e635',
                            fontWeight: 700,
                          }}
                        />
                      </td>
                      <td style={{ ...TD, width: 36 }}>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            style={{
                              background: 'none',
                              color: '#f87171',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 16,
                              padding: '2px 4px',
                            }}
                          >
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                color: '#64748b',
                fontSize: 12,
                marginTop: 8,
                marginBottom: 16,
              }}
            >
              Позиций: {rows.filter((r) => r.barcode || r.article).length} ·
              Всего этикеток:{' '}
              {rows.reduce((s, r) => s + parseInt(r.qty || 1, 10), 0)}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSave}
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
                }}
              >
                ✅ Сохранить документ
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </>
      )}

      {showPrint && selectedDoc && (
        <>
          <div
            role="presentation"
            onClick={() => setShowPrint(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              padding: '24px',
              width: 700,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#a3e635',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                🖨️ Печать термоэтикеток
              </div>
              <button
                type="button"
                onClick={() => setShowPrint(false)}
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

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 16,
                borderBottom: '1px solid #1e2a3a',
                paddingBottom: 8,
              }}
            >
              {[
                { key: 'print', label: '🖨️ Печать' },
                { key: 'history', label: '📋 История печати' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPrintModalTab(tab.key)}
                  style={{
                    background:
                      printModalTab === tab.key ? '#1e3a5f' : 'transparent',
                    color: printModalTab === tab.key ? '#93c5fd' : '#64748b',
                    border: 'none',
                    borderBottom:
                      printModalTab === tab.key
                        ? '2px solid #3b82f6'
                        : '2px solid transparent',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: printModalTab === tab.key ? 700 : 500,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {printModalTab === 'history' ? (
              <BarcodePrintHistory
                documentId={selectedDoc?.id}
                refreshKey={printHistoryKey}
              />
            ) : (
              <>
            <div
              style={{
                background: '#0a1628',
                border: '1px solid #1e3a5f',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ color: '#64748b', fontSize: 12 }}>
                ТЗ:{' '}
                <b style={{ color: '#a3e635' }}>{selectedDoc.tz}</b>
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Позиций:{' '}
                <b style={{ color: '#e2e8f0' }}>{printItems.length}</b>
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>
                Всего этикеток:{' '}
                <b style={{ color: '#4ade80' }}>
                  {printItems.reduce(
                    (s, r) => s + parseInt(r.printQty || 1, 10),
                    0
                  )}
                </b>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                📐 Размер термоэтикетки
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {LABEL_SIZES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setLabelSize(s);
                      if (s.key !== 'custom') {
                        setCustomW(s.width);
                        setCustomH(s.height);
                      }
                    }}
                    style={{
                      background:
                        labelSize.key === s.key ? '#1e3a5f' : '#0a1628',
                      color: labelSize.key === s.key ? '#93c5fd' : '#64748b',
                      border: '1px solid',
                      borderColor:
                        labelSize.key === s.key ? '#3b82f6' : '#1e2a3a',
                      borderRadius: 8,
                      padding: '8px 6px',
                      cursor: 'pointer',
                      fontSize: 11,
                      textAlign: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 12,
                        marginBottom: 2,
                      }}
                    >
                      {s.label}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{s.desc}</div>
                  </button>
                ))}
              </div>

              {labelSize.key === 'custom' && (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  <span style={{ color: '#64748b', fontSize: 12 }}>Ширина:</span>
                  <input
                    type="number"
                    value={customW}
                    onChange={(e) =>
                      setCustomW(parseInt(e.target.value, 10) || 58)
                    }
                    style={{
                      width: 60,
                      background: '#1e2a3a',
                      color: '#e2e8f0',
                      border: '1px solid #374151',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ color: '#64748b', fontSize: 12 }}>
                    мм × Высота:
                  </span>
                  <input
                    type="number"
                    value={customH}
                    onChange={(e) =>
                      setCustomH(parseInt(e.target.value, 10) || 40)
                    }
                    style={{
                      width: 60,
                      background: '#1e2a3a',
                      color: '#e2e8f0',
                      border: '1px solid #374151',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ color: '#64748b', fontSize: 12 }}>мм</span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    border: '2px solid #3b82f6',
                    borderRadius: 4,
                    width: Math.min(
                      (labelSize.key === 'custom' ? customW : labelSize.width) *
                        1.5,
                      120
                    ),
                    height: Math.min(
                      (labelSize.key === 'custom' ? customH : labelSize.height) *
                        1.5,
                      80
                    ),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    color: '#64748b',
                    flexShrink: 0,
                  }}
                >
                  {labelSize.key === 'custom'
                    ? `${customW}×${customH}`
                    : `${labelSize.width}×${labelSize.height}`}
                </div>
                <div style={{ color: '#475569', fontSize: 11 }}>
                  Примерный размер этикетки
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                marginBottom: 16,
                maxHeight: 350,
                overflowY: 'auto',
              }}
            >
              {printItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#0a1628',
                    border: '1px solid #1e3a5f',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.selected !== false}
                    onChange={(e) => {
                      setPrintItems((prev) =>
                        prev.map((r, j) =>
                          j === i
                            ? { ...r, selected: e.target.checked }
                            : r
                        )
                      );
                    }}
                    style={{
                      width: 16,
                      height: 16,
                      cursor: 'pointer',
                    }}
                  />

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        color: '#a3e635',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {item.barcode || '—'}
                    </div>
                    <div
                      style={{
                        color: '#94a3b8',
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {item.article}
                      {item.color ? ` · ${item.color}` : ''}
                      {item.size ? ` · ${item.size}` : ''}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ color: '#64748b', fontSize: 11 }}>
                      Кол-во:
                    </span>
                    <input
                      type="number"
                      value={item.printQty || 1}
                      onChange={(e) => {
                        setPrintItems((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  printQty:
                                    parseInt(e.target.value, 10) || 1,
                                }
                              : r
                          )
                        );
                      }}
                      min="1"
                      style={{
                        width: 60,
                        background: '#1e2a3a',
                        color: '#a3e635',
                        border: '1px solid #374151',
                        borderRadius: 6,
                        padding: '4px 6px',
                        fontSize: 13,
                        fontWeight: 700,
                        textAlign: 'center',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setPrintItems((prev) =>
                    prev.map((r) => ({ ...r, selected: true }))
                  )
                }
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                ✓ Выбрать все
              </button>
              <button
                type="button"
                onClick={() =>
                  setPrintItems((prev) =>
                    prev.map((r) => ({ ...r, selected: false }))
                  )
                }
                style={{
                  background: '#1e2a3a',
                  color: '#64748b',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                ✕ Снять все
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                const selected = printItems.filter(
                  (r) => r.selected !== false
                );
                if (selected.length === 0) {
                  alert('Выберите позиции');
                  return;
                }

                try {
                  await logPrintEntries(selectedDoc.id, selected);
                } catch (err) {
                  console.error('[print-log]', err);
                }

                const printWin = window.open(
                  '',
                  '_blank',
                  'width=800,height=600'
                );

                const expanded = [];
                selected.forEach((item) => {
                  for (
                    let n = 0;
                    n < parseInt(item.printQty || 1, 10);
                    n += 1
                  ) {
                    expanded.push(item);
                  }
                });

                const w =
                  labelSize.key === 'custom' ? customW : labelSize.width;
                const h =
                  labelSize.key === 'custom' ? customH : labelSize.height;

                printWin.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Этикетки — ${selectedDoc.tz}</title>
  <style>
    * { margin:0; padding:0;
        box-sizing:border-box; }
    body { background:#fff; }

    .label {
      width: ${w}mm;
      height: ${h}mm;
      padding: 1.5mm 2mm;
      display: inline-block;
      vertical-align: top;
      overflow: hidden;
      page-break-inside: avoid;
      font-family: Arial, sans-serif;
      border: 0.5mm solid #000;
    }

    .tz {
      font-size: 7pt;
      font-weight: 900;
      color: #000;
      margin-bottom: 0.5mm;
      letter-spacing: 0.5px;
    }

    .barcode-font {
      font-family: 'Libre Barcode 128', monospace;
      font-size: ${Math.round(h * 0.7)}pt;
      line-height: 1;
      display: block;
      margin-bottom: 0;
      text-align: left;
    }

    .barcode-num {
      font-size: 6pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 1mm;
      letter-spacing: 1.5px;
      color: #000;
    }

    .article {
      font-size: ${Math.max(10, Math.round(h * 0.28))}pt;
      font-weight: 900;
      color: #000;
      margin-bottom: 1mm;
      letter-spacing: 0.3px;
      line-height: 1.1;
    }

    .bottom-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
    }

    .color-text {
      font-size: ${Math.max(9, Math.round(h * 0.22))}pt;
      font-weight: 800;
      color: #000;
    }

    .size-box {
      font-size: ${Math.max(12, Math.round(h * 0.35))}pt;
      font-weight: 900;
      border: 2.5px solid #000;
      padding: 0.5mm 2.5mm;
      display: inline-block;
      line-height: 1.1;
      letter-spacing: -0.5px;
    }

    @media print {
      @page {
        size: ${w}mm ${h}mm;
        margin: 0;
      }
      body { margin: 0; }
      .label {
        border: none;
        width: ${w}mm;
        height: ${h}mm;
      }
    }
  </style>
  <link
    href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap"
    rel="stylesheet"
  >
</head>
<body>
  ${expanded
    .map(
      (item) => `
  <div class="label">

    <div class="tz">
      ТЗ: ${item.tz || ''}
    </div>

    ${
      item.barcode
        ? `
      <div class="barcode-font">
        ${item.barcode}
      </div>
      <div class="barcode-num">
        ${item.barcode}
      </div>
    `
        : ''
    }

    <div class="article">
      ${item.article || ''}
    </div>

    <div class="bottom-row">
      <span class="color-text">
        ${item.color || ''}
      </span>
      ${
        item.size
          ? `
        <span class="size-box">
          ${item.size}
        </span>
      `
          : ''
      }
    </div>

  </div>
`
    )
    .join('')}
</body>
</html>
                `);
                printWin.document.close();
                printWin.onload = () => {
                  setTimeout(() => {
                    printWin.focus();
                    printWin.print();
                  }, 500);
                };
              }}
              style={{
                width: '100%',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              🖨️ Распечатать термоэтикетки (
              {printItems
                .filter((r) => r.selected !== false)
                .reduce(
                  (s, r) => s + parseInt(r.printQty || 1, 10),
                  0
                )}{' '}
              шт)
            </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const LABEL = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 6,
  fontWeight: 600,
};
const INPUT = {
  width: '100%',
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};
const TD = {
  padding: '4px 6px',
  border: '1px solid #111',
  verticalAlign: 'middle',
};
const CELL_INPUT = {
  width: '100%',
  background: '#1e2a3a',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  boxSizing: 'border-box',
};
