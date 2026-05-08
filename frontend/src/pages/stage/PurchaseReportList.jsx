import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;
}

export default function PurchaseReportList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [orders, setOrders] = useState([]);
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fOrderId, setFOrderId] = useState('');
  const [fStatus, setFStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { stage: 'purchase' };
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
      const [list, oo] = await Promise.all([
        api.stageReports.list(params),
        api.orders.list({ limit: 500 }),
      ]);
      setRows(Array.isArray(list) ? list : []);
      setOrders(Array.isArray(oo) ? oo : (oo?.rows || []));
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [fDateFrom, fDateTo, fOrderId, fStatus]);

  const metrics = useMemo(() => {
    const docs = rows.length;
    const approved = rows.filter((r) => r.status === 'approved').length;
    const totalSum = rows.reduce((s, r) => s + (Array.isArray(r.Items) ? r.Items.reduce((ss, it) => ss + toNum(it.fact_qty) * toNum(it.price), 0) : 0), 0);
    return { docs, approved, totalSum };
  }, [rows]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Отчёт Закуп</h2>
      {error ? <div className="rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4"><div className="text-white/70">📋 Документов</div><div className="text-2xl font-bold">{metrics.docs}</div></div>
        <div className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4"><div className="text-white/70">✅ Утверждено</div><div className="text-2xl font-bold">{metrics.approved}</div></div>
        <div className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4"><div className="text-white/70">💰 Итого сумм</div><div className="text-2xl font-bold text-emerald-400">{money(metrics.totalSum)}</div></div>
      </div>

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
          <option value="approved">Утверждён</option>
        </select>
        <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={() => navigate('/purchase/report/new')}>+ Создать закуп</button>
      </div>

      <div className="space-y-3">
        {loading ? <div className="rounded border border-white/10 p-4 text-center">Загрузка...</div> : null}
        {!loading && rows.map((r) => {
          const sum = (r.Items || []).reduce((s, it) => s + toNum(it.fact_qty) * toNum(it.price), 0);
          return (
            <div key={r.id} className="rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{r.doc_number || `ЗКП-${r.id}`} {(r.created_at || '').slice(0, 10)} <span className={`ml-2 rounded px-2 py-1 text-xs ${r.status === 'approved' ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-200'}`}>{r.status === 'approved' ? 'Утверждён ✅' : 'Черновик 📝'}</span></div>
              </div>
              <div className="mt-1 text-sm text-white/80">Заказ: {`${r.Order?.tz_code || r.order_id} · ${r.Order?.model_name || '—'}`}</div>
              <div className="mt-1 text-sm text-white/80">Позиций: {(r.Items || []).length} | Сумма: {money(sum)}</div>
              <div className="mt-1 text-sm text-white/80">Исполнитель: {r.User?.name || '—'}</div>
              <div className="mt-2 flex justify-end gap-2">
                <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => navigate(`/purchase/report/${r.id}`)}>👁 Просмотр</button>
                {r.status !== 'approved' ? <button className="rounded bg-sky-700 px-2 py-1 text-xs" onClick={() => navigate(`/purchase/report/${r.id}`)}>✏️ Изменить</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
