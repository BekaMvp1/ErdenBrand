/**
 * Модалка: выбор модели из Базы моделей для подстановки в заказ.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

export default function LoadModelsBaseModal({ open, onClose, onApplied }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(null);

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

  useEffect(() => {
    if (!open) return;
    void loadList();
  }, [open, loadList]);

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
      onApplied(full);
      onClose();
    } catch (e) {
      alert(e?.message || 'Не удалось загрузить модель');
    } finally {
      setLoadingDetail(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-models-base-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-white/20 bg-[#141414] shadow-xl">
        <div className="px-4 py-3 border-b border-white/15 flex items-center justify-between gap-2">
          <h2 id="load-models-base-title" className="text-lg font-semibold text-[#ECECEC]">
            Выбор модели
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#ECECEC]/70 hover:text-white px-2 py-1 rounded-lg text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="p-3 border-b border-white/10">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по коду или названию…"
            className="w-full px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/25 text-[#ECECEC] text-sm placeholder:text-[#ECECEC]/40"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {loading ? (
            <p className="text-sm text-[#ECECEC]/60 p-4 text-center">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[#ECECEC]/60 p-4 text-center">Нет моделей</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#1a1a1a] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#ECECEC] truncate">
                      <span className="text-white/90">{r.code || '—'}</span>
                      <span className="text-white/40 mx-2">|</span>
                      <span>{r.name || '—'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={loadingDetail === r.id}
                    onClick={() => void handleSelect(r)}
                    className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {loadingDetail === r.id ? '…' : 'Выбрать'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
