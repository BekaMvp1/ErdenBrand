import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import StageMovementsSection from '../components/movements/StageMovementsSection';

const TAB_GOODS = 'goods';
const TAB_MATERIALS = 'materials';
const TAB_STOCK = 'stock';
const CARD_STYLE = { border: '1px solid #1e3a5f', background: '#0d1117', borderRadius: 12 };

const emptyGood = { name: '', article: '', photo: '', warehouse_id: '', qty: '', price: '', received_at: '' };
const emptyMaterial = { name: '', type: 'fabric', unit: 'м', warehouse_id: '', qty: '', price: '', received_at: '' };

const STAGE_LABELS = {
  warehouse: 'Склад',
  cutting: 'Раскрой',
  sewing: 'Пошив',
  otk: 'ОТК',
  shipment: 'Отгрузка',
};

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;
const stageLabel = (k) => (k && STAGE_LABELS[k]) || k || '—';

function parseItemName(name) {
  if (!name) return '—';
  const s = String(name);
  if (s.startsWith('CUT_SEW_BATCH_JSON:')) {
    try {
      const json = JSON.parse(s.replace(/^CUT_SEW_BATCH_JSON:/, ''));
      return json.fabric_name || json.material_name || '—';
    } catch {
      return '—';
    }
  }
  if (s.startsWith('SEW_OTK_JSON:')) {
    try {
      const json = JSON.parse(s.replace(/^SEW_OTK_JSON:/, ''));
      return json.model_name || json.material_name || '—';
    } catch {
      return '—';
    }
  }
  return s;
}

