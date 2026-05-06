import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Link } from 'react-router-dom';

const GROUPS = [
  { id: 'floor_4', label: 'Наш цех — 4 этаж' },
  { id: 'floor_3', label: 'Наш цех — 3 этаж' },
  { id: 'floor_2', label: 'Наш цех — 2 этаж' },
  { id: 'aksy', label: 'Аксы' },
  { id: 'outsource', label: 'Аутсорс цех' },
];
const SUBS = [
  { id: 'general', label: 'ЗАКАЗЧИКИ' },
  { id: 'vb', label: 'ВБ' },
];
const METRICS = ['prep_plan', 'prep_fact', 'main_plan', 'main_fact'];

function monthNameRu(m) {
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return names[m - 1] || '';
}
function getMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mondayOf(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function buildMonthWeeks(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  let mon = mondayOf(first);
  const out = [];
  for (let i = 1; i <= 5 && mon.toISOString().slice(0, 10) <= last; i += 1) {
    const s = new Date(mon);
    const e = new Date(mon);
    e.setDate(e.getDate() + 6);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ week_number: i, title: `${monthNameRu(m)} ${i}`, range: `${fmt(s)}–${fmt(e)}` });
    mon.setDate(mon.getDate() + 7);
  }
  return out;
}
function firstPhoto(o) {
  const p = Array.isArray(o?.photos) ? o.photos[0] : null;
  return typeof p === 'string' && p.trim() ? p.trim() : null;
}
function qty(o) {
  const n = Number(o?.total_quantity ?? o?.total_qty ?? o?.quantity ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function titleLine(o) {
  const tz = String(o?.tz_code || o?.tz || o?.order_number || o?.article || '').trim();
  const name = String(o?.model_name || o?.name || o?.title || '').trim();
  return `${tz || '—'} · ${name || '—'}`;
}
function detectGroup(o, ids) {
  const name = String(o?.Workshop?.name || o?.workshop_name || '').toLowerCase();
  const wid = String(o?.workshop_id ?? o?.Workshop?.id ?? '');
  const floor = Number(o?.building_floor_id ?? o?.floor_id ?? 0);
  if (floor === 4 || (name.includes('этаж') && name.includes('4'))) return 'floor_4';
  if (floor === 3 || (name.includes('этаж') && name.includes('3'))) return 'floor_3';
  if (floor === 2 || (name.includes('этаж') && name.includes('2'))) return 'floor_2';
  if (name.includes('аксы') || (ids.aksyId && wid === String(ids.aksyId))) return 'aksy';
  if (name.includes('аутсорс') || (ids.outsourceId && wid === String(ids.outsourceId))) return 'outsource';
  return 'outsource';
}
function detectSub(o) {
  const clientName = String(o?.Client?.name || '').toLowerCase();
  return clientName.includes('вб') || clientName.includes('wb') ? 'vb' : 'general';
}

export default function PlanningMonth() {
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [facts, setFacts] = useState({});
  const [clientFilter, setClientFilter] = useState(null);
  const [draftRowsBySub, setDraftRowsBySub] = useState({});
  const [capacityByGroup, setCapacityByGroup] = useState({});
  const capacitySaveTimersRef = useRef({});

  const weeks = useMemo(() => buildMonthWeeks(monthKey), [monthKey]);
  const workshopIds = useMemo(() => {
    const list = workshops || [];
    const main = list.find((w) => Number(w.floors_count) === 4) || list[0];
    const aksy = list.find((w) => /аксы/i.test(String(w.name || '')));
    const outsource = list.find((w) => /аутсорс/i.test(String(w.name || '')));
    return { mainWsId: main?.id ?? null, aksyId: aksy?.id ?? null, outsourceId: outsource?.id ?? null };
  }, [workshops]);

  useEffect(() => {
    const token = localStorage.getItem('token')
      || localStorage.getItem('authToken')
      || sessionStorage.getItem('token')
      || '';

    console.log('>>> FETCHING ORDERS, token:', !!token);

    fetch('/api/orders', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(async (r) => {
        console.log('>>> ORDERS STATUS:', r.status);
        const text = await r.text();
        try {
          const data = JSON.parse(text);
          const list = Array.isArray(data) ? data : (data.orders || data.rows || data.data || []);
          console.log('>>> ORDERS COUNT:', list.length);
          setAllOrders(list);
        } catch (e) {
          console.error('>>> PARSE ERROR:', text.slice(0, 200));
        }
      })
      .catch((e) => console.error('>>> FETCH ERROR:', e));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, c, w] = await Promise.all([
          api.orders.list(),
          api.references.clients(),
          api.workshops.list(true),
        ]);
        if (cancelled) return;
        const list = Array.isArray(o)
          ? o
          : (o?.orders || o?.rows || o?.data || o?.items || o?.results || []);
        setOrders(Array.isArray(list) ? list : []);
        setClients(Array.isArray(c) ? c : (c?.clients || []));
        setWorkshops(Array.isArray(w) ? w : []);
        console.log('Orders loaded:', Array.isArray(list) ? list.length : 0);
      } catch (e) {
        if (!cancelled) {
          setOrders([]);
          setClients([]);
          setWorkshops([]);
        }
        console.error('Orders load error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.planningMonth.get(monthKey).then((res) => {
      if (cancelled) return;
      const map = {};
      (res?.facts || []).forEach((f) => { map[`${f.order_id}:${f.week_number}:${f.metric}`] = Number(f.value) || 0; });
      setFacts(map);
    }).catch(() => { if (!cancelled) setFacts({}); });
    return () => { cancelled = true; };
  }, [monthKey]);

  const clientPills = useMemo(() => {
    const m = new Map();
    orders.forEach((o) => {
      const id = Number(o?.client_id);
      const n = o?.Client?.name || clients.find((c) => Number(c.id) === id)?.name;
      if (Number.isFinite(id) && n) m.set(id, n);
    });
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [orders, clients]);

  const filteredOrders = useMemo(() => {
    let arr = orders;
    if (clientFilter != null) arr = arr.filter((o) => Number(o?.client_id) === Number(clientFilter));
    return arr;
  }, [orders, clientFilter]);

  const selectedDraftOrderIds = useMemo(() => {
    const selected = new Set();
    Object.values(draftRowsBySub).forEach((rows) => {
      (rows || []).forEach((r) => {
        const id = Number(r?.order_id);
        if (id) selected.add(id);
      });
    });
    return selected;
  }, [draftRowsBySub]);

  const grouped = useMemo(() => {
    const by = {};
    GROUPS.forEach((g) => { by[g.id] = { general: [], vb: [] }; });
    filteredOrders.forEach((o) => {
      const g = detectGroup(o, workshopIds);
      const s = detectSub(o);
      by[g][s].push(o);
    });
    return by;
  }, [filteredOrders, workshopIds]);

  const ensureDraftRows = (groupId, subId) => {
    const key = `${groupId}:${subId}`;
    const existing = draftRowsBySub[key] || [];
    if (existing.length > 0) return existing;
    return [{ id: `${key}:empty-1`, order_id: null, client_id: null }];
  };

  const setDraftOrder = (key, rowId, orderId) => {
    setDraftRowsBySub((prev) => {
      const rows = [...(prev[key] || [])];
      const idx = rows.findIndex((r) => r.id === rowId);
      const ord = allOrders.find((o) => String(o.id) === String(orderId));
      const patch = { id: rowId, order_id: orderId ? Number(orderId) : null, client_id: ord ? Number(ord.client_id) : null };
      if (idx >= 0) rows[idx] = patch;
      else rows.push(patch);
      return { ...prev, [key]: rows };
    });
  };
  const setDraftClient = (key, rowId, clientId) => {
    setDraftRowsBySub((prev) => {
      const rows = [...(prev[key] || [])];
      const idx = rows.findIndex((r) => r.id === rowId);
      if (idx >= 0) rows[idx] = { ...rows[idx], client_id: clientId ? Number(clientId) : null };
      return { ...prev, [key]: rows };
    });
  };
  const addDraftRow = (key) => setDraftRowsBySub((prev) => ({ ...prev, [key]: [...(prev[key] || []), { id: `${key}:${Date.now()}`, order_id: null, client_id: null }] }));

  const saveMetric = async (order_id, week_number, metric, value) => {
    if (!order_id) return;
    const k = `${order_id}:${week_number}:${metric}`;
    setFacts((p) => ({ ...p, [k]: Number(value) || 0 }));
    await api.planningMonth.save({ month: monthKey, order_id, week_number, metric, value: Number(value) || 0 });
  };

  const workshopByGroup = useMemo(() => {
    const map = {};
    GROUPS.forEach((g) => {
      map[g.id] = workshops.find((w) => {
        const n = String(w.name || '').toLowerCase();
        if (g.id === 'floor_4' || g.id === 'floor_3' || g.id === 'floor_2') return Number(w.floors_count) === 4;
        if (g.id === 'aksy') return n.includes('аксы');
        return n.includes('аутсорс');
      }) || null;
    });
    return map;
  }, [workshops]);

  const readCapacity = (groupId) => {
    const ws = workshopByGroup[groupId];
    const fromWs = Number(ws?.capacity);
    if (Number.isFinite(fromWs)) return fromWs;
    if (!ws?.id) return 0;
    const fromStorage = Number(window.localStorage.getItem(`pm:capacity:${ws.id}`));
    return Number.isFinite(fromStorage) ? fromStorage : 0;
  };

  useEffect(() => {
    setCapacityByGroup((prev) => {
      const next = { ...prev };
      GROUPS.forEach((g) => {
        if (next[g.id] == null) next[g.id] = String(readCapacity(g.id));
      });
      return next;
    });
  }, [workshopByGroup]);

  const saveCapacity = async (groupId, rawValue) => {
    const ws = workshopByGroup[groupId];
    const next = Math.max(0, Math.round(Number(rawValue) || 0));
    if (ws?.id) {
      try {
        await api.workshops.updateCapacity(ws.id, next);
        setWorkshops((prev) => prev.map((w) => (Number(w.id) === Number(ws.id) ? { ...w, capacity: next } : w)));
      } catch {
        window.localStorage.setItem(`pm:capacity:${ws.id}`, String(next));
      }
    }
  };

  const scheduleCapacitySave = (groupId, rawValue) => {
    if (capacitySaveTimersRef.current[groupId]) {
      clearTimeout(capacitySaveTimersRef.current[groupId]);
    }
    capacitySaveTimersRef.current[groupId] = setTimeout(() => {
      saveCapacity(groupId, rawValue).catch(() => {});
      capacitySaveTimersRef.current[groupId] = null;
    }, 500);
  };

  useEffect(() => () => {
    Object.values(capacitySaveTimersRef.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  const renderRow = (rowKey, idx, order, client_id, isDraft, onOrderChange, onClientChange) => {
    const ph = firstPhoto(order);
    const ordered = qty(order);
    const cutQty = Number(order?.cutting_fact ?? 0) || 0;
    const sewQty = Number(order?.sewing_fact ?? order?.sewing_qty ?? 0) || 0;
    const restQty = Math.max(ordered - sewQty, 0);
    const planTotal = weeks.reduce((sum, w) => sum + (Number(facts[`${order?.id || 0}:${w.week_number}:prep_plan`] || 0) + Number(facts[`${order?.id || 0}:${w.week_number}:main_plan`] || 0)), 0);
    const factTotal = weeks.reduce((sum, w) => sum + (Number(facts[`${order?.id || 0}:${w.week_number}:prep_fact`] || 0) + Number(facts[`${order?.id || 0}:${w.week_number}:main_fact`] || 0)), 0);
    return (
      <tr key={rowKey} style={{ background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
        <td className="border px-2 py-2 sticky left-0 z-[6]" style={{ background: 'var(--bg)' }}>{idx + 1}</td>
        <td className="border px-1 py-2 text-center sticky z-[6]" style={{ left: 45, background: 'var(--bg)' }}>
          {ph ? <img src={ph} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, margin: '0 auto' }} /> : <div className="text-neon-muted">📷</div>}
        </td>
        <td className="border px-2 py-2 sticky z-[6]" style={{ left: 100, background: 'var(--bg)' }}>
          <select className="w-full bg-transparent text-xs" value={order?.id || ''} onChange={(e) => onOrderChange(e.target.value)} disabled={!isDraft}>
            <option value="">— выберите заказ —</option>
            {allOrders
              .filter((o) => !selectedDraftOrderIds.has(Number(o.id)) || Number(o.id) === Number(order?.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {`${String(o?.tz || o?.order_number || o?.id)} · ${String(o?.model_name || o?.name || '—')} (${Number(o?.total_qty || 0) || 0} шт)`}
                </option>
              ))}
          </select>
        </td>
        <td className="border px-2 py-2 sticky z-[6]" style={{ left: 360, background: 'var(--bg)' }}>
          <select className="w-full bg-transparent text-xs" value={client_id || ''} onChange={(e) => onClientChange(e.target.value)}>
            <option value="">—</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </td>
        <td className="border px-2 py-2 sticky z-[6]" style={{ left: 490, background: cutQty <= 0 && order ? 'rgba(245,158,11,0.2)' : 'var(--bg)' }}>
          {order ? (
            <div className="text-[11px] leading-4">
              <div>Зак: {ordered}</div>
              <div>Рас: {cutQty > 0 ? cutQty : '—'}</div>
              <div>Пош: {sewQty > 0 ? sewQty : '—'}</div>
              <div>Ост: {restQty}</div>
            </div>
          ) : <span className="text-neon-muted">—</span>}
        </td>
        {weeks.flatMap((w) => METRICS.map((metric) => {
          const fk = `${order?.id || 0}:${w.week_number}:${metric}`;
          return (
            <td key={`${rowKey}-${w.week_number}-${metric}`} className="border p-0.5">
              <input
                type="number"
                className="w-full bg-transparent px-1 py-1 text-xs outline-none"
                value={facts[fk] ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value);
                  setFacts((p) => ({ ...p, [fk]: v }));
                }}
                onBlur={(e) => { if (order?.id) saveMetric(order.id, w.week_number, metric, e.target.value || 0).catch(() => {}); }}
              />
            </td>
          );
        }))}
        <td className="border px-1 py-1 text-right">{planTotal}</td>
        <td className="border px-1 py-1 text-right">{factTotal}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-2">
        <span className="text-sm text-neon-muted">Заказчик:</span>
        <button onClick={() => setClientFilter(null)} className={`rounded-full px-3 py-1 text-xs border ${clientFilter == null ? 'bg-[#6baf00] text-white border-[#6baf00]' : 'border-white/20'}`}>Все</button>
        {clientPills.map((c) => (
          <button key={c.id} onClick={() => setClientFilter(c.id)} className={`rounded-full px-3 py-1 text-xs border ${Number(clientFilter) === Number(c.id) ? 'bg-[#6baf00] text-white border-[#6baf00]' : 'border-white/20'}`}>
            {String(c.name || '').toUpperCase()}
          </button>
        ))}
      </div>

      <header className="sticky top-0 z-[20] flex items-center justify-center gap-3 border-b px-3 py-2" style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}>
        <button className="rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--border)' }} onClick={() => setMonthKey((m) => addMonths(m, -1))}>{'<'}</button>
        <span className="text-sm font-semibold">{monthNameRu(Number(monthKey.slice(5, 7)))} {monthKey.slice(0, 4)}</span>
        <button className="rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--border)' }} onClick={() => setMonthKey((m) => addMonths(m, 1))}>{'>'}</button>
      </header>

      <div className="planning-draft-scroll overflow-x-auto">
        <table className="min-w-[1900px] w-full border-collapse text-xs">
          <thead>
            <tr>
              <th colSpan={5} className="border sticky left-0 z-[8]" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', top: 0 }} />
              {weeks.map((w) => (
                <th key={`wk-title-${w.week_number}`} colSpan={4} className="border px-2 py-1 sticky z-[8]" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', top: 0 }}>
                  <div>{w.title}</div>
                  <div className="text-[10px] text-neon-muted">{w.range}</div>
                </th>
              ))}
              <th colSpan={2} className="border px-2 py-1 sticky z-[8]" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', top: 0 }}>
                Итого
              </th>
            </tr>
            <tr>
              <th colSpan={5} className="border sticky left-0 z-[8]" style={{ background: 'var(--bg2)', borderColor: 'var(--border)', top: 40 }} />
              {weeks.map((w) => (
                <Fragment key={`stage-${w.week_number}`}>
                  <th colSpan={2} className="border px-2 py-1 sticky z-[8]" style={{ background: '#8B6914', borderColor: 'var(--border)', top: 40 }}>Подготовка</th>
                  <th colSpan={2} className="border px-2 py-1 sticky z-[8]" style={{ background: '#1a1a1a', borderColor: 'var(--border)', top: 40 }}>Основное</th>
                </Fragment>
              ))}
              <th colSpan={2} className="border px-2 py-1 sticky z-[8]" style={{ background: '#1a1a1a', borderColor: 'var(--border)', top: 40 }}>Сумма</th>
            </tr>
            <tr>
              <th className="border px-2 py-1 sticky left-0 z-[10]" style={{ width: 45, minWidth: 45, top: 68, background: 'var(--bg2)' }}>№</th>
              <th className="border px-2 py-1 sticky z-[10]" style={{ width: 55, minWidth: 55, left: 45, top: 68, background: 'var(--bg2)' }}>Фото</th>
              <th className="border px-2 py-1 text-left sticky z-[10]" style={{ width: 260, minWidth: 260, left: 100, top: 68, background: 'var(--bg2)' }}>Наименование ГП</th>
              <th className="border px-2 py-1 text-left sticky z-[10]" style={{ width: 130, minWidth: 130, left: 360, top: 68, background: 'var(--bg2)' }}>Заказчик</th>
              <th className="border px-2 py-1 sticky z-[10]" style={{ width: 150, minWidth: 150, left: 490, top: 68, background: 'var(--bg2)' }}>Кол-во</th>
              {weeks.flatMap((w) => ([
                <th key={`h-${w.week_number}-pp`} className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>План</th>,
                <th key={`h-${w.week_number}-pf`} className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>Факт</th>,
                <th key={`h-${w.week_number}-mp`} className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>План</th>,
                <th key={`h-${w.week_number}-mf`} className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>Факт</th>,
              ]))}
              <th className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>Итого План</th>
              <th className="border px-1 py-1 sticky z-[8]" style={{ top: 68, background: 'var(--bg2)' }}>Итого Факт</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => {
              const cap = Math.max(0, Math.round(Number(capacityByGroup[g.id] ?? readCapacity(g.id)) || 0));
              const load = (grouped[g.id].general.concat(grouped[g.id].vb)).reduce((s, o) => s + qty(o), 0);
              const free = cap - load;
              const freeColor = free > 0 ? '#22c55e' : '#ef4444';
              return (
                <Fragment key={g.id}>
                  <tr><td colSpan={7 + weeks.length * 4} className="border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: '#c8ff00', background: 'rgba(200,255,0,0.04)' }}>{g.label}</td></tr>
                  {SUBS.map((s) => {
                    const subKey = `${g.id}:${s.id}`;
                    const fixed = grouped[g.id][s.id] || [];
                    const drafts = ensureDraftRows(g.id, s.id);
                    const rows = [
                      ...fixed.map((o, i) => ({ key: `${subKey}:ord:${o.id}`, idx: i, order: o, client_id: o.client_id, draft: false })),
                      ...drafts.map((r, i) => ({ key: `${subKey}:draft:${r.id}`, idx: fixed.length + i, order: r.order_id ? allOrders.find((o) => Number(o.id) === Number(r.order_id)) : null, client_id: r.client_id, draft: true, rowId: r.id })),
                    ];
                    return (
                      <Fragment key={subKey}>
                        <tr><td colSpan={7 + weeks.length * 4} className="border px-3 py-1 text-[11px] uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg)' }}>{s.label}</td></tr>
                        {rows.map((r) => renderRow(
                          r.key,
                          r.idx,
                          r.order,
                          r.client_id,
                          r.draft,
                          (oid) => (r.draft ? setDraftOrder(subKey, r.rowId, oid) : null),
                          (cid) => (r.draft ? setDraftClient(subKey, r.rowId, cid) : null),
                        ))}
                        <tr>
                          <td colSpan={7 + weeks.length * 4} className="border px-2 py-2" style={{ borderColor: 'var(--border)' }}>
                            <button type="button" onClick={() => addDraftRow(subKey)} className="text-xs text-[#6baf00]">+ Добавить заказ</button>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                  <tr>
                    <td colSpan={7 + weeks.length * 4} className="border px-2 py-2 text-[12px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--bg)' }}>
                      Мощность:{' '}
                      <input
                        type="number"
                        value={capacityByGroup[g.id] ?? String(cap)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCapacityByGroup((prev) => ({ ...prev, [g.id]: v }));
                          scheduleCapacitySave(g.id, v);
                        }}
                        onBlur={(e) => { saveCapacity(g.id, e.target.value).catch(() => {}); }}
                        style={{ width: 70, background: '#2a2a2a', color: 'white', border: '1px solid #555', borderRadius: 4, padding: '2px 8px', textAlign: 'center' }}
                      />{' '}
                      | Загрузка: {load} | Свободно: <span style={{ color: freeColor }}>{free}</span>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-2">
        <Link to="/orders/create" className="text-xs text-[#6baf00]">+ Добавить заказ</Link>
      </div>
    </div>
  );
}

