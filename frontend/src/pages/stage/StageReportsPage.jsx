import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';

const STAGE_LABEL = {
  purchase: 'Закуп',
  cutting: 'Раскрой',
  sewing: 'Пошив',
  otk: 'ОТК',
  shipment: 'Отгрузка',
};

const emptyHeader = {
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
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(plan, fact) {
  const p = toNum(plan);
  if (p <= 0) return 0;
  return Math.round((toNum(fact) / p) * 100);
}

function extractMaterialRows(order) {
  const src = [...(Array.isArray(order?.fabric_data) ? order.fabric_data : []), ...(Array.isArray(order?.fittings_data) ? order.fittings_data : [])];
  return src.map((r, i) => ({
    id: `m-${i}`,
    name: String(r?.name || r?.title || r?.material_name || `Материал ${i + 1}`),
    unit: String(r?.unit || r?.measure || 'шт'),
    plan_qty: toNum(r?.total_qty ?? r?.qty ?? r?.quantity),
    fact_qty: '',
    note: '',
  }));
}

function extractOperationRows(order, stage) {
  const ops = Array.isArray(order?.OrderOperations) ? order.OrderOperations : [];
  const filtered = ops.filter((op) => {
    const n = String(op?.Operation?.name || op?.name || '').toLowerCase();
    if (!n) return true;
    if (stage === 'cutting') return /раскрой|cut/.test(n);
    if (stage === 'sewing') return /пошив|sew/.test(n);
    if (stage === 'otk') return /отк|qc|контрол/.test(n);
    return true;
  });
  const src = filtered.length ? filtered : ops;
  return src.map((op, i) => ({
    id: `o-${i}`,
    name: String(op?.Operation?.name || op?.name || `Операция ${i + 1}`),
    unit: 'шт',
    plan_qty: toNum(op?.planned_quantity ?? order?.total_quantity ?? order?.quantity ?? 0),
    fact_qty: '',
    note: '',
  }));
}

function extractShipmentRows(order) {
  const vars = Array.isArray(order?.variants) ? order.variants : [];
  return vars.map((v, i) => ({
    id: `s-${i}`,
    name: `${v?.color || 'Без цвета'} × ${v?.size || 'Без размера'}`,
    unit: 'шт',
    plan_qty: toNum(v?.quantity),
    fact_qty: '',
    note: '',
  }));
}

export default function StageReportsPage({ stage }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fOrderId, setFOrderId] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState(emptyHeader);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { stage };
      if (fDateFrom) {
        const d = new Date(fDateFrom);
        if (!Number.isNaN(d.getTime())) {
          params.date_from = d.toISOString();
        }
      }
      if (fDateTo) {
        const d = new Date(fDateTo);
        if (!Number.isNaN(d.getTime())) {
          params.date_to = d.toISOString();
        }
      }
      if (fStatus && fStatus !== 'all' && fStatus !== 'undefined') {
        params.status = fStatus;
      }
      const parsedOrderId = Number(fOrderId);
      if (fOrderId && !Number.isNaN(parsedOrderId)) {
        params.order_id = String(parsedOrderId);
      }
      const [list, oo, uu, ww] = await Promise.all([
        api.stageReports.list(params),
        api.orders.list({ limit: 500 }),
        api.stageReports.users(),
        api.workshops.list(true),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setOrders(Array.isArray(oo) ? oo : (oo?.rows || []));
      setUsers(Array.isArray(uu) ? uu : []);
      setWorkshops(Array.isArray(ww) ? ww : []);
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки отчетов');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [stage, fDateFrom, fDateTo, fOrderId, fStatus]);

  const resetForm = () => {
    setHeader({ ...emptyHeader });
    setItems([]);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (id) => {
    try {
      const doc = await api.stageReports.get(id);
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
        unit: it.unit || 'шт',
        plan_qty: toNum(it.plan_qty),
        fact_qty: toNum(it.fact_qty),
        note: it.note || '',
      })));
      setOpen(true);
    } catch (e) {
      setError(e?.message || 'Ошибка открытия отчета');
    }
  };

  const onOrderChange = async (value) => {
    setHeader((p) => ({ ...p, order_id: value }));
    if (!value) {
      setItems([]);
      return;
    }
    try {
      const order = await api.orders.get(value);
      let prepared = [];
      if (stage === 'purchase') prepared = extractMaterialRows(order);
      else if (stage === 'shipment') prepared = extractShipmentRows(order);
      else prepared = extractOperationRows(order, stage);
      setItems(prepared);
    } catch (e) {
      setError(e?.message || 'Ошибка автозаполнения заказа');
      setItems([]);
    }
  };

  const totals = useMemo(() => {
    const plan = items.reduce((s, r) => s + toNum(r.plan_qty), 0);
    const fact = items.reduce((s, r) => s + toNum(r.fact_qty), 0);
    return { plan, fact, percent: pct(plan, fact) };
  }, [items]);

  const saveDoc = async (approve = false) => {
    try {
      const payload = {
        stage,
        order_id: Number(header.order_id),
        user_id: header.user_id ? Number(header.user_id) : null,
        workshop_id: header.workshop_id ? Number(header.workshop_id) : null,
        period_start: header.period_start || null,
        period_end: header.period_end || null,
        status: 'draft',
        comment: header.comment || null,
        items: items.map((it) => ({
          name: it.name,
          unit: it.unit || 'шт',
          plan_qty: toNum(it.plan_qty),
          fact_qty: toNum(it.fact_qty),
          note: it.note || null,
        })),
      };
      let id = header.id;
      if (id) await api.stageReports.update(id, payload);
      else {
        const created = await api.stageReports.create(payload);
        id = created.id;
      }
      if (approve) await api.stageReports.approve(id);
      setOpen(false);
      setNotice(approve ? 'Отчет утвержден' : 'Черновик сохранен');
      await load();
    } catch (e) {
      setError(e?.message || 'Ошибка сохранения отчета');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neon-text">{`Отчет ${STAGE_LABEL[stage] || stage}`}</h2>
        <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={openNew}>+ Создать отчет</button>
      </div>

      {error ? <div className="rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="rounded bg-green-500/20 p-2 text-sm text-green-300">{notice}</div> : null}

      <div className="flex flex-wrap gap-2">
        <input type="date" className="rounded bg-black/30 px-3 py-2" value={fDateFrom} onChange={(e) => setFDateFrom(e.target.value)} />
        <input type="date" className="rounded bg-black/30 px-3 py-2" value={fDateTo} onChange={(e) => setFDateTo(e.target.value)} />
        <select className="rounded bg-black/30 px-3 py-2" value={fOrderId} onChange={(e) => setFOrderId(e.target.value)}>
          <option value="">Все заказы</option>
          {orders.map((o) => <option key={o.id} value={o.id}>{`${o.tz_code || o.id} · ${o.model_name || o.title || '—'}`}</option>)}
        </select>
        <select className="rounded bg-black/30 px-3 py-2" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Все статусы</option>
          <option value="draft">Черновик</option>
          <option value="approved">Утвержден</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-white/10">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="px-2 py-2">№</th><th>Дата</th><th>Заказ</th><th>Исполнитель</th><th>План</th><th>Факт</th><th>% выполнения</th><th>Статус</th><th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-3 text-center">Загрузка...</td></tr> : null}
            {!loading && rows.map((r, i) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="px-2 py-2 text-center">{r.doc_number || i + 1}</td>
                <td className="px-2 py-2">{(r.created_at || '').slice(0, 10)}</td>
                <td className="px-2 py-2">{`${r.Order?.tz_code || r.order_id} · ${r.Order?.model_name || '—'}`}</td>
                <td className="px-2 py-2">{r.User?.name || '—'}</td>
                <td className="px-2 py-2">{toNum(r.plan_total)}</td>
                <td className="px-2 py-2">{toNum(r.fact_total)}</td>
                <td className="px-2 py-2">{toNum(r.progress_percent)}%</td>
                <td className="px-2 py-2">{r.status === 'approved' ? 'Утвержден' : 'Черновик'}</td>
                <td className="px-2 py-2">
                  <div className="flex gap-2">
                    <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => openEdit(r.id)}>{r.status === 'approved' ? 'Открыть' : 'Редактировать'}</button>
                    {r.status !== 'approved' ? <button className="rounded bg-green-700 px-2 py-1 text-xs" onClick={async () => { await api.stageReports.approve(r.id); await load(); }}>Утвердить</button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-6xl rounded-xl border border-white/20 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Документ отчета</h3>
              <div className="text-sm text-white/70">{header.doc_number || 'ОТЧ-авто'}</div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input type="date" className="rounded bg-black/30 px-3 py-2" value={header.doc_date} onChange={(e) => setHeader((p) => ({ ...p, doc_date: e.target.value }))} />
              <input className="rounded bg-black/30 px-3 py-2" value={STAGE_LABEL[stage]} readOnly />
              <select className="rounded bg-black/30 px-3 py-2" value={header.order_id} onChange={(e) => onOrderChange(e.target.value)}>
                <option value="">Выберите заказ</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{`${o.tz_code || o.id} · ${o.model_name || o.title || '—'} (${o.total_quantity || o.quantity || 0} шт)`}</option>)}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.user_id} onChange={(e) => setHeader((p) => ({ ...p, user_id: e.target.value }))}>
                <option value="">Исполнитель</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.workshop_id} onChange={(e) => setHeader((p) => ({ ...p, workshop_id: e.target.value }))}>
                <option value="">Цех</option>
                {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="flex gap-2">
                <input type="date" className="w-full rounded bg-black/30 px-3 py-2" value={header.period_start} onChange={(e) => setHeader((p) => ({ ...p, period_start: e.target.value }))} />
                <input type="date" className="w-full rounded bg-black/30 px-3 py-2" value={header.period_end} onChange={(e) => setHeader((p) => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded border border-white/10">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-white/5"><tr><th className="px-2 py-2">№</th><th>Операция/Наименование</th><th>Ед.изм</th><th>План</th><th>Факт</th><th>%</th><th>Примечание</th></tr></thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} className="border-t border-white/10">
                      <td className="px-2 py-2 text-center">{idx + 1}</td>
                      <td className="px-2 py-2">{it.name}</td>
                      <td className="px-2 py-2">{it.unit}</td>
                      <td className="px-2 py-2">{toNum(it.plan_qty)}</td>
                      <td className="px-2 py-2"><input className="w-full rounded bg-black/30 px-2 py-1" type="number" value={it.fact_qty} onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, fact_qty: e.target.value } : r))} /></td>
                      <td className="px-2 py-2">{pct(it.plan_qty, it.fact_qty)}%</td>
                      <td className="px-2 py-2"><input className="w-full rounded bg-black/30 px-2 py-1" value={it.note || ''} onChange={(e) => setItems((prev) => prev.map((r, i) => i === idx ? { ...r, note: e.target.value } : r))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-sm text-white/80">
              Итого план: <b>{totals.plan}</b> шт | Итого факт: <b>{totals.fact}</b> шт | % выполнения: <b>{totals.percent}%</b>
            </div>

            <textarea className="mt-3 w-full rounded bg-black/30 px-3 py-2" placeholder="Комментарий" value={header.comment} onChange={(e) => setHeader((p) => ({ ...p, comment: e.target.value }))} />

            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded bg-slate-600 px-3 py-2 text-sm" onClick={() => setOpen(false)}>Отмена</button>
              <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={() => saveDoc(false)}>💾 Черновик</button>
              <button className="rounded bg-green-600 px-3 py-2 text-sm" onClick={() => saveDoc(true)}>✅ Утвердить</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