export default function Warehouse() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(TAB_GOODS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [goods, setGoods] = useState([]);
  const [stageGoods, setStageGoods] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [q, setQ] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [goodForm, setGoodForm] = useState(emptyGood);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [stockRows, setStockRows] = useState([]);
  const [expandedBatches, setExpandedBatches] = useState({});

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [ww, gg, stageGg, mm, ss] = await Promise.all([
        api.warehouse.warehouses(),
        api.warehouse.goods(),
        api.warehouse.goods({ kind: 'stage_products' }),
        api.warehouse.materials(),
        api.warehouse.stock(),
      ]);
      setWarehouses(Array.isArray(ww) ? ww : []);
      setGoods(Array.isArray(gg) ? gg : []);
      setStageGoods(Array.isArray(stageGg) ? stageGg : []);
      setMaterials(Array.isArray(mm) ? mm : []);
      setStockRows(Array.isArray(ss) ? ss : []);
      setOpenGroups((prev) => {
        const next = { ...prev };
        (Array.isArray(ww) ? ww : []).forEach((w) => {
          if (next[`${TAB_GOODS}-${w.id}`] == null) next[`${TAB_GOODS}-${w.id}`] = true;
          if (next[`${TAB_MATERIALS}-${w.id}`] == null) next[`${TAB_MATERIALS}-${w.id}`] = true;
        });
        return next;
      });
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки склада');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const filteredGoods = useMemo(() => goods.filter((g) => {
    if (warehouseFilter && String(g.warehouse_id) !== String(warehouseFilter)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (!`${g.name || ''} ${g.article || ''}`.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [goods, warehouseFilter, q]);

  const filteredStageGoods = useMemo(() => stageGoods.filter((g) => {
    if (warehouseFilter && String(g.warehouse_id) !== String(warehouseFilter)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = `${parseItemName(g.model_name)} ${g.model_name || ''} ${g.order_id ?? ''} ${g.stage || ''} ${g.warehouse_name || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [stageGoods, warehouseFilter, q]);

  const filteredMaterials = useMemo(() => materials.filter((m) => {
    if (warehouseFilter && String(m.warehouse_id) !== String(warehouseFilter)) return false;
    if (typeFilter && String(m.type) !== String(typeFilter)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (!`${m.name || ''}`.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [materials, warehouseFilter, typeFilter, q]);

  const groupedGoods = useMemo(() => warehouses.map((w) => {
    const rows = filteredGoods.filter((g) => String(g.warehouse_id) === String(w.id));
    return { warehouse: w, rows, qty: rows.reduce((s, r) => s + toNum(r.qty), 0), sum: rows.reduce((s, r) => s + toNum(r.qty) * toNum(r.price), 0) };
  }), [warehouses, filteredGoods]);

  const groupedMaterials = useMemo(() => warehouses.map((w) => {
    const rows = filteredMaterials.filter((m) => String(m.warehouse_id) === String(w.id));
    return { warehouse: w, rows, qty: rows.reduce((s, r) => s + toNum(r.qty), 0), sum: rows.reduce((s, r) => s + toNum(r.qty) * toNum(r.price), 0) };
  }), [warehouses, filteredMaterials]);

  const filteredStock = useMemo(() => stockRows.filter((r) => {
    if (warehouseFilter && String(r.warehouse_id) !== String(warehouseFilter)) return false;
    if (typeFilter && String(r.material_type || r.type || '') !== String(typeFilter)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const nm = `${parseItemName(r.material_name || r.name)} ${r.material_name || r.name || ''}`.toLowerCase();
      if (!nm.includes(s)) return false;
    }
    return true;
  }), [stockRows, warehouseFilter, typeFilter, q]);

  const dashboard = useMemo(() => {
    const manualGoodsSum = goods.reduce((s, g) => s + toNum(g.qty) * toNum(g.price), 0);
    const stageSum = stageGoods.reduce((s, g) => s + toNum(g.total_sum), 0);
    const goodsSum = manualGoodsSum + stageSum;
    const goodsCount = goods.length + stageGoods.length;
    const matSum = materials.reduce((s, m) => s + toNum(m.qty) * toNum(m.price), 0);
    return { goodsCount, goodsSum, matCount: materials.length, matSum, warehouseCount: warehouses.length, total: goodsSum + matSum };
  }, [goods, stageGoods, materials, warehouses]);

  const fifoStockStats = useMemo(() => {
    let sum = 0;
    let positions = 0;
    let batchCount = 0;
    for (const r of stockRows) {
      sum += toNum(r.total_sum ?? (toNum(r.quantity) * toNum(r.price_per_unit ?? r.price)));
      positions += 1;
      batchCount += Array.isArray(r.batches) ? r.batches.length : 1;
    }
    return { sum, positions, batchCount };
  }, [stockRows]);

  const toggleBatches = (key) =>
    setExpandedBatches((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleGroup = (key) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));

  const openCreateModal = () => {
    setEditingItem(null);
    setGoodForm(emptyGood);
    setMaterialForm(emptyMaterial);
    setItemModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingItem(row);
    if (tab === TAB_GOODS) {
      setGoodForm({
        name: row.name || '',
        article: row.article || '',
        photo: row.photo || '',
        warehouse_id: String(row.warehouse_id || ''),
        qty: String(row.qty ?? ''),
        price: String(row.price ?? ''),
        received_at: row.received_at || '',
      });
    } else {
      setMaterialForm({
        name: row.name || '',
        type: row.type || 'fabric',
        unit: row.unit || 'м',
        warehouse_id: String(row.warehouse_id || ''),
        qty: String(row.qty ?? ''),
        price: String(row.price ?? ''),
        received_at: row.received_at || '',
      });
    }
    setItemModalOpen(true);
  };

  const saveItem = async () => {
    try {
      if (tab === TAB_GOODS) {
        const payload = { ...goodForm, warehouse_id: Number(goodForm.warehouse_id), qty: toNum(goodForm.qty), price: toNum(goodForm.price) };
        if (editingItem) await api.warehouse.updateGood(editingItem.id, payload);
        else await api.warehouse.addGood(payload);
      } else {
        const payload = { ...materialForm, warehouse_id: Number(materialForm.warehouse_id), qty: toNum(materialForm.qty), price: toNum(materialForm.price) };
        if (editingItem) await api.warehouse.updateMaterial(editingItem.id, payload);
        else await api.warehouse.addMaterial(payload);
      }
      setItemModalOpen(false);
      setNotice(editingItem ? 'Запись обновлена' : 'Запись добавлена');
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Ошибка сохранения');
    }
  };

  const removeItem = async (row) => {
    if (!window.confirm('Удалить запись?')) return;
    try {
      if (tab === TAB_GOODS) await api.warehouse.deleteGood(row.id);
      else await api.warehouse.deleteMaterial(row.id);
      setNotice('Запись удалена');
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Ошибка удаления');
    }
  };

  const createWarehouse = async () => {
    try {
      const name = newWarehouseName.trim();
      if (!name) return;
      await api.warehouse.addWarehouse({ name });
      setWarehouseModalOpen(false);
      setNewWarehouseName('');
      setNotice('Склад создан');
      await loadAll();
    } catch (e) {
      setError(e?.message || 'Ошибка создания склада');
    }
  };

  const onGoodPhotoUpload = async (file) => {
    if (!file) return;
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setGoodForm((p) => ({ ...p, photo: data }));
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Склад</h1>
      </div>

      {error ? <div className="mb-3 rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="mb-3 rounded bg-green-500/20 p-2 text-sm text-green-300">{notice}</div> : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div style={CARD_STYLE} className="p-4"><div className="text-white/70">📦 Товары</div><div className="mt-1 text-xl font-semibold">{dashboard.goodsCount} позиций</div><div className="text-sm text-emerald-400">{money(dashboard.goodsSum)}</div></div>
        <div style={CARD_STYLE} className="p-4"><div className="text-white/70">🧵 Материалы</div><div className="mt-1 text-xl font-semibold">{dashboard.matCount} позиций</div><div className="text-sm text-emerald-400">{money(dashboard.matSum)}</div></div>
        <div style={CARD_STYLE} className="p-4"><div className="text-white/70">🏭 Складов</div><div className="mt-1 text-xl font-semibold">{dashboard.warehouseCount} склада</div></div>
        <div style={CARD_STYLE} className="p-4"><div className="text-white/70">💰 Итого сум</div><div className="mt-1 text-xl font-semibold text-emerald-400">{money(dashboard.total)}</div></div>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div style={CARD_STYLE} className="p-4">
          <div className="text-white/70">📋 Остатки (ФИФО) — итого по складу</div>
          <div className="mt-1 text-xl font-semibold text-emerald-400">{money(fifoStockStats.sum)}</div>
        </div>
        <div style={CARD_STYLE} className="p-4">
          <div className="text-white/70">Позиций (уник. материалов)</div>
          <div className="mt-1 text-xl font-semibold">{fifoStockStats.positions}</div>
        </div>
        <div style={CARD_STYLE} className="p-4">
          <div className="text-white/70">Партий на складе</div>
          <div className="mt-1 text-xl font-semibold">{fifoStockStats.batchCount}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" placeholder="🔍 Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
          <option value="">Все склады</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={tab !== TAB_MATERIALS && tab !== TAB_STOCK}>
          <option value="">Все типы</option><option value="fabric">Ткань</option><option value="accessories">Фурнитура</option>
        </select>
        {(tab === TAB_GOODS || tab === TAB_MATERIALS) ? (
          <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={openCreateModal}>+ Добавить</button>
        ) : null}
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" onClick={() => setWarehouseModalOpen(true)}>+ Новый склад</button>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        <button className={`rounded px-3 py-2 text-sm ${tab === TAB_GOODS ? 'bg-green-600' : 'bg-white/10'}`} onClick={() => setTab(TAB_GOODS)}>📦 Товары</button>
        <button className={`rounded px-3 py-2 text-sm ${tab === TAB_MATERIALS ? 'bg-green-600' : 'bg-white/10'}`} onClick={() => setTab(TAB_MATERIALS)}>🧵 Материалы</button>
        <button className={`rounded px-3 py-2 text-sm ${tab === TAB_STOCK ? 'bg-green-600' : 'bg-white/10'}`} onClick={() => setTab(TAB_STOCK)}>📋 Остатки</button>
      </div>

      {(tab === TAB_MATERIALS || tab === TAB_STOCK) ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate('/movements/new?from=warehouse&to=cutting')}
            className="rounded px-3 py-2 text-sm text-white font-semibold"
            style={{ background: '#16a34a' }}
          >
            📦 Передать в Раскрой
          </button>
        </div>
      ) : null}

      {loading ? <div className="rounded border border-white/10 p-4 text-center">Загрузка...</div> : tab === TAB_STOCK ? (
        <div style={CARD_STYLE} className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="px-2 py-2 text-left">№</th>
                <th className="px-2 py-2 text-left">Наименование</th>
                <th className="px-2 py-2 text-left">Тип</th>
                <th className="px-2 py-2 text-left">Ед.изм</th>
                <th className="px-2 py-2 text-left">Кол-во</th>
                <th className="px-2 py-2 text-left">Цена за ед.</th>
                <th className="px-2 py-2 text-left">Сумма</th>
                <th className="px-2 py-2 text-left">Поставщик</th>
                <th className="px-2 py-2 text-left">Склад</th>
                <th className="px-2 py-2 text-left">Откуда</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.map((row, idx) => {
                const rowKey = `${row.warehouse_id}_${row.material_name || row.name}_${row.type || row.material_type}`;
                const expanded = !!expandedBatches[rowKey];
                const qtyDisp = row.total_qty ?? row.quantity ?? row.qty;
                const avg = row.avg_price ?? row.price_per_unit ?? row.price;
                const lineSum = row.total_sum ?? toNum(qtyDisp) * toNum(avg);
                const batchList = Array.isArray(row.batches) ? row.batches : [];
                return (
                  <Fragment key={rowKey}>
                    <tr className="border-t border-white/10 odd:bg-[#111] even:bg-[#0d0d0d]">
                      <td className="px-2 py-2 text-center">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <div>{parseItemName(row.material_name || row.name)}</div>
                        <button
                          type="button"
                          onClick={() => toggleBatches(rowKey)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: 11,
                            marginTop: 4,
                            padding: 0,
                          }}
                        >
                          {expanded ? '▲' : '▼'} {batchList.length} партий
                        </button>
                      </td>
                      <td className="px-2 py-2">{row.material_type === 'fabric' ? 'Ткань' : row.material_type === 'accessories' ? 'Фурнитура' : '—'}</td>
                      <td className="px-2 py-2">{row.unit}</td>
                      <td className="px-2 py-2">{qtyDisp}</td>
                      <td className="px-2 py-2">{money(avg)}</td>
                      <td className="px-2 py-2 text-emerald-400">{money(lineSum)}</td>
                      <td className="px-2 py-2">{row.supplier || '—'}</td>
                      <td className="px-2 py-2">{row.warehouse_name || '—'}</td>
                      <td className="px-2 py-2 text-xs text-white/80">{row.source_label || '—'}</td>
                    </tr>
                    {expanded && batchList.length > 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '4px 16px', background: '#0f172a' }}>
                          <table style={{ width: '100%', fontSize: 11 }}>
                            <thead>
                              <tr className="text-left text-white/60">
                                <th className="py-1 pr-2">Партия</th>
                                <th className="py-1 pr-2">Дата прихода</th>
                                <th className="py-1 pr-2">Кол-во</th>
                                <th className="py-1 pr-2">Цена</th>
                                <th className="py-1 pr-2">Сумма</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchList.map((b, i) => (
                                <tr key={b.id || i} style={{ color: i === 0 ? '#fbbf24' : '#94a3b8' }}>
                                  <td className="py-1 pr-2">{b.batch_number || `Партия ${i + 1}`}</td>
                                  <td className="py-1 pr-2">
                                    {b.received_at
                                      ? new Date(b.received_at).toLocaleDateString('ru-RU')
                                      : '—'}
                                  </td>
                                  <td className="py-1 pr-2">
                                    {b.qty} {row.unit || ''}
                                  </td>
                                  <td className="py-1 pr-2">{money(b.price)}</td>
                                  <td className="py-1 pr-2">
                                    {(toNum(b.qty) * toNum(b.price)).toLocaleString('ru-RU')} сом
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 600, color: '#a3e635' }}>
                                <td colSpan={2}>ИТОГО (ФИФО)</td>
                                <td>
                                  {qtyDisp} {row.unit || ''}
                                </td>
                                <td>ср. {avg}</td>
                                <td>{toNum(lineSum).toLocaleString('ru-RU')} сом</td>
                              </tr>
                            </tfoot>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!filteredStock.length ? <div className="p-4 text-sm text-white/60">Пусто</div> : null}
        </div>
      ) : tab === TAB_GOODS ? (
        <div className="space-y-3">
          <div style={CARD_STYLE} className="overflow-x-auto">
            <div className="border-b border-white/10 px-4 py-3 font-semibold" style={{ background: '#0f2744' }}>
              Поступления изделий (этапы производства)
            </div>
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-2 py-2 text-left">№</th>
                  <th className="px-2 py-2 text-left">Заказ</th>
                  <th className="px-2 py-2 text-left">Модель</th>
                  <th className="px-2 py-2 text-left">Этап</th>
                  <th className="px-2 py-2 text-left">Склад</th>
                  <th className="px-2 py-2 text-left">Кол-во</th>
                  <th className="px-2 py-2 text-left">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {filteredStageGoods.map((g, i) => (
                  <tr
                    key={`${g.order_id}_${g.model_name}_${g.stage}_${g.warehouse_id}`}
                    className="border-t border-white/10 odd:bg-[#111] even:bg-[#0d0d0d]"
                  >
                    <td className="px-2 py-2 text-center">{i + 1}</td>
                    <td className="px-2 py-2">{g.order_id ?? '—'}</td>
                    <td className="px-2 py-2">{parseItemName(g.model_name)}</td>
                    <td className="px-2 py-2">{stageLabel(g.stage)}</td>
                    <td className="px-2 py-2 text-white/80">{g.warehouse_name || g.warehouse_id || '—'}</td>
                    <td className="px-2 py-2">{toNum(g.total_qty)} шт</td>
                    <td className="px-2 py-2 text-emerald-400">{toNum(g.total_sum).toLocaleString('ru-RU')} сом</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredStageGoods.length ? <div className="p-4 text-sm text-white/60">Нет поступлений по этапам</div> : null}
          </div>

          <div className="text-sm text-white/60">Учётные позиции (вручную)</div>
          {groupedGoods.map((group) => {
            const key = `${tab}-${group.warehouse.id}`;
            const expanded = !!openGroups[key];
            return (
              <div key={key} style={CARD_STYLE}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-t-xl px-4 py-4 text-left"
                  style={{ background: '#0f2744' }}
                  onClick={() => toggleGroup(key)}
                >
                  <div>
                    <div className="font-semibold">📍 {group.warehouse.name}</div>
                    <div className="text-xs text-white/70">{group.rows.length ? `Итого: ${Math.round(group.qty)} шт | ` : ''}<span className="text-emerald-400">{money(group.sum)}</span></div>
                  </div>
                  <div className="text-sm text-white/80">{group.rows.length} позиции {expanded ? '▲' : '▼'}</div>
                </button>
                {expanded ? (
                  group.rows.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[1000px] w-full text-sm">
                        <thead className="bg-white/5">
                          <tr><th className="px-2 py-2">№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th /></tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, idx) => {
                            const qty = toNum(row.qty);
                            const qtyClass = qty === 0 ? 'text-red-400' : qty < 10 ? 'text-yellow-400' : '';
                            return (
                              <tr key={row.id} className="group border-t border-white/10 odd:bg-[#111] even:bg-[#0d0d0d]">
                                <td className="px-2 py-2 text-center">{idx + 1}</td>
                                <td className="px-2 py-2">{row.name}</td>
                                <td className="px-2 py-2">шт</td>
                                <td className={`px-2 py-2 ${qtyClass}`}>{qty}</td>
                                <td className="px-2 py-2">{money(row.price)}</td>
                                <td className="px-2 py-2 text-emerald-400">{money(toNum(row.qty) * toNum(row.price))}</td>
                                <td className="px-2 py-2">
                                  <div className="invisible flex gap-2 group-hover:visible">
                                    <button type="button" className="rounded bg-sky-700 px-2 py-1 text-xs" onClick={() => openEdit(row)}>✏️ Редактировать</button>
                                    <button type="button" className="rounded bg-red-700 px-2 py-1 text-xs" onClick={() => removeItem(row)}>🗑️ Удалить</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="p-4 text-sm text-white/60">Пусто</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {groupedMaterials.map((group) => {
            const key = `${tab}-${group.warehouse.id}`;
            const expanded = !!openGroups[key];
            return (
              <div key={key} style={CARD_STYLE}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-t-xl px-4 py-4 text-left"
                  style={{ background: '#0f2744' }}
                  onClick={() => toggleGroup(key)}
                >
                  <div>
                    <div className="font-semibold">📍 {group.warehouse.name}</div>
                    <div className="text-xs text-white/70">{group.rows.length ? `Итого: ${Math.round(group.qty)} м/шт | ` : ''}<span className="text-emerald-400">{money(group.sum)}</span></div>
                  </div>
                  <div className="text-sm text-white/80">{group.rows.length} позиции {expanded ? '▲' : '▼'}</div>
                </button>
                {expanded ? (
                  group.rows.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[1000px] w-full text-sm">
                        <thead className="bg-white/5">
                          <tr><th className="px-2 py-2">№</th><th>Наименование</th><th>Тип</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th /></tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, idx) => {
                            const qty = toNum(row.qty);
                            const qtyClass = qty === 0 ? 'text-red-400' : qty < 10 ? 'text-yellow-400' : '';
                            return (
                              <tr key={row.id} className="group border-t border-white/10 odd:bg-[#111] even:bg-[#0d0d0d]">
                                <td className="px-2 py-2 text-center">{idx + 1}</td>
                                <td className="px-2 py-2">{row.name}</td>
                                <td className="px-2 py-2">{row.type === 'fabric' ? 'Ткань' : 'Фурнитура'}</td>
                                <td className="px-2 py-2">{row.unit}</td>
                                <td className={`px-2 py-2 ${qtyClass}`}>{qty}</td>
                                <td className="px-2 py-2">{money(row.price)}</td>
                                <td className="px-2 py-2 text-emerald-400">{money(toNum(row.qty) * toNum(row.price))}</td>
                                <td className="px-2 py-2">
                                  <div className="invisible flex gap-2 group-hover:visible">
                                    <button type="button" className="rounded bg-sky-700 px-2 py-1 text-xs" onClick={() => openEdit(row)}>✏️ Редактировать</button>
                                    <button type="button" className="rounded bg-red-700 px-2 py-1 text-xs" onClick={() => removeItem(row)}>🗑️ Удалить</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="p-4 text-sm text-white/60">Пусто</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {itemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-5">
            <h3 className="mb-4 text-lg font-semibold">{editingItem ? 'Редактировать' : 'Добавить'} {tab === TAB_GOODS ? 'товар' : 'материал'}</h3>
            {tab === TAB_GOODS ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs text-white/70">Фото</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="file" accept="image/*" onChange={(e) => onGoodPhotoUpload(e.target.files?.[0])} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Наименование*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={goodForm.name} onChange={(e) => setGoodForm((p) => ({ ...p, name: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Артикул</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={goodForm.article} onChange={(e) => setGoodForm((p) => ({ ...p, article: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Склад*</label><select className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={goodForm.warehouse_id} onChange={(e) => setGoodForm((p) => ({ ...p, warehouse_id: e.target.value }))}><option value="">Выберите склад</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                <div><label className="mb-1 block text-xs text-white/70">Кол-во*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="number" value={goodForm.qty} onChange={(e) => setGoodForm((p) => ({ ...p, qty: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Цена*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="number" value={goodForm.price} onChange={(e) => setGoodForm((p) => ({ ...p, price: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Дата поступления</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="date" value={goodForm.received_at} onChange={(e) => setGoodForm((p) => ({ ...p, received_at: e.target.value }))} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div><label className="mb-1 block text-xs text-white/70">Наименование*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={materialForm.name} onChange={(e) => setMaterialForm((p) => ({ ...p, name: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Тип*</label><select className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={materialForm.type} onChange={(e) => setMaterialForm((p) => ({ ...p, type: e.target.value }))}><option value="fabric">Ткань</option><option value="accessories">Фурнитура</option></select></div>
                <div><label className="mb-1 block text-xs text-white/70">Ед.изм*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={materialForm.unit} onChange={(e) => setMaterialForm((p) => ({ ...p, unit: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Склад*</label><select className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={materialForm.warehouse_id} onChange={(e) => setMaterialForm((p) => ({ ...p, warehouse_id: e.target.value }))}><option value="">Выберите склад</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                <div><label className="mb-1 block text-xs text-white/70">Кол-во*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="number" value={materialForm.qty} onChange={(e) => setMaterialForm((p) => ({ ...p, qty: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Цена*</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="number" value={materialForm.price} onChange={(e) => setMaterialForm((p) => ({ ...p, price: e.target.value }))} /></div>
                <div><label className="mb-1 block text-xs text-white/70">Дата поступления</label><input className="w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" type="date" value={materialForm.received_at} onChange={(e) => setMaterialForm((p) => ({ ...p, received_at: e.target.value }))} /></div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded bg-slate-600 px-3 py-2 text-sm" onClick={() => setItemModalOpen(false)}>Отмена</button>
              <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={saveItem}>Сохранить</button>
            </div>
          </div>
        </div>
      ) : null}

      {warehouseModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#0d1117] p-5">
            <h3 className="mb-3 text-lg font-semibold">Новый склад</h3>
            <label className="mb-1 block text-xs text-white/70">Название склада</label>
            <input className="mb-4 w-full rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="rounded bg-slate-600 px-3 py-2 text-sm" onClick={() => setWarehouseModalOpen(false)}>Отмена</button>
              <button className="rounded bg-indigo-600 px-3 py-2 text-sm" onClick={createWarehouse}>Сохранить</button>
            </div>
          </div>
        </div>
      ) : null}

      <StageMovementsSection incomingToStage="warehouse" outgoingFromStage="warehouse" />
    </div>
  );
}
