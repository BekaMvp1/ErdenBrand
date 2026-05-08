import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return `${Math.round(toNum(v)).toLocaleString('ru-RU')} сом`;
}

export default function WarehouseMovements() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docs, setDocs] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api.warehouse.movementDocs({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        move_type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setDocs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e?.message || 'Ошибка загрузки документов');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [dateFrom, dateTo, typeFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Перемещение товаров</h1>
        <Link to="/warehouse/movements/new" className="rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500">+ Создать документ</Link>
      </div>

      {error ? <div className="mb-3 rounded bg-red-500/20 p-2 text-sm text-red-300">{error}</div> : null}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input type="date" className="rounded bg-black/30 px-2 py-2" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="rounded bg-black/30 px-2 py-2" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select className="rounded bg-black/30 px-2 py-2" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Все типы</option><option value="goods">Товар</option><option value="materials">Материал</option><option value="wip">НЗП</option>
          </select>
          <select className="rounded bg-black/30 px-2 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все статусы</option><option value="draft">Черновик</option><option value="posted">Проведен</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded border border-white/10">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-white/5"><tr><th className="px-2 py-2">№</th><th>Дата</th><th>Тип</th><th>Откуда → Куда</th><th>Позиций</th><th>Сумма</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="p-3 text-center">Загрузка...</td></tr> : null}
              {!loading && docs.map((d, i) => (
                <tr key={d.id} className="border-t border-white/10">
                  <td className="px-2 py-2 text-center">{d.doc_number || i + 1}</td>
                  <td className="px-2 py-2">{d.doc_date || '—'}</td>
                  <td className="px-2 py-2">{d.move_type === 'goods' ? 'Товар' : d.move_type === 'materials' ? 'Материал' : 'НЗП'}</td>
                  <td className="px-2 py-2">{`${d.FromWarehouse?.name || '—'} → ${d.ToWarehouse?.name || '—'}`}</td>
                  <td className="px-2 py-2">{toNum(d.items_count)}</td>
                  <td className="px-2 py-2">{money(d.total_sum)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-1 text-xs ${d.status === 'posted' ? 'bg-green-600/30 text-green-300' : 'bg-slate-500/30 text-slate-200'}`}>
                      {d.status === 'posted' ? 'Проведен' : 'Черновик'}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => navigate(`/warehouse/movements/${d.id}`)}>
                        {d.status === 'posted' ? 'Открыть' : 'Изменить'}
                      </button>
                      {d.status !== 'posted' ? (
                        <button
                          className="rounded bg-green-700 px-2 py-1 text-xs"
                          onClick={async () => {
                            try {
                              await api.warehouse.movementDocPost(d.id);
                              await loadAll();
                            } catch (e) {
                              setError(e?.message || 'Ошибка проведения');
                            }
                          }}
                        >
                          Провести
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
