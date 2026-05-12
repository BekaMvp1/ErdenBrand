import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

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

/** Ткань/фурнитура: массив или { groups[].rows[] } */
function materialRowsFromJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray(raw.groups)) {
    const out = [];
    raw.groups.forEach((g) => {
      (g?.rows || []).forEach((r) => out.push(r));
    });
    return out;
  }
  return [];
}

function planQtyFromMaterialRow(r) {
  return toNum(r?.qty_total ?? r?.qtyTotal ?? r?.itogo ?? 0);
}

/** Сумма строки: явное поле из БД или факт × цена */
function rowLineSum(r) {
  const qty = parseFloat(String(r.fact_qty ?? r.quantity ?? '').replace(',', '.')) || 0;
  const price = parseFloat(String(r.price ?? r.price_per_unit ?? '').replace(',', '.')) || 0;
  const explicit = r.total_sum ?? r.amount ?? r.sum;
  if (explicit != null && explicit !== '') return toNum(explicit);
  return toNum(qty * price);
}

const COMPACT_CTRL = {
  fontSize: '11px',
  padding: '2px 4px',
  background: '#1a1a1a',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 3,
  width: '100%',
};

const CELL = { padding: '3px 4px', fontSize: 11 };

export default function PurchaseReportForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const forceEdit = searchParams.get('edit') === 'true';
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
    comment: '',
    status: 'draft',
  });
  const [items, setItems] = useState([]);
  /** Кэш материалов по заказу: { [orderId]: [{ label, value, type, unit, plan_qty }] } */
  const [materialsByOrder, setMaterialsByOrder] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [toast, setToast] = useState(null);

  /** Только просмотр: утверждён и без ?edit=true */
  const isLockedApproved = header.status === 'approved' && !forceEdit;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const updateRow = (rowId, patch) => {
    setItems((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const removeRow = (rowId) => {
    setItems((prev) => prev.filter((r) => r.id !== rowId));
  };

  const syncSupplierToReference = async (name) => {
    const n = String(name || '').trim();
    if (n.length < 2) return;
    try {
      await api.post('/api/references/suppliers', { name: n });
      const data = await api.references.suppliers();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[syncSupplier]:', e?.message || e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.references.suppliers();
        if (!cancelled) setSuppliers(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSuppliers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        const docOrderId = String(doc.order_id || '');
        const mappedItems = (doc.Items || []).map((it, i) => ({
          id: it.id != null ? `db-${it.id}` : `e-${i}-${doc.id}`,
          order_id:
            it.order_id != null && String(it.order_id).trim() !== ''
              ? String(it.order_id)
              : docOrderId,
          order_label: '',
          name: it.name || '',
          material_name: it.material_name || it.name || '',
          type: it.material_type || 'fabric',
          unit: it.unit || 'шт',
          warehouse_id: String(it.warehouse_id || ''),
          plan_qty: toNum(it.plan_qty),
          fact_qty: it.fact_qty != null ? String(it.fact_qty) : '',
          price: it.price != null ? String(it.price) : '',
          total_sum: it.total_sum != null ? toNum(it.total_sum) : undefined,
          supplier: it.supplier || '',
          supplierManual: false,
          note: it.note || '',
        }));
        setHeader({
          id: doc.id,
          doc_number: doc.doc_number || '',
          doc_date: (doc.created_at || '').slice(0, 10),
          order_id: docOrderId,
          user_id: String(doc.user_id || ''),
          workshop_id: String(doc.workshop_id || ''),
          comment: doc.comment || '',
          status: doc.status || 'draft',
        });
        setSelectedOrderId(docOrderId);
        setItems(mappedItems);

        const preloadIds = [
          ...new Set(
            [...mappedItems.map((r) => r.order_id), docOrderId]
              .filter((x) => x != null && String(x).trim() !== '')
              .map((x) => String(x)),
          ),
        ];
        const mergedMats = {};
        for (const oid of preloadIds) {
          try {
            const order = await api.orders.get(oid);
            mergedMats[oid] = buildMaterialOptions(order);
          } catch (e) {
            console.error('[preload materials]', oid, e?.message || e);
            mergedMats[oid] = [];
          }
        }
        for (const row of mappedItems) {
          const oid = String(row.order_id || '');
          const nm = String(row.material_name || row.name || '').trim();
          if (!oid || !nm) continue;
          const list = [...(mergedMats[oid] || [])];
          if (!list.some((m) => m.value === nm)) {
            list.push({
              label: nm,
              value: nm,
              type: row.type === 'accessories' ? 'accessories' : 'fabric',
              unit: row.unit || 'шт',
              plan_qty: toNum(row.plan_qty),
            });
          }
          mergedMats[oid] = list;
        }
        setMaterialsByOrder((prev) => ({ ...prev, ...mergedMats }));
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
    const oid = header.order_id || selectedOrderId;
    if (oid) loadMaterialsForOrder(String(oid));
  }, [header.order_id, selectedOrderId]);

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

  const orderLabel = (o) => {
    if (!o) return '';
    const num = o.order_number || o.number || o.tz_code || o.tz || o.id || '';
    const title = o.product_name || o.model_name || o.name || '';
    return title ? `${num} · ${title}` : String(num);
  };

  const buildMaterialOptions = (order) => {
    const fabricRows = materialRowsFromJson(order?.fabric_data);
    const fittingRows = materialRowsFromJson(order?.fittings_data);
    const fromFabric = fabricRows
      .filter((r) => materialNameOf(r))
      .map((r) => {
        const name = materialNameOf(r);
        return {
          label: name,
          value: name,
          type: 'fabric',
          unit: String(r.unit || 'м').trim() || 'м',
          plan_qty: planQtyFromMaterialRow(r),
        };
      });
    const fromFitting = fittingRows
      .filter((r) => materialNameOf(r))
      .map((r) => {
        const name = materialNameOf(r);
        return {
          label: name,
          value: name,
          type: 'accessories',
          unit: String(r.unit || 'шт').trim() || 'шт',
          plan_qty: planQtyFromMaterialRow(r),
        };
      });
    return [...fromFabric, ...fromFitting];
  };

  const loadMaterialsForOrder = async (orderId, force = false) => {
    const key = String(orderId);
    if (!key) return;
    try {
      const order = await api.orders.get(key);
      const mats = buildMaterialOptions(order);
      setMaterialsByOrder((prev) => {
        if (!force && prev[key]?.length) return prev;
        return { ...prev, [key]: mats };
      });
    } catch (e) {
      console.error('[preload materials]:', e?.message || e);
      setError(e?.message || 'Ошибка загрузки материалов заказа');
    }
  };

  /** Заказ в шапке: только привязка документа и предзагрузка справочника материалов (таблицу не затираем). */
  const onHeaderOrderChange = async (orderId) => {
    setSelectedOrderId(orderId || '');
    setHeader((p) => ({ ...p, order_id: orderId }));
    if (orderId) await loadMaterialsForOrder(orderId);
  };

  const handleRowOrderChange = async (rowId, orderIdStr) => {
    const oid = orderIdStr || '';
    if (oid) await loadMaterialsForOrder(oid);
    const o = orders.find((x) => String(x.id) === String(oid));
    setItems((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              order_id: oid,
              order_label: oid ? orderLabel(o) : '',
              name: '',
              material_name: '',
              type: 'fabric',
              unit: 'шт',
              plan_qty: 0,
            }
          : r,
      ),
    );
  };

  const handleRowMaterialChange = (rowId, materialValue) => {
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const oid = String(r.order_id || '');
        const mats = materialsByOrder[oid] || [];
        const mat = mats.find((m) => m.value === materialValue);
        const defaultWh =
          warehouses.length && warehouses[0]?.id != null ? String(warehouses[0].id) : '';
        return {
          ...r,
          name: materialValue,
          material_name: materialValue,
          type: mat?.type === 'accessories' ? 'accessories' : 'fabric',
          unit: mat?.unit || r.unit || 'шт',
          plan_qty: mat?.plan_qty != null ? toNum(mat.plan_qty) : r.plan_qty,
          warehouse_id: r.warehouse_id || defaultWh,
        };
      }),
    );
  };

  const totals = useMemo(() => {
    const plan = items.reduce((s, r) => s + toNum(r.plan_qty), 0);
    const fact = items.reduce((s, r) => s + toNum(r.fact_qty), 0);
    const sum = items.reduce((s, r) => s + rowLineSum(r), 0);
    return { positions: items.length, plan, fact, sum };
  }, [items]);

  useEffect(() => {
    if (!orders.length) return;
    setItems((prev) =>
      prev.map((r) => {
        if (!r.order_id) return r;
        const o = orders.find((x) => String(x.id) === String(r.order_id));
        return o ? { ...r, order_label: orderLabel(o) } : r;
      }),
    );
  }, [orders]);
  const currentOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(header.order_id || selectedOrderId)) || {},
    [orders, header.order_id, selectedOrderId]
  );

  const handlePrintChecklist = () => {
    const orderInfo = {
      number: currentOrder.order_number || currentOrder.number || currentOrder.tz || currentOrder.id || '',
      name: currentOrder.product_name || currentOrder.name || currentOrder.model_name || '',
      quantity: currentOrder.quantity || currentOrder.total_qty || currentOrder.total_quantity || 0,
      date: new Date().toLocaleDateString('ru-RU'),
    };
    const fabrics = items.filter((i) => i.type === 'fabric' || i.тип === 'Ткань' || i.category === 'fabric');
    const accessories = items.filter((i) => i.type === 'accessories' || i.тип === 'Фурнитура' || i.category === 'accessories');
    const renderRows = (list, startNum = 1) => list.map((item, idx) => `
      <tr>
        <td>${startNum + idx}</td>
        <td>${item.material_name || item.name || item.materialName || '—'}</td>
        <td style="text-align:center">
          ${item.photo || item.image
            ? `<img src="${item.photo || item.image}" style="width:50px;height:50px;object-fit:cover;border-radius:4px"/>`
            : '—'}
        </td>
        <td>${item.unit || item.ед_изм || '—'}</td>
        <td>${item.planned_qty || item.plan_qty || item.plan || '—'}</td>
        <td>${item.quantity || item.qty || item.кол_во || item.fact_qty || 0}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `).join('');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Чек-лист закупа — ${orderInfo.number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; }
          .header { margin-bottom: 16px; }
          .header h2 { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
          .header-info { display: flex; gap: 40px; margin-bottom: 8px; }
          .header-info span { font-size: 12px; }
          .header-info b { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background: #1a237e; color: #fff; padding: 7px 5px; text-align: left; font-size: 11px; }
          td { padding: 6px 5px; border-bottom: 1px solid #ddd; vertical-align: middle; font-size: 11px; }
          tr:nth-child(even) td { background: #f5f5f5; }
          .group-header td { background: #283593; color: #fff; font-weight: bold; font-size: 11px; padding: 5px; }
          .signatures { margin-top: 30px; display: flex; gap: 80px; }
          .sig-line { border-top: 1px solid #000; width: 200px; margin-top: 40px; font-size: 11px; padding-top: 4px; }
          .footer { margin-top: 20px; font-size: 10px; color: #666; }
          @media print { body { padding: 10px; } button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>ЧЕК-ЛИСТ ЗАКУПА МАТЕРИАЛОВ</h2>
          <div class="header-info">
            <span><b>Заказ:</b> ${orderInfo.number}</span>
            <span><b>Изделие:</b> ${orderInfo.name}</span>
            <span><b>Кол-во:</b> ${orderInfo.quantity} шт</span>
            <span><b>Дата:</b> ${orderInfo.date}</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:30px">№</th>
              <th style="width:160px">Наименование</th>
              <th style="width:60px">Фото</th>
              <th style="width:60px">Ед.изм</th>
              <th style="width:80px">Плановое кол-во</th>
              <th style="width:80px">Кол-во итого</th>
              <th style="width:80px">Цена</th>
              <th style="width:100px">Поставщик</th>
              <th style="width:80px">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${fabrics.length > 0 ? `<tr class="group-header"><td colspan="9">ТКАНЬ</td></tr>${renderRows(fabrics, 1)}` : ''}
            ${accessories.length > 0 ? `<tr class="group-header"><td colspan="9">ФУРНИТУРА</td></tr>${renderRows(accessories, 1)}` : ''}
          </tbody>
        </table>
        <div class="signatures">
          <div><div class="sig-line">Закупщик: ________________</div></div>
          <div><div class="sig-line">Кладовщик: ________________</div></div>
          <div><div class="sig-line">Руководитель: ________________</div></div>
        </div>
        <div class="footer">Сформировано: ${orderInfo.date} | ErdenBrand</div>
      </body>
      </html>
    `;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    window.setTimeout(() => win.print(), 500);
  };

  const saveDoc = async (approve = false) => {
    console.log('[saveDoc] header:', header);
    console.log('[saveDoc] rows:', items);

    const orderFromRow = items.map((r) => r.order_id).find((oid) => oid != null && String(oid).trim() !== '');
    const rawOrderId = selectedOrderId || header.order_id || orderFromRow || '';
    const resolvedHeaderOrderId = parseInt(String(rawOrderId).trim(), 10);

    if (!resolvedHeaderOrderId || Number.isNaN(resolvedHeaderOrderId)) {
      showToast('Выберите заказ', 'error');
      return;
    }

    const rowsWithoutOrder = items.filter((r) => !String(r.order_id ?? '').trim());
    if (rowsWithoutOrder.length > 0) {
      showToast('Выберите заказ для каждой строки таблицы', 'error');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        stage: 'purchase',
        order_id: resolvedHeaderOrderId,
        user_id: header.user_id ? Number(header.user_id) : null,
        workshop_id: header.workshop_id ? Number(header.workshop_id) : null,
        period_start: null,
        period_end: null,
        comment: header.comment || null,
        allow_edit_approved: !!(forceEdit && header.status === 'approved'),
        items: items.map((it) => {
          const rowOrderId = parseInt(String(it.order_id || resolvedHeaderOrderId).trim(), 10);
          const fq = toNum(it.fact_qty);
          const pr = toNum(it.price);
          return {
            name: it.name || it.material_name || '',
            material_name: it.material_name || it.name || '',
            unit: it.unit || 'шт',
            material_type: it.type || 'fabric',
            warehouse_id: it.warehouse_id ? Number(it.warehouse_id) : null,
            plan_qty: toNum(it.plan_qty),
            fact_qty: fq,
            price: pr,
            total_sum: fq * pr,
            supplier: it.supplier || '',
            note: it.note || null,
            order_id: Number.isFinite(rowOrderId) && rowOrderId > 0 ? rowOrderId : resolvedHeaderOrderId,
          };
        }),
      };
      console.log('[saveDoc] payload:', payload);

      let reportId = header.id != null ? Number(header.id) : null;
      if (reportId != null && Number.isNaN(reportId)) reportId = null;

      if (reportId) {
        const updated = await api.stageReports.update(reportId, payload);
        console.log('[saveDoc] response:', updated);
      } else {
        const created = await api.stageReports.create(payload);
        reportId = created?.id;
        console.log('[saveDoc] response:', created);
      }
      if (approve && reportId) {
        await api.stageReports.approve(reportId);
        showToast('Документ утверждён! ✓ Материалы добавлены на склад.', 'success');
      } else if (!approve) {
        showToast('Документ сохранён!', 'success');
      }
      window.setTimeout(() => navigate('/purchase/report'), 450);
    } catch (e) {
      console.error('[saveDoc] ОШИБКА:', e?.details || e?.error || e?.message || e);
      const msg = e?.error || e?.message || 'Ошибка сохранения';
      setError(msg);
      showToast(`Ошибка: ${msg}`, 'error');
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
            <div
              className={`mt-1 inline-flex flex-wrap items-center gap-1 rounded px-2 py-1 text-xs ${header.status === 'approved' ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-200'}`}
            >
              <span>{header.status === 'approved' ? 'Утверждён ✅' : 'Черновик 📝'}</span>
              {forceEdit ? <span className="text-yellow-300">· правка</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrintChecklist}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              🖨️ Печать чек-листа
            </button>
            {!isLockedApproved && header.status !== 'approved' ? (
              <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(false)}>
                Сохранить
              </button>
            ) : null}
            {!isLockedApproved && header.status !== 'approved' ? (
              <button type="button" className="rounded bg-green-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(true)}>
                ✅ Утвердить
              </button>
            ) : null}
            {forceEdit && header.status === 'approved' ? (
              <button
                type="button"
                className="rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                disabled={saving}
                onClick={() => saveDoc(false)}
              >
                💾 Сохранить изменения
              </button>
            ) : null}
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
              <input type="date" className="rounded bg-black/30 px-3 py-2" value={header.doc_date} disabled={isLockedApproved} onChange={(e) => setHeader((p) => ({ ...p, doc_date: e.target.value }))} />
              <select
                value={selectedOrderId || header.order_id || ''}
                disabled={isLockedApproved}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedOrderId(v);
                  onHeaderOrderChange(v);
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1a1a1a',
                  color: 'white',
                  border: !isLockedApproved && !selectedOrderId && !header.order_id
                    ? '1px solid #ff4444'
                    : '1px solid #333',
                  borderRadius: '8px',
                }}
              >
                <option value="">Выберите заказ</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {orderLabel(o)} ({o.total_quantity ?? o.total_qty ?? o.quantity ?? 0} шт)
                  </option>
                ))}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.user_id} disabled={isLockedApproved} onChange={(e) => setHeader((p) => ({ ...p, user_id: e.target.value }))}>
                <option value="">Исполнитель</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="rounded bg-black/30 px-3 py-2" value={header.workshop_id} disabled={isLockedApproved} onChange={(e) => setHeader((p) => ({ ...p, workshop_id: e.target.value }))}>
                <option value="">Цех</option>{workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <textarea className="rounded bg-black/30 px-3 py-2 md:col-span-2" placeholder="Комментарий" value={header.comment} disabled={isLockedApproved} onChange={(e) => setHeader((p) => ({ ...p, comment: e.target.value }))} />
            </div>

            <div style={{ overflowX: 'auto' }} className="rounded border border-white/10">
              <table style={{ minWidth: 1100, fontSize: 11, width: '100%', borderCollapse: 'collapse' }}>
                <thead className="bg-white/5">
                  <tr>
                    <th style={{ ...CELL, width: 28 }}>№</th>
                    <th style={{ ...CELL, width: 160 }}>Заказ</th>
                    <th style={{ ...CELL, width: 140 }}>Наименование</th>
                    <th style={{ ...CELL, width: 70 }}>Тип</th>
                    <th style={{ ...CELL, width: 50 }}>Ед.изм</th>
                    <th style={{ ...CELL, width: 110 }}>Склад</th>
                    <th style={{ ...CELL, width: 50 }}>План</th>
                    <th style={{ ...CELL, width: 70 }}>Факт</th>
                    <th style={{ ...CELL, width: 80 }}>Цена</th>
                    <th style={{ ...CELL, width: 80 }}>Сумма</th>
                    <th style={{ ...CELL, width: 140 }}>Поставщик</th>
                    <th style={{ ...CELL, width: 60 }}>Остаток</th>
                    <th style={{ ...CELL, width: 30 }}>🗑</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const rowOrder = orders.find((o) => String(o.id) === String(it.order_id));
                    const oidKey = String(it.order_id || '');
                    const matsForRow = materialsByOrder[oidKey];
                    const materialsLoaded = matsForRow !== undefined;
                    const supplierLabels = suppliers
                      .map((s) => String(s.name ?? s.value ?? s ?? '').trim())
                      .filter(Boolean);
                    const trimmedSupplier = String(it.supplier || '').trim();
                    const supplierInList = trimmedSupplier && supplierLabels.includes(trimmedSupplier);
                    const supplierSelectValue = it.supplierManual
                      ? '__manual__'
                      : trimmedSupplier && !supplierInList
                        ? '__manual__'
                        : trimmedSupplier;
                    const showManualSupplier =
                      !isLockedApproved &&
                      (it.supplierManual || (trimmedSupplier && !supplierInList));

                    return (
                      <tr key={it.id || idx} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td style={{ ...CELL, width: 28, textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ ...CELL, width: 160 }}>
                          {isLockedApproved ? (
                            <span className="text-[#ECECEC]">
                              {it.order_label || (rowOrder ? orderLabel(rowOrder) : it.order_id || '—')}
                            </span>
                          ) : orders.length === 0 && oidKey ? (
                            <span style={{ color: '#aaa', fontSize: 11 }}>
                              {it.order_label || `Заказ #${it.order_id}`}
                            </span>
                          ) : (
                            <select
                              value={it.order_id || ''}
                              disabled={isLockedApproved}
                              onChange={(e) => handleRowOrderChange(it.id, e.target.value)}
                              style={COMPACT_CTRL}
                            >
                              <option value="">— Заказ —</option>
                              {orders.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {orderLabel(o)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ ...CELL, width: 140 }}>
                          {isLockedApproved ? (
                            <span className="text-[#ECECEC]">{it.material_name || it.name || '—'}</span>
                          ) : !oidKey ? (
                            <span style={{ color: '#aaa', fontSize: 11 }}>—</span>
                          ) : !materialsLoaded ? (
                            <span style={{ color: '#aaa', fontSize: 11 }}>
                              {it.material_name || it.name || '...'}
                            </span>
                          ) : (
                            <select
                              value={it.material_name || it.name || ''}
                              disabled={isLockedApproved || !it.order_id}
                              onChange={(e) => handleRowMaterialChange(it.id, e.target.value)}
                              style={COMPACT_CTRL}
                            >
                              <option value="">— Материал —</option>
                              {(matsForRow || []).map((m, mi) => (
                                <option key={`${m.value}-${mi}`} value={m.value}>
                                  {m.label} ({m.type === 'accessories' ? 'Фурнитура' : 'Ткань'})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={{ ...CELL, width: 70 }}>
                          {it.type === 'accessories' ? 'Фурнитура' : 'Ткань'}
                        </td>
                        <td style={{ ...CELL, width: 50 }}>{it.unit}</td>
                        <td style={{ ...CELL, width: 110 }}>
                          <select
                            style={COMPACT_CTRL}
                            disabled={isLockedApproved}
                            value={it.warehouse_id}
                            onChange={(e) => updateRow(it.id, { warehouse_id: e.target.value })}
                          >
                            <option value="">Склад</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...CELL, width: 50 }}>{toNum(it.plan_qty)}</td>
                        <td style={{ ...CELL, width: 70 }}>
                          <input
                            type="number"
                            style={COMPACT_CTRL}
                            disabled={isLockedApproved}
                            value={it.fact_qty}
                            onChange={(e) => updateRow(it.id, { fact_qty: e.target.value })}
                          />
                        </td>
                        <td style={{ ...CELL, width: 80 }}>
                          <input
                            type="number"
                            style={COMPACT_CTRL}
                            disabled={isLockedApproved}
                            value={it.price}
                            onChange={(e) => updateRow(it.id, { price: e.target.value })}
                          />
                        </td>
                        <td style={{ ...CELL, width: 80 }}>{money(rowLineSum(it))}</td>
                        <td style={{ ...CELL, width: 140 }}>
                          {isLockedApproved ? (
                            <span style={{ fontSize: 11 }}>{it.supplier || '—'}</span>
                          ) : (
                            <>
                              <select
                                value={supplierSelectValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '__manual__') {
                                    updateRow(it.id, { supplier: '', supplierManual: true });
                                  } else {
                                    updateRow(it.id, { supplier: val, supplierManual: false });
                                  }
                                }}
                                style={COMPACT_CTRL}
                              >
                                <option value="">— Поставщик —</option>
                                {suppliers.map((s, i) => (
                                  <option key={s.id ?? i} value={s.name || s.value || s}>
                                    {s.name || s.value || s}
                                  </option>
                                ))}
                                <option value="__manual__">+ Ввести вручную</option>
                              </select>
                              {showManualSupplier ? (
                                <input
                                  type="text"
                                  placeholder="Введите поставщика"
                                  value={it.supplier || ''}
                                  onChange={(e) => updateRow(it.id, { supplier: e.target.value })}
                                  onBlur={(e) => syncSupplierToReference(e.target.value)}
                                  style={{
                                    marginTop: 2,
                                    fontSize: '11px',
                                    padding: '2px 4px',
                                    background: '#1a1a1a',
                                    color: '#fff',
                                    border: '1px solid #444',
                                    borderRadius: 3,
                                    width: '100%',
                                  }}
                                />
                              ) : null}
                            </>
                          )}
                        </td>
                        <td style={{ ...CELL, width: 60 }}>{toNum(it.plan_qty) - toNum(it.fact_qty)}</td>
                        <td style={{ ...CELL, width: 30, textAlign: 'center', verticalAlign: 'middle' }}>
                          {!isLockedApproved ? (
                            <button
                              type="button"
                              title="Удалить строку"
                              onClick={() => removeRow(it.id)}
                              style={{
                                fontSize: 11,
                                padding: '2px 4px',
                                background: '#2a2a2a',
                                color: '#fff',
                                border: '1px solid #444',
                                borderRadius: 3,
                                cursor: 'pointer',
                              }}
                            >
                              🗑
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!isLockedApproved ? (
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-2 text-sm"
                onClick={() => {
                  const oid = header.order_id || selectedOrderId || '';
                  const o = orders.find((x) => String(x.id) === String(oid));
                  setItems((prev) => [
                    ...prev,
                    {
                      id: `m-${Date.now()}-${prev.length}`,
                      order_id: oid ? String(oid) : '',
                      order_label: oid ? orderLabel(o) : '',
                      name: '',
                      material_name: '',
                      type: 'fabric',
                      unit: 'шт',
                      warehouse_id:
                        warehouses[0]?.id != null ? String(warehouses[0].id) : '',
                      plan_qty: 0,
                      fact_qty: '',
                      price: '',
                      total_sum: undefined,
                      supplier: '',
                      supplierManual: false,
                      note: '',
                    },
                  ]);
                  if (oid) loadMaterialsForOrder(String(oid));
                }}
              >
                + Добавить позицию
              </button>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded bg-slate-600 px-3 py-2 text-sm" onClick={() => navigate('/purchase/report')}>← Назад</button>
              {!isLockedApproved && header.status !== 'approved' ? (
                <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(false)}>
                  💾 Черновик
                </button>
              ) : null}
              {!isLockedApproved && header.status !== 'approved' ? (
                <button type="button" className="rounded bg-green-600 px-3 py-2 text-sm" disabled={saving} onClick={() => saveDoc(true)}>
                  ✅ Утвердить
                </button>
              ) : null}
              {forceEdit && header.status === 'approved' ? (
                <button
                  type="button"
                  className="rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
                  disabled={saving}
                  onClick={() => saveDoc(false)}
                >
                  💾 Сохранить изменения
                </button>
              ) : null}
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
      {toast ? (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 9999,
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            background:
              toast.type === 'success'
                ? '#16a34a'
                : toast.type === 'error'
                  ? '#dc2626'
                  : '#2563eb',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 260,
            transition: 'all 0.3s',
          }}
        >
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
