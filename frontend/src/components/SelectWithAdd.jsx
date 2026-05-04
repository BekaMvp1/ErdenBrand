import { useMemo, useState } from 'react';
import { Select, Input, Space, message } from 'antd';

/**
 * Выпадающий список по справочнику с добавлением новой строки внизу.
 */
function SelectWithAdd({
  value,
  onChange,
  options = [],
  readOnly,
  endpoint,
  refKey,
  addRef,
  onAdd,
  placeholder = '—',
}) {
  const [newVal, setNewVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(true);

  const canAdd =
    !readOnly &&
    (typeof onAdd === 'function' ||
      (typeof addRef === 'function' && endpoint != null && refKey != null));

  const mergedOptions = useMemo(() => {
    const list = [...options];
    const names = new Set(list.map((o) => o?.name).filter(Boolean));
    const v = value != null ? String(value).trim() : '';
    if (v && !names.has(v)) {
      list.push({ id: `__custom__${v}`, name: v });
    }
    return list.sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'ru', { sensitivity: 'base' }),
    );
  }, [options, value]);

  const selectOptions = mergedOptions.map((o) => ({
    value: o.name,
    label: o.name,
  }));

  const handleAdd = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('[handleAdd] newVal:', newVal);
    console.log('[handleAdd] onAdd:', typeof onAdd);

    if (!newVal.trim()) {
      console.log('[handleAdd] пустое значение');
      return;
    }

    setBusy(true);
    try {
      let result;
      if (typeof onAdd === 'function') {
        console.log('[handleAdd] вызываем onAdd...');
        result = await onAdd(newVal.trim());
      } else if (typeof addRef === 'function' && endpoint != null && refKey != null) {
        console.log('[handleAdd] вызываем addRef...', endpoint, refKey);
        result = await addRef(endpoint, refKey, newVal.trim());
      } else {
        console.log('[handleAdd] нет колбэка onAdd/addRef');
        return;
      }
      console.log('[handleAdd] результат:', result);
      const picked =
        result != null && typeof result === 'object' && result.name != null
          ? String(result.name)
          : newVal.trim();
      onChange(picked);
      setNewVal('');
      setShowAdd(false);
    } catch (err) {
      console.error('[handleAdd] ошибка:', err);
      message.error(err?.message || 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  if (readOnly) {
    return (
      <div style={{ color: '#fff', minHeight: 22, padding: '4px 0' }}>{value || '—'}</div>
    );
  }

  return (
    <Select
      showSearch
      allowClear
      variant="borderless"
      placeholder={placeholder}
      style={{ width: '100%', color: '#fff' }}
      options={selectOptions}
      value={value != null && String(value).trim() !== '' ? String(value) : undefined}
      onClear={() => onChange('')}
      onChange={(v) => onChange(v ?? '')}
      optionFilterProp="label"
      popupMatchSelectWidth={false}
      dropdownStyle={{ minWidth: 220 }}
      onOpenChange={(open) => {
        if (open) {
          setShowAdd(true);
          setNewVal('');
        }
      }}
      dropdownRender={(menu) => (
        <>
          {menu}
          {canAdd && showAdd ? (
            <div
              style={{
                padding: 8,
                borderTop: '1px solid #333',
                background: '#1a1a1a',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  placeholder="Новое значение"
                  onPressEnter={(ev) => {
                    ev.preventDefault();
                    void handleAdd(ev);
                  }}
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={(ev) => void handleAdd(ev)}
                  style={{
                    background: busy ? '#666' : '#1677ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '0 6px 6px 0',
                    padding: '4px 15px',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {busy ? '…' : 'Добавить'}
                </button>
              </Space.Compact>
            </div>
          ) : null}
        </>
      )}
    />
  );
}

export { SelectWithAdd };
export default SelectWithAdd;
