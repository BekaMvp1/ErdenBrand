import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const emptyItem = { item_id: '', item_name: '', unit: '', qty: '', price: '' };

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;
}

export default function WarehouseMovementDocumentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [positionSource, setPositionSource] = useState([]);
  const [form, setForm] = useState({
    doc_number: '',
    doc_date: new Date().toISOString().slice(0, 10),
    move_type: 'goods',
    from_warehouse_id: '',
    to_warehouse_id: '',
    comment: '',
    status: 'draft',
  });
  const [items, setItems] = useState([{ ...emptyItem }]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ww] = await Promise.all([api.warehouse.warehouses()]);
      setWarehouses(Array.isArray(ww) ? ww : []);

      if (!isNew) {
        const doc = await api.warehouse.movementDocGet(id);
        setForm({
          doc_number: doc.doc_number || '',
          doc_date: doc.doc_date || new Date().toISOString().slice(0, 10),
          move_type: doc.move_type || 'goods',
          from_warehouse_id: String(doc.from_warehouse_id || ''),
          to_warehouse_id: String(doc.to_warehouse_id || ''),
          comment: doc.comment || '',
          status: doc.status || 'draft',
        });
        const nextItems = (doc.Items || []).map((it) => ({
          item_id: String(it.item_id ?? ''),
          item_name: it.item_name || '',
          unit: it.unit || '',
          qty: String(it.qty ?? ''),
          price: String(it.price ?? ''),
        }));
        setItems(nextItems.length ? nextItems : [{ ...emptyItem }]);
      }
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки документа');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (form.move_type === 'goods') {
          const rows = await api.warehouse.goods({
            warehouse_id: form.from_warehouse_id || undefined,
          });
          if (cancelled) return;
          setPositionSource(
            (Array.isArray(rows) ? rows : []).map((g) => ({
              id: g.id,
              name: `${g.name || '—'}${g.article ? ` (${g.article})` : ''}`,
              unit: g.unit || 'шт',
              price: g.price || 0,
            }))
          );
          return;
        }
        if (form.move_type === 'materials') {
          const rows = await api.warehouse.materials({
            warehouse_id: form.from_warehouse_id || undefined,
          });
          if (cancelled) return;
          setPositionSource(
            (Array.isArray(rows) ? rows : []).map((m) => ({
              id: m.id,
              name: `${m.name || '—'} (Тип: ${m.type === 'fabric' ? 'Ткань' : 'Фурнитура'})`,
              unit: m.unit || 'шт',
              price: m.price || 0,
            }))
          );
          return;
        }
        const rows = await api.orders.list({ limit: 500 });
        const arr = Array.isArray(rows) ? rows : (rows?.rows || []);
        if (cancelled) return;
        setPositionSource(
          arr
            .filter((o) => !/заверш|готов/i.test(String(o?.OrderStatus?.name || o?.status || '')))
            .map((o) => ({
              id: o.id,
              name: `${o.tz_code || o.article || o.id} · ${o.model_name || o.title || '—'}`,
              unit: 'шт',
              price: 0,
            }))
        );
      } catch {
        if (!cancelled) setPositionSource([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [form.move_type, form.from_warehouse_id]);

  const itemOptions = useMemo(() => {
    return positionSource;
  }, [positionSource]);

  const totals = useMemo(() => {
    const positions = items.filter((it) => it.item_name && toNum(it.qty) > 0).length;
    const qty = items.reduce((s, it) => s + toNum(it.qty), 0);
    const sum = items.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
    return { positions, qty, sum };
  }, [items]);

  const isPosted = form.status === 'posted';

  const saveDoc = async (postAfterSave = false) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        doc_date: form.doc_date,
        move_type: form.move_type,
        from_warehouse_id: Number(form.from_warehouse_id),
        to_warehouse_id: Number(form.to_warehouse_id),
        comment: form.comment || null,
        items: items.map((it) => ({
          item_id: it.item_id ? Number(it.item_id) : null,
          item_name: it.item_name,
          unit: it.unit || null,
          qty: toNum(it.qty),
          price: toNum(it.price),
        })),
      };

      let docId = id;
      if (isNew) {
        const created = await api.warehouse.movementDocCreate(payload);
        docId = created.id;
      } else {
        await api.warehouse.movementDocUpdate(id, payload);
      }
      if (postAfterSave) {
        await api.warehouse.movementDocPost(docId);
      }
      navigate('/warehouse/movements');
    } catch (e) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div
        className="mb-4 rounded-xl p-5"
        style={{ border: '1px solid #2a2a2a', background: '#0f0f0f' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">🔄 Документ перемещения</h1>
              <span
                className="inline-flex items-center rounded px-3 py-1 text-sm font-semibold"
                style={{ background: '#1e3a1e', color: '#4ade80' }}
              >
                {form.doc_number || 'ПМ-авто'}
              </span>
            </div>
            <div>
              <span className="mr-2 text-sm text-white/70">Статус:</span>
              <span
                className="inline-flex items-center rounded px-3 py-1 text-xs font-semibold"
                style={
                  isPosted
                    ? { background: '#14532d', color: '#4ade80' }
                    : { background: '#1e293b', color: '#94a3b8' }
                }
              >
                {isPosted ? 'Проведен' : 'Черновик'} {isPosted ? '✅' : '📝'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isPosted ? (
              <button
                className="rounded px-3 py-2 text-sm font-medium"
                style={{ background: '#1d4ed8' }}
                disabled={saving}
                onClick={() => saveDoc(false)}
              >
                Сохранить
              </button>
            ) : null}
            {!isPosted ? (
              <button
                className="rounded px-3 py-2 text-sm font-medium"
                style={{ background: '#16a34a' }}
                disabled={saving}
                onClick={() => saveDoc(true)}
              >
                Провести
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="mb-3 rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}
      {loading ? <div className="rounded border border-white/10 p-4">Загрузка...</div> : (
        <div className="space-y-3">
          <div
            className="rounded-xl p-5"
            style={{ border: '1px solid #2a2a2a', background: '#0f0f0f' }}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-white/70">Дата</label>
                <input
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ background: '#1a1a1a', borderColor: '#333' }}
                  type="date"
                  value={form.doc_date}
                  disabled={isPosted}
                  onChange={(e) => setForm((p) => ({ ...p, doc_date: e.target.value }))}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Тип перемещения</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ background: '#1a1a1a', borderColor: '#333' }}
                  value={form.move_type}
                  disabled={isPosted}
                  onChange={(e) => setForm((p) => ({ ...p, move_type: e.target.value }))}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                >
                  <option value="goods">Товар</option>
                  <option value="materials">Материал</option>
                  <option value="wip">НЗП</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Откуда</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ background: '#1a1a1a', borderColor: '#333' }}
                  value={form.from_warehouse_id}
                  disabled={isPosted}
                  onChange={(e) => setForm((p) => ({ ...p, from_warehouse_id: e.target.value }))}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                >
                  <option value="">Склад отправитель</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/70">Куда</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ background: '#1a1a1a', borderColor: '#333' }}
                  value={form.to_warehouse_id}
                  disabled={isPosted}
                  onChange={(e) => setForm((p) => ({ ...p, to_warehouse_id: e.target.value }))}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                >
                  <option value="">Склад получатель</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-white/70">Комментарий</label>
                <textarea
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ background: '#1a1a1a', borderColor: '#333' }}
                  placeholder="Комментарий"
                  disabled={isPosted}
                  value={form.comment}
                  onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                />
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl p-1"
            style={{ border: '1px solid #2a2a2a', background: '#0f0f0f' }}
          >
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-2 py-2">№</th>
                  <th>Наименование</th>
                  <th>Ед.изм</th>
                  <th>Кол-во</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                  <th>✕</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr key={idx} className="border-t border-white/10" style={{ background: idx % 2 === 0 ? '#111' : '#0d0d0d' }}>
                    <td className="px-2 py-2 text-center">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <select
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ background: '#1a1a1a', borderColor: '#333' }}
                        disabled={isPosted}
                        value={row.item_id}
                        onChange={(e) => {
                          const selected = itemOptions.find((it) => String(it.id) === e.target.value);
                          setItems((prev) => prev.map((it, i) => (i === idx ? {
                            ...it,
                            item_id: e.target.value,
                            item_name: selected?.name || '',
                            unit: selected?.unit || '',
                            price: String(selected?.price ?? 0),
                          } : it)));
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                      >
                        <option value="">Выберите позицию</option>
                        {itemOptions.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ background: '#1a1a1a', borderColor: '#333' }}
                        value={row.unit}
                        disabled={isPosted}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unit: e.target.value } : it)))}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ background: '#1a1a1a', borderColor: '#333' }}
                        type="number"
                        value={row.qty}
                        disabled={isPosted}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: e.target.value } : it)))}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ background: '#1a1a1a', borderColor: '#333' }}
                        type="number"
                        value={row.price}
                        disabled={isPosted}
                        onChange={(e) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: e.target.value } : it)))}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#4ade80'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                      />
                    </td>
                    <td className="px-2 py-2">{money(toNum(row.qty) * toNum(row.price))}</td>
                    <td className="px-2 py-2">
                      {!isPosted ? <button className="rounded bg-red-700 px-2 py-1 text-xs" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>🗑</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isPosted ? <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}>+ Добавить позицию</button> : null}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div />
            <div
              className="w-full max-w-xs rounded-xl p-4 text-sm text-white/90"
              style={{ border: '1px solid #2a2a2a', background: '#0f0f0f' }}
            >
              <div className="flex justify-between"><span className="text-white/70">Позиций:</span><b>{totals.positions}</b></div>
              <div className="mt-1 flex justify-between"><span className="text-white/70">Кол-во:</span><b>{totals.qty} шт</b></div>
              <div className="mt-1 flex justify-between"><span className="text-white/70">Сумма:</span><b>{money(totals.sum)}</b></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button className="rounded px-3 py-2 text-sm" style={{ background: '#475569' }} onClick={() => navigate('/warehouse/movements')}>Отмена</button>
            {!isPosted ? <button className="rounded px-3 py-2 text-sm" style={{ background: '#1d4ed8' }} disabled={saving} onClick={() => saveDoc(false)}>💾 Черновик</button> : null}
            {!isPosted ? <button className="rounded px-3 py-2 text-sm" style={{ background: '#16a34a' }} disabled={saving} onClick={() => saveDoc(true)}>✅ Провести</button> : null}
          </div>
        </div>
      )}
    </div>
  );
}
