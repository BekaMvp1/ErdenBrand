/**
 * Универсальный блок справочника (список + добавление + удаление)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';
import { cellStr, downloadReferenceTemplate, readExcelDataRows } from '../utils/referenceExcel';

const grayBtnStyle = {
  background: '#4a4a4a',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 16px',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 500,
};

export function RefSection({
  title,
  endpoint,
  canMutate = true,
  /** @type {'name' | 'operations' | null} */
  excelMode = null,
  templateFileName = 'справочник',
}) {
  const [items, setItems] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(endpoint);
      setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRefreshOnVisible(reload);

  const handleAdd = async () => {
    if (!canMutate) return;
    const name = newName.trim();
    if (!name) return;
    try {
      const row = await api.post(endpoint, { name });
      setItems((prev) => [...prev, row]);
      setNewName('');
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Не удалось добавить');
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canMutate || !excelMode) return;
    setImporting(true);
    let count = 0;
    let failed = 0;
    try {
      const dataRows = await readExcelDataRows(file);
      for (const row of dataRows) {
        const name = cellStr(row[0]);
        if (!name) continue;
        // API model-refs принимает только { name }; колонки B/C в режиме operations в файле — для ориентира, не сохраняются
        try {
          await api.post(endpoint, { name });
          count += 1;
        } catch (err) {
          failed += 1;
          console.error(err);
        }
      }
      await reload();
      if (count === 0 && failed === 0) {
        alert('Нет строк с заполненным названием (колонка A).');
      } else if (failed) {
        alert(`Загружено ${count} записей. Не удалось: ${failed}.`);
      } else {
        alert(`Загружено ${count} записей`);
      }
    } catch (err) {
      alert(err?.message || 'Не удалось прочитать файл');
    } finally {
      setImporting(false);
    }
  };

  const handleTemplate = () => {
    if (!excelMode) return;
    downloadReferenceTemplate(excelMode, templateFileName);
  };

  const handleDelete = async (id) => {
    if (!canMutate) return;
    if (!window.confirm('Удалить запись?')) return;
    try {
      await api.delete(`${endpoint}/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Не удалось удалить');
    }
  };

  return (
    <div>
      {canMutate ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
            placeholder={`Добавить ${title}...`}
            style={{
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #333',
              borderRadius: 6,
              padding: '6px 12px',
              flex: 1,
              minWidth: 160,
            }}
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            style={{
              background: '#C8FF00',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            + Добавить
          </button>
          {excelMode ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(ev) => void handleImportExcel(ev)}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...grayBtnStyle,
                  opacity: importing ? 0.6 : 1,
                  cursor: importing ? 'wait' : 'pointer',
                }}
              >
                📥 Импорт Excel
              </button>
              <button type="button" onClick={handleTemplate} style={grayBtnStyle}>
                📤 Шаблон
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#2a2a2a' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#aaa' }}>Название</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                <td style={{ padding: '8px 12px', color: '#fff' }}>{item.name}</td>
                <td style={{ textAlign: 'center' }}>
                  {canMutate ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f44336',
                        cursor: 'pointer',
                        fontSize: 16,
                      }}
                    >
                      🗑
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: 16, color: '#555', textAlign: 'center' }}>
                  Список пуст
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
