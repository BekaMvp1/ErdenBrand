import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import {
  BARCODE_CATALOG_API,
  BARCODE_DOCS_API,
  BARCODE_PRINT_DOCS_API,
  barcodeDocumentApi,
  defaultPrintDocName,
} from './barcodeApi';

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
  padding: '6px 8px',
  border: '1px solid #111',
  verticalAlign: 'middle',
  color: '#e2e8f0',
  fontSize: 12,
};

const emptyItem = () => ({
  catalogKey: '',
  barcode_id: '',
  quantity: 1,
  article: '',
  color: '',
  size: '',
  barcode: '',
  tz: '',
  row_index: null,
});

function rowsToFormItems(docId, tz, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const mapped = list
    .map((row, rowIndex) => {
      const article = String(row.article || '').trim();
      const barcode = String(row.barcode || '').trim();
      if (!article && !barcode) return null;
      const idx = row.row_index ?? rowIndex;
      return {
        catalogKey: `${docId}:${idx}`,
        barcode_id: docId,
        quantity: parseInt(row.quantity ?? row.qty ?? 1, 10) || 1,
        article,
        color: String(row.color || '').trim(),
        size: String(row.size || '').trim(),
        barcode,
        tz: tz || '',
        row_index: idx,
      };
    })
    .filter(Boolean);
  return mapped.length ? mapped : [emptyItem()];
}

