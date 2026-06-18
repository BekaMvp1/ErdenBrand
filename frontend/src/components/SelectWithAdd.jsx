import { useCallback, useMemo, useRef, useState } from 'react';
import { Select, Input, message } from 'antd';

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function dedupeByName(items) {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const raw = item?.name;
    if (raw == null || String(raw).trim() === '') continue;
    const key = normalizeName(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Справочный Select с добавлением нового значения внизу дропдауна.
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const selectRef = useRef(null);

  const canAdd =
    !readOnly &&
    (typeof onAdd === 'function' ||
      (typeof addRef === 'function' && endpoint != null && refKey != null));

  const trimmedNew = newVal.trim();
  const addDisabled = !trimmedNew || isSubmitting;

  const mergedOptions = useMemo(() => {
    const list = dedupeByName(options);
    const names = new Set(list.map((o) => normalizeName(o.name)));
    const v = value != null ? String(value).trim() : '';
    if (v && !names.has(normalizeName(v))) {
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

  const handleOpenChange = useCallback((nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setNewVal('');
    }
  }, []);

  const handleAdd = useCallback(async () => {
    const trimmed = newVal.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let result;
      if (typeof onAdd === 'function') {
        result = await onAdd(trimmed);
      } else if (typeof addRef === 'function' && endpoint != null && refKey != null) {
        result = await addRef(endpoint, refKey, trimmed);
      } else {
        message.error('Добавление недоступно');
        return;
      }
      const picked =
        result != null && typeof result === 'object' && result.name != null
          ? String(result.name)
          : trimmed;
      onChange(picked);
      setNewVal('');
      setOpen(false);
      selectRef.current?.blur?.();
    } catch (err) {
      message.error(err?.message || 'Не удалось добавить');
    } finally {
      setIsSubmitting(false);
    }
  }, [addRef, endpoint, isSubmitting, newVal, onAdd, onChange, refKey]);

  /** Не закрывать дропдаун при клике по кнопке «Добавить». */
  const onAddButtonMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const renderDropdown = useCallback(
    (menu) => (
      <>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>{menu}</div>
        {canAdd ? (
          <div
            style={{
              padding: 8,
              borderTop: '1px solid #333',
              background: '#1a1a1a',
            }}
            onMouseDown={(e) => {
              const tag = e.target?.tagName;
              if (tag === 'INPUT' || tag === 'TEXTAREA') return;
              e.preventDefault();
            }}
          >
            <div style={{ display: 'flex', width: '100%' }}>
              <Input
                size="small"
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="Новое значение"
                disabled={isSubmitting}
                onKeyDown={(e) => e.stopPropagation()}
                onPressEnter={() => void handleAdd()}
                style={{ flex: 1, borderRadius: '6px 0 0 6px' }}
              />
              <button
                type="button"
                disabled={addDisabled}
                onMouseDown={onAddButtonMouseDown}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAdd();
                }}
                style={{
                  background: addDisabled ? '#666' : '#1677ff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0 6px 6px 0',
                  padding: '4px 12px',
                  cursor: addDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  opacity: addDisabled ? 0.65 : 1,
                }}
              >
                {isSubmitting ? '…' : 'Добавить'}
              </button>
            </div>
          </div>
        ) : null}
      </>
    ),
    [addDisabled, canAdd, handleAdd, isSubmitting, newVal],
  );

  if (readOnly) {
    return (
      <div style={{ color: '#fff', minHeight: 22, padding: '4px 0' }}>{value || '—'}</div>
    );
  }

  return (
    <Select
      ref={selectRef}
      open={open}
      showSearch={false}
      allowClear
      virtual={false}
      variant="borderless"
      placeholder={placeholder}
      style={{ width: '100%', color: '#fff' }}
      options={selectOptions}
      value={value != null && String(value).trim() !== '' ? String(value) : undefined}
      onClear={() => onChange('')}
      onChange={(v) => onChange(v ?? '')}
      popupMatchSelectWidth={false}
      listHeight={200}
      placement="bottomLeft"
      dropdownStyle={{ minWidth: 240 }}
      getPopupContainer={(trigger) => trigger.parentElement || document.body}
      onOpenChange={handleOpenChange}
      dropdownRender={renderDropdown}
    />
  );
}

export { SelectWithAdd };
export default SelectWithAdd;
