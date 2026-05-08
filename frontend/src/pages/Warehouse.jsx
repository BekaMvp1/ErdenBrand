import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const TAB_GOODS = 'goods';
const TAB_MATERIALS = 'materials';
const CARD_STYLE = { border: '1px solid #1e3a5f', background: '#0d1117', borderRadius: 12 };

const emptyGood = { name: '', article: '', photo: '', warehouse_id: '', qty: '', price: '', received_at: '' };
const emptyMaterial = { name: '', type: 'fabric', unit: 'м', warehouse_id: '', qty: '', price: '', received_at: '' };

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;

export default function Warehouse() {
  const [tab, setTab] = useState(TAB_GOODS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [goods, setGoods] = useState([]);
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

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [ww, gg, mm] = await Promise.all([api.warehouse.warehouses(), api.warehouse.goods(), api.warehouse.materials()]);
      setWarehouses(Array.isArray(ww) ? ww : []);
      setGoods(Array.isArray(gg) ? gg : []);
      setMaterials(Array.isArray(mm) ? mm : []);
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

  const dashboard = useMemo(() => {
    const goodsSum = goods.reduce((s, g) => s + toNum(g.qty) * toNum(g.price), 0);
    const matSum = materials.reduce((s, m) => s + toNum(m.qty) * toNum(m.price), 0);
    return { goodsCount: goods.length, goodsSum, matCount: materials.length, matSum, warehouseCount: warehouses.length, total: goodsSum + matSum };
  }, [goods, materials, warehouses]);

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

  const groups = tab === TAB_GOODS ? groupedGoods : groupedMaterials;

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
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

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" placeholder="🔍 Поиск..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
          <option value="">Все склады</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={tab !== TAB_MATERIALS}>
          <option value="">Все типы</option><option value="fabric">Ткань</option><option value="accessories">Фурнитура</option>
        </select>
        <button className="rounded bg-blue-600 px-3 py-2 text-sm" onClick={openCreateModal}>+ Добавить</button>
        <button className="rounded bg-indigo-600 px-3 py-2 text-sm" onClick={() => setWarehouseModalOpen(true)}>+ Новый склад</button>
      </div>

      <div className="mb-4 flex gap-2">
        <button className={`rounded px-3 py-2 text-sm ${tab === TAB_GOODS ? 'bg-green-600' : 'bg-white/10'}`} onClick={() => setTab(TAB_GOODS)}>📦 Товары</button>
        <button className={`rounded px-3 py-2 text-sm ${tab === TAB_MATERIALS ? 'bg-green-600' : 'bg-white/10'}`} onClick={() => setTab(TAB_MATERIALS)}>🧵 Материалы</button>
      </div>

      {loading ? <div className="rounded border border-white/10 p-4 text-center">Загрузка...</div> : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${tab}-${group.warehouse.id}`;
            const expanded = !!openGroups[key];
            return (
              <div key={key} style={CARD_STYLE}>
                <button
                  className="flex w-full items-center justify-between rounded-t-xl px-4 py-4 text-left"
                  style={{ background: '#0f2744' }}
                  onClick={() => toggleGroup(key)}
                >
                  <div>
                    <div className="font-semibold">📍 {group.warehouse.name}</div>
                    <div className="text-xs text-white/70">{group.rows.length ? `Итого: ${Math.round(group.qty)} ${tab === TAB_GOODS ? 'шт' : 'м/шт'} | ` : ''}<span className="text-emerald-400">{money(group.sum)}</span></div>
                  </div>
                  <div className="text-sm text-white/80">{group.rows.length} позиции {expanded ? '▲' : '▼'}</div>
                </button>
                {expanded ? (
                  group.rows.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[1000px] w-full text-sm">
                        <thead className="bg-white/5">
                          {tab === TAB_GOODS ? (
                            <tr><th className="px-2 py-2">№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th /></tr>
                          ) : (
                            <tr><th className="px-2 py-2">№</th><th>Наименование</th><th>Тип</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th /></tr>
                          )}
                        </thead>
                        <tbody>
                          {group.rows.map((row, idx) => {
                            const qty = toNum(row.qty);
                            const qtyClass = qty === 0 ? 'text-red-400' : qty < 10 ? 'text-yellow-400' : '';
                            return (
                              <tr key={row.id} className="group border-t border-white/10 odd:bg-[#111] even:bg-[#0d0d0d]">
                                <td className="px-2 py-2 text-center">{idx + 1}</td>
                                <td className="px-2 py-2">{row.name}</td>
                                {tab === TAB_MATERIALS ? <td className="px-2 py-2">{row.type === 'fabric' ? 'Ткань' : 'Фурнитура'}</td> : null}
                                <td className="px-2 py-2">{tab === TAB_GOODS ? 'шт' : row.unit}</td>
                                <td className={`px-2 py-2 ${qtyClass}`}>{qty}</td>
                                <td className="px-2 py-2">{money(row.price)}</td>
                                <td className="px-2 py-2 text-emerald-400">{money(toNum(row.qty) * toNum(row.price))}</td>
                                <td className="px-2 py-2">
                                  <div className="invisible flex gap-2 group-hover:visible">
                                    <button className="rounded bg-sky-700 px-2 py-1 text-xs" onClick={() => openEdit(row)}>✏️ Редактировать</button>
                                    <button className="rounded bg-red-700 px-2 py-1 text-xs" onClick={() => removeItem(row)}>🗑️ Удалить</button>
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
    </div>
  );
}
