/**
 * Справочники
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useRefreshOnVisible } from '../hooks/useRefreshOnVisible';
import { Chip, NeonButton, NeonCard, NeonInput, NeonSelect } from '../components/ui';
import PrintButton from '../components/PrintButton';
import { RefSection } from '../components/RefSection';

const MODEL_REF_TAB_IDS = new Set([
  'fabric-names',
  'fabric-units',
  'fittings-names',
  'cutting-ops',
  'sewing-ops',
  'otk-ops',
]);

const MODEL_REF_SECTIONS = {
  'fabric-names': {
    title: 'ткань',
    endpoint: '/api/model-refs/fabric-names',
    excelMode: 'name',
    templateFileName: 'Ткани',
  },
  'fabric-units': {
    title: 'единицу измерения',
    endpoint: '/api/model-refs/fabric-units',
    excelMode: 'name',
    templateFileName: 'Ед_измерения',
  },
  'fittings-names': {
    title: 'фурнитуру',
    endpoint: '/api/model-refs/fittings-names',
    excelMode: 'name',
    templateFileName: 'Фурнитура',
  },
  'cutting-ops': {
    title: 'операцию раскроя',
    endpoint: '/api/model-refs/cutting-ops',
    excelMode: 'operations',
    templateFileName: 'Операции_раскроя',
  },
  'sewing-ops': {
    title: 'операцию пошива',
    endpoint: '/api/model-refs/sewing-ops',
    excelMode: 'operations',
    templateFileName: 'Операции_пошива',
  },
  'otk-ops': {
    title: 'операцию ОТК',
    endpoint: '/api/model-refs/otk-ops',
    excelMode: 'operations',
    templateFileName: 'Операции_ОТК',
  },
};

export default function References() {
  const { user } = useAuth();
  const [tab, setTab] = useState('workshops');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [addingFloor, setAddingFloor] = useState(false);
  const [buildingFloors, setBuildingFloors] = useState([]);
  const [newBuildingFloorName, setNewBuildingFloorName] = useState('');
  const [addingBuildingFloor, setAddingBuildingFloor] = useState(false);
  const [newCuttingTypeName, setNewCuttingTypeName] = useState('');
  const [addingCuttingType, setAddingCuttingType] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [newOperation, setNewOperation] = useState({ name: '', norm_minutes: '', category: 'SEWING', default_floor_id: '', locked_to_floor: false });
  const [addingOperation, setAddingOperation] = useState(false);
  const [deletingOperationId, setDeletingOperationId] = useState(null);
  const [deletingFloorId, setDeletingFloorId] = useState(null);
  const [deletingBuildingFloorId, setDeletingBuildingFloorId] = useState(null);
  const [deletingClientId, setDeletingClientId] = useState(null);
  const [newWorkshopName, setNewWorkshopName] = useState('');
  const [newWorkshopFloorsCount, setNewWorkshopFloorsCount] = useState('1');
  const [addingWorkshop, setAddingWorkshop] = useState(false);
  const [deletingWorkshopId, setDeletingWorkshopId] = useState(null);

  const emptySupplierForm = () => ({
    id: null,
    name: '',
    contact: '',
    phone: '',
    address: '',
    note: '',
  });
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [deletingSupplierId, setDeletingSupplierId] = useState(null);
  const excelImportRef = useRef(null);

  const load = async () => {
    if (MODEL_REF_TAB_IDS.has(tab)) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let res = [];
      if (tab === 'floors') res = await api.references.floors();
      else if (tab === 'building-floors') res = await api.references.buildingFloors();
      else if (tab === 'cutting-types') res = await api.references.cuttingTypes(user?.role && ['admin', 'manager'].includes(user.role));
      else if (tab === 'clients') res = await api.references.clients();
      else if (tab === 'operations') res = await api.references.operations();
      else if (tab === 'order-status') res = await api.references.orderStatus();
      else if (tab === 'suppliers') res = await api.references.suppliers();
      else if (tab === 'workshops') res = await api.workshops.list(!!['admin', 'manager'].includes(user?.role));
      setData(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  // Автообновление при возврате в приложение — новые клиенты/заказы от админа появятся на всех устройствах
  useRefreshOnVisible(load);

  useEffect(() => {
    if (tab === 'operations') {
      let cancelled = false;
      api.references
        .buildingFloors()
        .then((rows) => {
          if (!cancelled) setBuildingFloors(rows);
        })
        .catch(() => {
          if (!cancelled) setBuildingFloors([]);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [tab]);

  const handleAddFloor = async (e) => {
    e.preventDefault();
    const name = newFloorName.trim();
    if (!name) return;
    setAddingFloor(true);
    try {
      await api.references.addFloor(name);
      setNewFloorName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingFloor(false);
    }
  };

  const handleAddCuttingType = async (e) => {
    e.preventDefault();
    const name = newCuttingTypeName.trim();
    if (!name) return;
    setAddingCuttingType(true);
    try {
      await api.references.addCuttingType(name);
      setNewCuttingTypeName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingCuttingType(false);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    const name = newClientName.trim();
    if (!name) return;
    setAddingClient(true);
    try {
      await api.references.addClient(name);
      setNewClientName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingClient(false);
    }
  };

  const handleAddOperation = async (e) => {
    e.preventDefault();
    const name = newOperation.name.trim();
    if (!name) {
      alert('Укажите название операции');
      return;
    }
    const norm = parseFloat(newOperation.norm_minutes);
    if (isNaN(norm) || norm < 0) {
      alert('Укажите норму времени (минуты, число ≥ 0)');
      return;
    }
    setAddingOperation(true);
    try {
      await api.references.addOperation({
        name,
        norm_minutes: norm,
        category: newOperation.category || 'SEWING',
        default_floor_id: newOperation.default_floor_id || null,
        locked_to_floor: newOperation.locked_to_floor,
      });
      setNewOperation({ name: '', norm_minutes: '', category: 'SEWING', default_floor_id: '', locked_to_floor: false });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingOperation(false);
    }
  };

  const handleDeleteFloor = async (id) => {
    if (!window.confirm('Удалить цех пошива?')) return;
    setDeletingFloorId(id);
    try {
      await api.references.deleteFloor(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingFloorId(null);
    }
  };

  const handleDeleteBuildingFloor = async (id) => {
    if (!window.confirm('Удалить этаж?')) return;
    setDeletingBuildingFloorId(id);
    try {
      await api.references.deleteBuildingFloor(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingBuildingFloorId(null);
    }
  };

  const handleAddWorkshop = async (e) => {
    e.preventDefault();
    const name = newWorkshopName.trim();
    if (!name) return;
    setAddingWorkshop(true);
    try {
      await api.workshops.add({
        name,
        floors_count: parseInt(newWorkshopFloorsCount, 10) || 1,
      });
      setNewWorkshopName('');
      setNewWorkshopFloorsCount('1');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingWorkshop(false);
    }
  };

  const handleDeleteWorkshop = async (id) => {
    if (!window.confirm('Удалить (деактивировать) цех?')) return;
    setDeletingWorkshopId(id);
    try {
      await api.workshops.delete(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingWorkshopId(null);
    }
  };

  const handleDeleteClient = async (id) => {
    if (!window.confirm('Удалить клиента?')) return;
    setDeletingClientId(id);
    try {
      await api.references.deleteClient(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingClientId(null);
    }
  };

  const handleDeleteOperation = async (id) => {
    if (!window.confirm('Удалить операцию?')) return;
    setDeletingOperationId(id);
    try {
      await api.references.deleteOperation(id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingOperationId(null);
    }
  };

  const handleSupplierSave = async (e) => {
    e.preventDefault();
    const name = supplierForm.name.trim();
    if (!name) {
      alert('Укажите название');
      return;
    }
    setSavingSupplier(true);
    try {
      const payload = {
        name,
        contact: supplierForm.contact.trim() || null,
        phone: supplierForm.phone.trim() || null,
        address: supplierForm.address.trim() || null,
        note: supplierForm.note.trim() || null,
      };
      if (supplierForm.id) {
        await api.references.updateSupplier(supplierForm.id, payload);
      } else {
        await api.references.addSupplier(payload);
      }
      setSupplierForm(emptySupplierForm());
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('Удалить поставщика?')) return;
    setDeletingSupplierId(id);
    try {
      await api.references.deleteSupplier(id);
      if (supplierForm.id === id) setSupplierForm(emptySupplierForm());
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingSupplierId(null);
    }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        for (const row of rows) {
          const name = row.name || row['Название'] || row['Поставщик'];
          if (!name) continue;
          await api.references.addSupplier({
            name: String(name).trim(),
            contact: row.contact || row['Контакт'] || '',
            phone: row.phone || row['Телефон'] || '',
            address: row.address || row['Адрес'] || '',
            note: row.note || row['Примечание'] || '',
          });
        }
        load();
        alert('Импорт завершён');
      } catch (err) {
        alert(`Ошибка импорта: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleAddBuildingFloor = async (e) => {
    e.preventDefault();
    const name = newBuildingFloorName.trim();
    if (!name) return;
    setAddingBuildingFloor(true);
    try {
      await api.references.addBuildingFloor(name);
      setNewBuildingFloorName('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingBuildingFloor(false);
    }
  };

  const formatRowValue = (k, v, row) => {
    if (v == null) return '—';
    if (typeof v !== 'object') return String(v);
    if (k === 'User' && v?.name) return v.name;
    if (k === 'Floor' && v?.name) return v.name;
    if (k === 'BuildingFloor' && v?.name) return v.name;
    return String(v?.name ?? v?.id ?? '—');
  };

  const getTableColumns = () => {
    if (tab === 'workshops' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        { key: 'floors_count', label: 'Этажей' },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteWorkshop(row.id)}
                disabled={deletingWorkshopId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingWorkshopId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    if (tab === 'floors' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteFloor(row.id)}
                disabled={deletingFloorId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingFloorId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    if (tab === 'building-floors' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteBuildingFloor(row.id)}
                disabled={deletingBuildingFloorId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingBuildingFloorId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    if (tab === 'clients' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteClient(row.id)}
                disabled={deletingClientId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingClientId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    if (tab === 'cutting-types' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        { key: 'is_active', label: 'Активен', getValue: (row) => (row.is_active ? 'Да' : 'Нет') },
      ];
    }
    if (tab === 'operations' && data.length > 0) {
      return [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Название' },
        { key: 'norm_minutes', label: 'Норма (мин)' },
        { key: 'category', label: 'Категория', getValue: (row) => ({ CUTTING: 'Раскрой', SEWING: 'Пошив', FINISH: 'Финиш' }[row.category] || row.category) },
        { key: 'BuildingFloor', label: 'Этаж по умолчанию' },
        { key: 'locked_to_floor', label: 'Привязан к этажу', getValue: (row) => (row.locked_to_floor ? 'Да' : 'Нет') },
        {
          key: '_actions',
          label: '',
          getValue: (row) =>
            ['admin', 'manager'].includes(user?.role) ? (
              <button
                type="button"
                onClick={() => handleDeleteOperation(row.id)}
                disabled={deletingOperationId === row.id}
                className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
              >
                {deletingOperationId === row.id ? '...' : 'Удалить'}
              </button>
            ) : null,
        },
      ];
    }
    return null;
  };

  const cols = getTableColumns();

  const tabs = [
    { id: 'workshops', label: 'Цеха' },
    { id: 'floors', label: 'Цехи пошива' },
    { id: 'building-floors', label: 'Этажи' },
    { id: 'cutting-types', label: 'Типы раскроя' },
    { id: 'clients', label: 'Клиенты' },
    { id: 'suppliers', label: 'Поставщики' },
    { id: 'operations', label: 'Операции' },
    { id: 'order-status', label: 'Статусы заказов' },
    { id: 'fabric-names', label: 'Ткани' },
    { id: 'fabric-units', label: 'Ед. измерения' },
    { id: 'fittings-names', label: 'Фурнитура' },
    { id: 'cutting-ops', label: 'Операции раскроя' },
    { id: 'sewing-ops', label: 'Операции пошива' },
    { id: 'otk-ops', label: 'Операции ОТК' },
  ];

  const modelRefsCanMutate = ['admin', 'manager', 'technologist'].includes(user?.role);

  return (
    <div>
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-neon-text">Справочники</h1>
        <div className="flex items-center gap-2">
          <PrintButton />
          <NeonButton
          type="button"
          onClick={() => load()}
          disabled={loading}
          variant="secondary"
          className="p-2"
          title="Обновить"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </NeonButton>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <Chip
            key={t.id}
            onClick={() => setTab(t.id)}
            active={tab === t.id}
            className="px-4 py-2"
          >
            {t.label}
          </Chip>
        ))}
      </div>

      {tab === 'workshops' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddWorkshop} className="mb-4 flex flex-col md:flex-row gap-2 flex-wrap md:items-end">
          <NeonInput
            type="text"
            value={newWorkshopName}
            onChange={(e) => setNewWorkshopName(e.target.value)}
            placeholder="Название цеха (например: Цех №2)"
            className="min-w-[200px]"
          />
          <NeonSelect
            value={newWorkshopFloorsCount}
            onChange={(e) => setNewWorkshopFloorsCount(e.target.value)}
            className="min-w-[120px]"
          >
            <option value="1">1 этаж</option>
            <option value="2">2 этажа</option>
            <option value="3">3 этажа</option>
            <option value="4">4 этажа</option>
            <option value="5">5 этажей</option>
          </NeonSelect>
          <NeonButton
            type="submit"
            disabled={addingWorkshop || !newWorkshopName.trim()}
          >
            {addingWorkshop ? 'Добавление...' : 'Добавить'}
          </NeonButton>
        </form>
      )}
      {tab === 'floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddFloor} className="mb-4 flex flex-col sm:flex-row gap-2">
          <NeonInput
            type="text"
            value={newFloorName}
            onChange={(e) => setNewFloorName(e.target.value)}
            placeholder="Добавить цех пошива (например: Цех №1)"
            className="min-w-[200px]"
          />
          <NeonButton
            type="submit"
            disabled={addingFloor || !newFloorName.trim()}
          >
            {addingFloor ? 'Добавление...' : 'Добавить'}
          </NeonButton>
        </form>
      )}
      {tab === 'building-floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={async (e) => { e.preventDefault(); const n = newBuildingFloorName.trim(); if (!n) return; setAddingBuildingFloor(true); try { await api.references.addBuildingFloor(n); setNewBuildingFloorName(''); load(); } catch (err) { alert(err.message); } finally { setAddingBuildingFloor(false); } }} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newBuildingFloorName}
            onChange={(e) => setNewBuildingFloorName(e.target.value)}
            placeholder="Добавить этаж (например: Этаж 1)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button type="submit" disabled={addingBuildingFloor || !newBuildingFloorName.trim()} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {addingBuildingFloor ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'clients' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddClient} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Добавить клиента (например: ООО Ромашка)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingClient || !newClientName.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingClient ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'cutting-types' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddCuttingType} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newCuttingTypeName}
            onChange={(e) => setNewCuttingTypeName(e.target.value)}
            placeholder="Добавить тип раскроя (например: Цех №3)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingCuttingType || !newCuttingTypeName.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingCuttingType ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'building-floors' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddBuildingFloor} className="mb-4 flex gap-2">
          <input
            type="text"
            value={newBuildingFloorName}
            onChange={(e) => setNewBuildingFloorName(e.target.value)}
            placeholder="Добавить этаж (например: Этаж 1)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[200px]"
          />
          <button type="submit" disabled={addingBuildingFloor || !newBuildingFloorName.trim()} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {addingBuildingFloor ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}
      {tab === 'suppliers' && ['admin', 'manager'].includes(user?.role) && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setSupplierForm(emptySupplierForm())}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              + Добавить поставщика
            </button>
            <button
              type="button"
              onClick={() => excelImportRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC] dark:text-dark-text hover:bg-accent-2"
            >
              📥 Импорт Excel
            </button>
            <input
              ref={excelImportRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcelImport}
            />
          </div>
          <form onSubmit={handleSupplierSave} className="flex flex-col gap-2 rounded-lg border border-white/20 p-4">
            <div className="text-sm font-medium text-[#ECECEC] dark:text-dark-text">
              {supplierForm.id ? `Редактирование #${supplierForm.id}` : 'Новый поставщик'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Название *"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
              <input
                type="text"
                value={supplierForm.contact}
                onChange={(e) => setSupplierForm((p) => ({ ...p, contact: e.target.value }))}
                placeholder="Контакт (ФИО)"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
              <input
                type="text"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Телефон"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
              <input
                type="text"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Адрес"
                className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
              <input
                type="text"
                value={supplierForm.note}
                onChange={(e) => setSupplierForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="Примечание"
                className="md:col-span-2 px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingSupplier || !supplierForm.name.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {savingSupplier ? 'Сохранение...' : supplierForm.id ? 'Сохранить изменения' : 'Сохранить'}
              </button>
              {supplierForm.id ? (
                <button
                  type="button"
                  onClick={() => setSupplierForm(emptySupplierForm())}
                  className="px-4 py-2 rounded-lg bg-slate-600 text-white"
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}
      {tab === 'operations' && ['admin', 'manager'].includes(user?.role) && (
        <form onSubmit={handleAddOperation} className="mb-4 flex flex-wrap gap-2 items-end">
          <input
            type="text"
            value={newOperation.name}
            onChange={(e) => setNewOperation({ ...newOperation, name: e.target.value })}
            placeholder="Название операции"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[180px]"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={newOperation.norm_minutes}
            onChange={(e) => setNewOperation({ ...newOperation, norm_minutes: e.target.value })}
            placeholder="Норма (мин)"
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[100px]"
          />
          <select
            value={newOperation.category}
            onChange={(e) => setNewOperation({ ...newOperation, category: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="CUTTING">Раскрой</option>
            <option value="SEWING">Пошив</option>
            <option value="FINISH">Финиш</option>
          </select>
          <select
            value={newOperation.default_floor_id}
            onChange={(e) => setNewOperation({ ...newOperation, default_floor_id: e.target.value })}
            className="px-4 py-2 rounded-lg bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text min-w-[140px]"
          >
            <option value="">Этаж по умолчанию</option>
            {buildingFloors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[#ECECEC] dark:text-dark-text cursor-pointer">
            <input
              type="checkbox"
              checked={newOperation.locked_to_floor}
              onChange={(e) => setNewOperation({ ...newOperation, locked_to_floor: e.target.checked })}
              className="rounded"
            />
            Привязан к этажу
          </label>
          <button
            type="submit"
            disabled={addingOperation || !newOperation.name?.trim() || newOperation.norm_minutes === ''}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {addingOperation ? 'Добавление...' : 'Добавить'}
          </button>
        </form>
      )}

      {tab === 'suppliers' ? (
        <NeonCard className="overflow-hidden p-0">
          {loading ? (
            <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
          ) : Array.isArray(data) ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20 dark:border-white/20">
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">№</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Название</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Контакт</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Телефон</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Адрес</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">Примечание</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">✏️</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">🗑</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-[#ECECEC]/80 dark:text-dark-text/80">
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr key={row.id} className="border-b border-white/15 dark:border-white/15">
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{idx + 1}</td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{row.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{row.contact ?? '—'}</td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{row.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{row.address ?? '—'}</td>
                      <td className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">{row.note ?? '—'}</td>
                      <td className="px-4 py-3">
                        {['admin', 'manager'].includes(user?.role) ? (
                          <button
                            type="button"
                            title="Редактировать"
                            onClick={() =>
                              setSupplierForm({
                                id: row.id,
                                name: row.name || '',
                                contact: row.contact || '',
                                phone: row.phone || '',
                                address: row.address || '',
                                note: row.note || '',
                              })
                            }
                            className="px-2 py-1 text-sm rounded bg-slate-600/90 hover:bg-slate-600 text-white"
                          >
                            ✏️
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {['admin', 'manager'].includes(user?.role) ? (
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => handleDeleteSupplier(row.id)}
                            disabled={deletingSupplierId === row.id}
                            className="px-2 py-1 text-sm rounded bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50"
                          >
                            {deletingSupplierId === row.id ? '...' : '🗑'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
          )}
        </NeonCard>
      ) : MODEL_REF_SECTIONS[tab] ? (
        <NeonCard className="overflow-hidden p-4 md:p-6">
          <RefSection
            title={MODEL_REF_SECTIONS[tab].title}
            endpoint={MODEL_REF_SECTIONS[tab].endpoint}
            canMutate={modelRefsCanMutate}
            excelMode={MODEL_REF_SECTIONS[tab].excelMode}
            templateFileName={MODEL_REF_SECTIONS[tab].templateFileName}
          />
        </NeonCard>
      ) : (
        <NeonCard className="overflow-hidden p-0">
          {loading ? (
            <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
          ) : Array.isArray(data) && data.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20 dark:border-white/20">
                  {cols ? cols.map((c) => (
                    <th key={c.key} className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                      {c.label}
                    </th>
                  )) : Object.keys(data[0]).filter((k) => !k.includes('_at')).map((k) => (
                    <th key={k} className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b border-white/15 dark:border-white/15">
                    {cols ? cols.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                        {c.getValue ? c.getValue(row) : formatRowValue(c.key, row[c.key], row)}
                      </td>
                    )) : Object.entries(row)
                      .filter(([k]) => !k.includes('_at'))
                      .map(([k, v]) => (
                        <td key={k} className="px-4 py-3 text-[#ECECEC]/90 dark:text-dark-text/80">
                          {formatRowValue(k, v, row)}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
          )}
        </NeonCard>
      )}
    </div>
  );
}
