/**
 * Блоки «Ткань / Фурнитура / операции» на создании заказа (стиль как База моделей).
 */

import { useState } from 'react';

function newRowId() {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyFabricRow() {
  return { id: newRowId(), name: '', unit: '', qtyPerUnit: '' };
}

export function emptyOpsRow() {
  return { id: newRowId(), name: '', normMinutes: '', rateSom: '' };
}

/** Из fabric_data / fittings_data models_base → строки заказа */
export function flattenFabricLike(modelJson) {
  const data = modelJson && typeof modelJson === 'object' ? modelJson : {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const rows = [];
  for (const g of groups) {
    for (const r of g.rows || []) {
      rows.push({
        id: newRowId(),
        name: r.name != null ? String(r.name) : '',
        unit: r.unit != null ? String(r.unit) : '',
        qtyPerUnit: r.qty != null ? String(r.qty) : '',
      });
    }
  }
  return rows;
}

/** Из cutting_ops / sewing_ops / otk_ops models_base → строки заказа */
export function flattenOpsLike(modelJson) {
  const data = modelJson && typeof modelJson === 'object' ? modelJson : {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const rows = [];
  for (const g of groups) {
    for (const r of g.rows || []) {
      const note = r.note != null ? String(r.note).trim() : '';
      const cost = r.cost != null ? String(r.cost).trim() : '';
      const normGuess =
        note && /^[\d.,]+\s*$/.test(note.replace(',', '.')) ? note.replace(',', '.') : '';
      rows.push({
        id: newRowId(),
        name: r.name != null ? String(r.name) : '',
        normMinutes: normGuess,
        rateSom: cost,
      });
    }
  }
  return rows;
}

const tableShell = 'overflow-x-auto rounded border border-[#2a2a2a]';
const thStyle = { color: '#aaa', fontSize: 12 };
const tdInput =
  'w-full min-w-0 px-2 py-1.5 rounded bg-[#1a1a1a] border border-[#333] text-[#ECECEC] text-sm';

function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left font-semibold text-white bg-[#1e3a5f] border border-[#2a2a2a] rounded-t-lg border-b-0"
    >
      <span>{title}</span>
      <span className="text-lg leading-none text-white/90" aria-hidden>
        {open ? '▾' : '▸'}
      </span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {number} props.totalQty — общее кол-во изделий (для «Итого»)
 */
export default function CreateOrderModelSections({
  totalQty,
  fabric,
  setFabric,
  accessories,
  setAccessories,
  cuttingOps,
  setCuttingOps,
  sewingOps,
  setSewingOps,
  otkOps,
  setOtkOps,
}) {
  const [open, setOpen] = useState({
    fabric: true,
    accessories: true,
    cutting: true,
    sewing: true,
    otk: true,
  });

  const fmtTotal = (qtyPerUnitStr) => {
    const q = parseFloat(String(qtyPerUnitStr || '').replace(',', '.')) || 0;
    const t = q * (Number.isFinite(totalQty) ? totalQty : 0);
    if (!Number.isFinite(t)) return '—';
    return Number.isInteger(t) ? String(t) : t.toFixed(2).replace(/\.?0+$/, '');
  };

  const addFabricRow = (setter) => setter((prev) => [...prev, emptyFabricRow()]);
  const addOpsRow = (setter) => setter((prev) => [...prev, emptyOpsRow()]);
  const removeAt = (setter, id) => setter((prev) => prev.filter((r) => r.id !== id));
  const patchFabric = (setter, id, field, value) =>
    setter((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  const patchOps = (setter, id, field, value) =>
    setter((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );

  const btnAdd =
    'text-sm px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50';

  const fabricTable = (rows, setRows) => (
    <div className={tableShell}>
      <table className="w-full border-collapse text-sm min-w-[520px]">
        <thead>
          <tr style={{ background: '#2a2a2a' }}>
            <th className="px-2 py-2 border border-[#333] text-center w-10" style={thStyle}>
              №
            </th>
            <th className="px-3 py-2 text-left border border-[#333]" style={thStyle}>
              Наименование
            </th>
            <th className="px-3 py-2 text-left border border-[#333] w-24" style={thStyle}>
              Ед.изм
            </th>
            <th className="px-3 py-2 text-left border border-[#333] w-28" style={thStyle}>
              Кол-во на ед.
            </th>
            <th className="px-3 py-2 text-left border border-[#333] w-28" style={thStyle}>
              Итого (авто)
            </th>
            <th className="px-2 py-2 border border-[#333] w-12 text-center" style={thStyle}>
              {' '}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
              <td className="px-2 py-2 align-middle border border-[#333] text-center text-[#888]">
                {i + 1}
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => patchFabric(setRows, row.id, 'name', e.target.value)}
                  className={tdInput}
                  placeholder="—"
                />
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => patchFabric(setRows, row.id, 'unit', e.target.value)}
                  className={tdInput}
                  placeholder="—"
                />
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.qtyPerUnit}
                  onChange={(e) => patchFabric(setRows, row.id, 'qtyPerUnit', e.target.value)}
                  className={tdInput}
                  placeholder="0"
                />
              </td>
              <td className="px-2 py-2 align-middle border border-[#333] text-[#ECECEC]">
                {fmtTotal(row.qtyPerUnit)}
              </td>
              <td className="px-2 py-2 align-middle text-center border border-[#333]">
                <button
                  type="button"
                  onClick={() => removeAt(setRows, row.id)}
                  className="text-red-500 hover:text-red-400 text-base bg-transparent border-0 cursor-pointer p-1"
                  title="Удалить строку"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 bg-[#141414] border border-t-0 border-[#2a2a2a] rounded-b-lg">
        <button type="button" className={btnAdd} onClick={() => addFabricRow(setRows)}>
          + Добавить строку
        </button>
      </div>
    </div>
  );

  const opsTable = (rows, setRows) => (
    <div className={tableShell}>
      <table className="w-full border-collapse text-sm min-w-[520px]">
        <thead>
          <tr style={{ background: '#2a2a2a' }}>
            <th className="px-2 py-2 border border-[#333] text-center w-10" style={thStyle}>
              №
            </th>
            <th className="px-3 py-2 text-left border border-[#333]" style={thStyle}>
              Наименование операции
            </th>
            <th className="px-3 py-2 text-left border border-[#333] w-32" style={thStyle}>
              Норма времени (мин)
            </th>
            <th className="px-3 py-2 text-left border border-[#333] w-32" style={thStyle}>
              Расценка (сом)
            </th>
            <th className="px-2 py-2 border border-[#333] w-12 text-center" style={thStyle}>
              {' '}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
              <td className="px-2 py-2 align-middle border border-[#333] text-center text-[#888]">
                {i + 1}
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => patchOps(setRows, row.id, 'name', e.target.value)}
                  className={tdInput}
                  placeholder="—"
                />
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.normMinutes}
                  onChange={(e) => patchOps(setRows, row.id, 'normMinutes', e.target.value)}
                  className={tdInput}
                  placeholder="0"
                />
              </td>
              <td className="px-2 py-2 align-top border border-[#333]">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.rateSom}
                  onChange={(e) => patchOps(setRows, row.id, 'rateSom', e.target.value)}
                  className={tdInput}
                  placeholder="0"
                />
              </td>
              <td className="px-2 py-2 align-middle text-center border border-[#333]">
                <button
                  type="button"
                  onClick={() => removeAt(setRows, row.id)}
                  className="text-red-500 hover:text-red-400 text-base bg-transparent border-0 cursor-pointer p-1"
                  title="Удалить строку"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 bg-[#141414] border border-t-0 border-[#2a2a2a] rounded-b-lg">
        <button type="button" className={btnAdd} onClick={() => addOpsRow(setRows)}>
          + Добавить операцию
        </button>
      </div>
    </div>
  );

  const block = (key, title, tableEl) => (
    <div className="mb-4">
      <SectionHeader
        title={title}
        open={open[key]}
        onToggle={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
      />
      {open[key] ? <div className="border border-[#2a2a2a] border-t-0 rounded-b-lg overflow-hidden">{tableEl}</div> : null}
    </div>
  );

  return (
    <div className="pt-2 mt-2">
      <h2 className="text-lg font-semibold text-[#ECECEC] dark:text-dark-text mb-4">
        Ткань, фурнитура и операции
      </h2>
      <p className="text-xs text-[#ECECEC]/70 mb-4">
        Итого по ткани/фурнитуре: кол-во на ед. × общее количество изделий ({totalQty || 0}). Подставить строки
        можно кнопкой «Загрузить из базы моделей» (под полями ТЗ и названия модели).
      </p>
      {block('fabric', 'Ткань', fabricTable(fabric, setFabric))}
      {block('accessories', 'Фурнитура', fabricTable(accessories, setAccessories))}
      {block('cutting', 'Раскрой — операции', opsTable(cuttingOps, setCuttingOps))}
      {block('sewing', 'Пошив — операции', opsTable(sewingOps, setSewingOps))}
      {block('otk', 'ОТК — операции', opsTable(otkOps, setOtkOps))}
    </div>
  );
}
