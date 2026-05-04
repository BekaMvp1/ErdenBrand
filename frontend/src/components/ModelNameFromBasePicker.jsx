/**
 * Кнопка «Загрузить из базы моделей» и выпадающий список (без поля ввода).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

export default function ModelNameFromBasePicker({ onModelLoaded }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(null);
  const containerRef = useRef(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.modelsBase.list({});
      setList(Array.isArray(rows) ? rows : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const openModelPicker = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => {
      const next = !o;
      if (next && list.length === 0 && !loading) void loadList();
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const code = String(r.code || '').toLowerCase();
      const name = String(r.name || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [list, search]);

  const handleSelect = async (item) => {
    if (!item?.id) return;
    setLoadingDetail(item.id);
    try {
      const full = await api.modelsBase.get(item.id);
      onModelLoaded(full);
      setOpen(false);
      setSearch('');
    } catch (err) {
      alert(err?.message || 'Не удалось загрузить модель');
    } finally {
      setLoadingDetail(null);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={openModelPicker}
        className="text-white cursor-pointer"
        style={{ background: '#1e40af', padding: '8px 16px', borderRadius: 8, border: 'none' }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        📋 Загрузить из базы моделей
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-[1000] mt-1 flex max-h-[300px] flex-col overflow-hidden rounded-lg border border-[#333] bg-[#1a1a2e] shadow-lg"
          role="listbox"
          aria-label="Модели из базы"
        >
          <div className="shrink-0 border-b border-[#333] p-2">
            <div className="flex items-center gap-2 rounded-md border border-[#444] bg-[#141428] px-2 py-1.5">
              <span className="text-sm opacity-70" aria-hidden>
                🔍
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по коду/названию"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#ECECEC] outline-none placeholder:text-[#ECECEC]/45"
                autoFocus
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-3 text-center text-sm text-[#ECECEC]/60">Загрузка…</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-center text-sm text-[#ECECEC]/60">Нет моделей</p>
            ) : (
              <ul className="divide-y divide-[#333]">
                {filtered.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 px-2 py-2 text-sm text-[#ECECEC] hover:bg-white/5"
                  >
                    <span className="w-20 shrink-0 font-mono text-white/90">{r.code || '—'}</span>
                    <span className="min-w-0 flex-1 truncate">{r.name || '—'}</span>
                    <button
                      type="button"
                      disabled={loadingDetail === r.id}
                      onClick={() => void handleSelect(r)}
                      className="shrink-0 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {loadingDetail === r.id ? '…' : 'Выбрать'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