export default function BarcodePrintDocForm({ open, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(() => defaultPrintDocName());
  const [printedAt, setPrintedAt] = useState(today);
  const [items, setItems] = useState([emptyItem()]);
  const [catalog, setCatalog] = useState([]);
  const [catalogQ, setCatalogQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [sourceDocs, setSourceDocs] = useState([]);
  const [sourceDocId, setSourceDocId] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultPrintDocName());
    setPrintedAt(today);
    setItems([emptyItem()]);
    setCatalogQ('');
    setSourceDocId('');
    api
      .get(BARCODE_DOCS_API)
      .then((data) => setSourceDocs(Array.isArray(data) ? data : []))
      .catch(() => setSourceDocs([]));
  }, [open, today]);

  const loadCatalog = useCallback(async (q) => {
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const data = await api.get(`${BARCODE_CATALOG_API}${params}`);
      setCatalog(Array.isArray(data) ? data : []);
    } catch {
      setCatalog([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => loadCatalog(catalogQ), 250);
    return () => clearTimeout(t);
  }, [open, catalogQ, loadCatalog]);

  const onSelectCatalog = (idx, key) => {
    const entry = catalogOptions.find((c) => c.key === key);
    if (!entry) {
      updateItem(idx, { catalogKey: '', barcode_id: '' });
      return;
    }
    updateItem(idx, {
      catalogKey: key,
      barcode_id: entry.barcode_id,
      article: entry.article,
      color: entry.color,
      size: entry.size,
      barcode: entry.barcode,
      tz: entry.tz,
      row_index: entry.row_index,
    });
  };

  const catalogOptions = useMemo(() => catalog, [catalog]);

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSelectSourceDoc = async (docId) => {
    setSourceDocId(docId);
    if (!docId) return;

    setLoadingSource(true);
    try {
      const data = await api.get(barcodeDocumentApi(docId));
      setItems(rowsToFormItems(data.id, data.tz, data.items));
      if (data.tz) {
        setName(`Печать ${data.tz}`);
      }
      await loadCatalog('');
    } catch (err) {
      alert(err?.message || 'Не удалось загрузить документ');
      setSourceDocId('');
    } finally {
      setLoadingSource(false);
    }
  };

  const handleClearSourceDoc = () => {
    setSourceDocId('');
    setItems([emptyItem()]);
  };

  const handleSave = async () => {
    const payloadItems = items
      .filter((it) => it.barcode_id && parseInt(it.quantity, 10) > 0)
      .map((it) => ({
        barcode_id: parseInt(it.barcode_id, 10),
        quantity: parseInt(it.quantity, 10) || 1,
        row_meta: {
          article: it.article || '',
          color: it.color || '',
          size: it.size || '',
          barcode: it.barcode || '',
          tz: it.tz || '',
          row_index: it.row_index,
        },
      }));

    if (!name.trim()) {
      alert('Укажите название');
      return;
    }
    if (!payloadItems.length) {
      alert('Добавьте хотя бы одну позицию');
      return;
    }

    setSaving(true);
    try {
      const doc = await api.post(BARCODE_PRINT_DOCS_API, {
        name: name.trim(),
        printed_at: printedAt,
        status: 'draft',
        items: payloadItems,
      });
      onSaved?.(doc);
      onClose?.();
    } catch (err) {
      alert(err?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
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
            marginBottom: 20,
          }}
        >
          <div style={{ color: '#a3e635', fontSize: 18, fontWeight: 700 }}>
            + Создать документ печати
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

        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: '#0a1628',
            border: '1px solid #1e3a5f',
            borderRadius: 8,
          }}
        >
          <label style={{ ...LABEL, marginBottom: 8 }}>
            Заполнить из документа (необязательно)
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={sourceDocId}
              disabled={loadingSource}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  handleClearSourceDoc();
                  return;
                }
                void handleSelectSourceDoc(id);
              }}
              style={{ ...INPUT, flex: 1, minWidth: 220 }}
            >
              <option value="">Выбрать ТЗ документ…</option>
              {sourceDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  ТЗ: {d.tz || d.id}
                  {d.name ? ` — ${d.name}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!sourceDocId && items.length <= 1 && !items[0]?.barcode_id}
              onClick={handleClearSourceDoc}
              style={{
                background: '#1e2a3a',
                color: '#94a3b8',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              Очистить
            </button>
          </div>
          {loadingSource ? (
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>
              Загрузка позиций…
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <label style={LABEL}>Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Дата печати</label>
            <input
              type="date"
              value={printedAt}
              onChange={(e) => setPrintedAt(e.target.value)}
              style={INPUT}
            />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            value={catalogQ}
            onChange={(e) => setCatalogQ(e.target.value)}
            placeholder="Поиск по артикулу, цвету, размеру…"
            style={{ ...INPUT, marginBottom: 8 }}
          />
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, emptyItem()])}
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
            + Добавить позицию
          </button>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a237e' }}>
                {['№', 'Штрихкод (справочник)', 'Артикул', 'Цвет', 'Размер', 'Кол-во', ''].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 10px',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        border: '1px solid #1e3a5f',
                        textAlign: 'left',
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? '#0a1020' : '#0f172a' }}
                >
                  <td style={{ ...TD, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={TD}>
                    <select
                      value={row.catalogKey}
                      onChange={(e) => onSelectCatalog(i, e.target.value)}
                      style={{ ...INPUT, fontSize: 12 }}
                    >
                      <option value="">— Выберите —</option>
                      {catalogOptions.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.article || c.barcode || '—'}
                          {c.color ? ` · ${c.color}` : ''}
                          {c.size ? ` · ${c.size}` : ''}
                          {c.tz ? ` (${c.tz})` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...TD, color: '#a3e635' }}>{row.article || '—'}</td>
                  <td style={TD}>{row.color || '—'}</td>
                  <td style={TD}>{row.size || '—'}</td>
                  <td style={TD}>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={(e) =>
                        updateItem(i, {
                          quantity: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      style={{
                        ...INPUT,
                        width: 70,
                        textAlign: 'center',
                        color: '#a3e635',
                        fontWeight: 700,
                      }}
                    />
                  </td>
                  <td style={TD}>
                    {items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.filter((_, j) => j !== i))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: 16,
                        }}
                      >
                        🗑
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={saving}
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
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Сохранение…' : '✅ Сохранить'}
          </button>
          <button
            type="button"
            onClick={onClose}
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
  );
}
