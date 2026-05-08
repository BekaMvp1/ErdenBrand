import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
console.log('FILE:', 'PurchaseReportForm.jsx');

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v) {
  return `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;
}
function materialNameOf(row) {
  return String(
    row?.name ??
    row?.material_name ??
    row?.materialName ??
    row?.title ??
    row?.fabric_name ??
    row?.['наименование'] ??
    ''
  ).trim();
}

export default function PurchaseReportForm() {
  console.log('COMPONENT MOUNTED:', 'PurchaseReportForm.jsx');
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [users, setUsers] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [header, setHeader] = useState({
    id: null,
    doc_number: '',
    doc_date: new Date().toISOString().slice(0, 10),
    order_id: '',
    user_id: '',
    workshop_id: '',
    period_start: '',
    period_end: '',
    comment: '',
    status: 'draft',
  });
  const [items, setItems] = useState([]);

  const isApproved = header.status === 'approved';

  const withTimeout = async (promiseFactory, timeoutMs = 8000) => {
    const timeoutPromise = new Promise((_, reject) => {
      const err = new Error('Request timeout');
      err.name = 'AbortError';
      setTimeout(() => reject(err), timeoutMs);
    });
    return Promise.race([promiseFactory(), timeoutPromise]);
  };

  const load = async () => {
    setError(null);
    try {
      const [uu, ww, wh] = await Promise.all([
        withTimeout(() => api.stageReports.users()).catch((e) => {
          if (e?.name !== 'AbortError') console.error(e);
          return [];
        }),
        withTimeout(() => api.workshops.list(true)).catch((e) => {
          if (e?.name !== 'AbortError') console.error(e);
          return [];
        }),
        withTimeout(() => api.warehouse.warehouses()).catch((e) => {
          if (e?.name !== 'AbortError') console.error(e);
          return [];
        }),
      ]);
      setUsers(Array.isArray(uu) ? uu : []);
      setWorkshops(Array.isArray(ww) ? ww : []);
      setWarehouses(Array.isArray(wh) ? wh : []);
      if (!isNew) {
        const doc = await withTimeout(() => api.stageReports.get(id)).catch((e) => {
          if (e?.name !== 'AbortError') console.error(e);
          return null;
        });
        if (!doc) return;
        setHeader({
          id: doc.id,
          doc_number: doc.doc_number || '',
          doc_date: (doc.created_at || '').slice(0, 10),
          order_id: String(doc.order_id || ''),
          user_id: String(doc.user_id || ''),
          workshop_id: String(doc.workshop_id || ''),
          period_start: doc.period_start || '',
          period_end: doc.period_end || '',
          comment: doc.comment || '',
          status: doc.status || 'draft',
        });
        setItems((doc.Items || []).map((it, i) => ({
          id: `e-${i}`,
          name: it.name || '',
          type: it.material_type || 'fabric',
          unit: it.unit || 'шт',
          warehouse_id: String(it.warehouse_id || ''),
          plan_qty: toNum(it.plan_qty),
          fact_qty: it.fact_qty != null ? String(it.fact_qty) : '',
          price: it.price != null ? String(it.price) : '',
          note: it.note || '',
        })));
      }
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки');
    }
  };

  useEffect(() => {
    api.orders.list()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.orders || data.rows || []);
        setOrders(list);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);
    load().finally(() => {
      clearTimeout(timer);
      setLoading(false);
    });
    return () => clearTimeout(timer);
  }, [id]);

  const fillByOrder = async (orderId) => {
    setSelectedOrderId(orderId || '');
    setHeader((p) => ({ ...p, order_id: orderId }));
    if (!orderId) {
      setItems([]);
      return;
    }
    try {
      const order = await api.orders.get(orderId);
      const source = [
        ...(Array.isArray(order?.fabric_data) ? order.fabric_data.map((r) => ({ ...r, type: 'fabric' })) : []),
        ...(Array.isArray(order?.fittings_data) ? order.fittings_data.map((r) => ({ ...r, type: 'accessories' })) : []),
      ];
      const prepared = source
        .filter((r) => materialNameOf(r))
        .map((r, idx) => {
          const name = materialNameOf(r);
          const unit = String(r.unit || 'м').trim();
          const plan = toNum(r.qty_total ?? r.itogo ?? 0);
          return {
            id: `a-${idx}`,
            name,
            type: r.type === 'accessories' ? 'accessories' : 'fabric',
            unit,
            warehouse_id: '',
            plan_qty: plan,
            fact_qty: '',
            price: String(toNum(r.price_per_unit ?? r.price)),
            note: '',
          };
        });
      setItems(prepared);
    } catch (e) {
      setError(e?.message || 'Ошибка автозаполнения');
    }
  };

  const totals = useMemo(() => {
    const plan = items.reduce((s, r) => s + toNum(r.plan_qty), 0);
    const fact = items.reduce((s, r) => s + toNum(r.fact_qty), 0);
    const sum = items.reduce((s, r) => s + toNum(r.fact_qty) * toNum(r.price), 0);
    return { positions: items.length, plan, fact, sum };
  }, [items]);

  const saveDoc = async (approve = false) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        stage: 'purchase',
        order_id: Number(header.order_id),
        user_id: header.user_id ? Number(header.user_id) : null,
        workshop_id: header.workshop_id ? Number(header.workshop_id) : null,
        period_start: header.period_start || null,
        period_end: header.period_end || null,
        comment: header.comment || null,
        items: items.map((it) => ({
          name: it.name,
          unit: it.unit || 'шт',
          material_type: it.type || 'fabric',
          warehouse_id: it.warehouse_id ? Number(it.warehouse_id) : null,
          plan_qty: toNum(it.plan_qty),
          fact_qty: toNum(it.fact_qty),
          price: toNum(it.price),
          note: it.note || null,
        })),
      };
      let reportId = header.id;
      if (reportId) await api.stageReports.update(reportId, payload);
      else {
        const created = await api.stageReports.create(payload);
        reportId = created.id;
      }
      if (approve) {
        await api.stageReports.approve(reportId);
        window.alert('✅ Закуп утверждён. Материалы добавлены на склад.');
      }
      navigate('/purchase/report');
    } catch (e) {
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xl font-bold">📦 Закуп материалов <span className="ml-2 rounded bg-[#1e3a1e] px-3 py-1 text-sm text-[#4ade80]">{header.doc_number || 'ЗКП-авто'}</span></div>
            <div className={`mt-1 inline-flex rounded px-2 py-1 text-xs ${isApproved ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-200'}`}>{isApproved ? 'Утверждён ✅' : 'Черновик 📝'}</div>
          </div>
          <div className="flex gap-2">
            {!isApproved ? <button className="rounded bg-blue-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(false)}>Сохранить</button> : null}
            {!isApproved ? <button className="rounded bg-green-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(true)}>✅ Утвердить</button> : null}
          </div>
        </div>
      </div>
      {error ? <div className="rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}
      {loading ? (
        <div className="rounded border border-white/10 p-4">
          <p>Загрузка данных...</p>
          <button
            className="mt-3 rounded bg-slate-600 px-3 py-2 text-sm"
            onClick={() => setLoading(false)}
          >
            Пропустить загрузку
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 rounded border border-white/10 p-3 md:grid-cols-2">
              <input type="date" className="rounded bg-black/30 px-3 py-2" value={header.doc_date} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, doc_date: e.target.value }))} />
              <select
                value={selectedOrderId || ''}
                disabled={isApproved}
                onChange={e => {
                  setSelectedOrderId(e.target.value);
                  fillByOrder(e.target.value);
                }}
                style={{width:'100%', padding:'10px',
                  background:'#1a1a1a', color:'white',
                  border:'1px solid #333', borderRadius:'8px'}}>
                <option value="">Выберите заказ</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.tz || o.id} · {o.model_name || o.name || '—'} ({o.total_qty || 0} шт)
                  </option>
                ))}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.user_id} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, user_id: e.target.value }))}>
                <option value="">Исполнитель</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.workshop_id} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, workshop_id: e.target.value }))}>
                <option value="">Цех</option>{workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <input type="date" className="rounded bg-black/30 px-3 py-2" value={header.period_start} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, period_start: e.target.value }))} />
              <input type="date" className="rounded bg-black/30 px-3 py-2" value={header.period_end} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, period_end: e.target.value }))} />
              <textarea className="rounded bg-black/30 px-3 py-2 md:col-span-2" placeholder="Комментарий" value={header.comment} disabled={isApproved} onChange={(e) => setHeader((p) => ({ ...p, comment: e.target.value }))} />
            </div>

            <div className="overflow-x-auto rounded border border-white/10">
              <table className="min-w-[1300px] w-full text-sm">
                <thead className="bg-white/5"><tr><th className="px-2 py-2">№</th><th>Наименование</th><th>Тип</th><th>Ед.изм</th><th>Склад</th><th>План</th><th>Факт</th><th>Цена</th><th>Сумма</th><th>Остаток</th></tr></thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} className="border-t border-white/10">
                      <td className="px-2 py-2 text-center">{idx + 1}</td>
                      <td className="px-2 py-2">
                        {it.material_name || it.materialName || it.name || '—'}
                      </td>
                      <td className="px-2 py-2">{it.type === 'accessories' ? 'Фурнитура' : 'Ткань'}</td>
                      <td className="px-2 py-2">{it.unit}</td>
                      <td className="px-2 py-2">
                        <select className="w-full rounded bg-black/30 px-2 py-1" disabled={isApproved} value={it.warehouse_id} onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, warehouse_id: e.target.value } : r))}>
                          <option value="">Склад</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">{toNum(it.plan_qty)}</td>
                      <td className="px-2 py-2"><input className="w-full rounded bg-black/30 px-2 py-1" type="number" disabled={isApproved} value={it.fact_qty} onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, fact_qty: e.target.value } : r))} /></td>
                      <td className="px-2 py-2"><input className="w-full rounded bg-black/30 px-2 py-1" type="number" disabled={isApproved} value={it.price} onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, price: e.target.value } : r))} /></td>
                      <td className="px-2 py-2">{money(toNum(it.fact_qty) * toNum(it.price))}</td>
                      <td className="px-2 py-2">{toNum(it.plan_qty) - toNum(it.fact_qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!isApproved ? <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={() => setItems((prev) => [...prev, { id: `m-${Date.now()}`, name: '', type: 'fabric', unit: 'шт', warehouse_id: '', plan_qty: 0, fact_qty: '', price: '', note: '' }])}>+ Добавить позицию</button> : null}

            <div className="flex justify-end gap-2">
              <button className="rounded bg-slate-600 px-3 py-2 text-sm" onClick={() => navigate('/purchase/report')}>← Назад</button>
              {!isApproved ? <button className="rounded bg-blue-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(false)}>💾 Черновик</button> : null}
              {!isApproved ? <button className="rounded bg-green-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(true)}>✅ Утвердить</button> : null}
            </div>
          </div>

          <div className="h-fit rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4 text-sm">
            <div className="flex justify-between"><span>Позиций:</span><b>{totals.positions}</b></div>
            <div className="mt-1 flex justify-between"><span>План:</span><b>{totals.plan} шт</b></div>
            <div className="mt-1 flex justify-between"><span>Факт:</span><b>{totals.fact} шт</b></div>
            <div className="mt-1 flex justify-between"><span>Сумма:</span><b>{money(totals.sum)}</b></div>
          </div>
        </div>
      )}
    </div>
  );
}
