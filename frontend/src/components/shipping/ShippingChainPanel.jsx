/**
 * План цеха — отгрузка (документы по неделям из цепочки).
 */

import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { formatWeekRangeLabel } from '../planChain/PlanChainDocumentCard';

function chainDateIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function orderTzModelLine(order) {
  if (!order) return '—';
  const article = String(order.article || order.tz_code || '').trim();
  const name = String(order.model_name || order.title || '').trim() || '—';
  if (article) return `${article} — ${name}`;
  return name;
}

function firstPhotoSrc(order) {
  const p = order?.photos;
  if (!Array.isArray(p) || !p.length) return null;
  const x = p[0];
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

export default function ShippingChainPanel() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  const loadDocs = useCallback(() => {
    setLoading(true);
    api.shipping
      .documentsList()
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setDocs(arr);
      })
      .catch((err) => {
        console.error('[Отгрузка план]', err);
        setDocs([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const docsByWeek = useMemo(() => {
    const map = new Map();
    for (const d of docs) {
      const plan = chainDateIso(d.week_start);
      const k = plan || '__none';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '__none') return 1;
      if (b === '__none') return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => [k, map.get(k)]);
  }, [docs]);

  const patchDoc = useCallback(async (docId, body, okText) => {
    try {
      const updated = await api.shipping.documentPatch(docId, body);
      setDocs((prev) => prev.map((x) => (Number(x.id) === Number(docId) ? { ...x, ...updated } : x)));
      if (okText) {
        setBanner({ type: 'ok', text: okText });
        window.setTimeout(() => setBanner(null), 3000);
      }
    } catch (e) {
      setBanner({ type: 'err', text: e?.message || 'Ошибка' });
      window.setTimeout(() => setBanner(null), 4000);
    }
  }, []);

  return (
    <div className="mb-10">
      <h2 className="mb-3 text-lg font-semibold" style={{ color: '#c8ff00' }}>
        План цеха — отгрузка
      </h2>
      {banner ? (
        <div
          className={`mb-3 rounded-lg border px-4 py-2 text-sm ${
            banner.type === 'ok'
              ? 'border-green-500/30 bg-green-500/15 text-green-400'
              : 'border-red-500/30 bg-red-500/15 text-red-300'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Загрузка…
        </p>
      ) : docs.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Нет документов отгрузки. Сохраните план цеха в «Планирование месяц» — документы создадутся автоматически.
        </p>
      ) : (
        <div
          className="max-h-[min(65vh,calc(100vh-12rem))] overflow-auto overflow-x-auto rounded-lg border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#1a237e',
              }}
            >
              <tr style={{ color: '#fff' }}>
                {['Фото', 'Модель', 'Клиент', 'Неделя план', 'Факт неделя', 'Статус'].map((label) => (
                  <th
                    key={label}
                    style={{
                      textAlign: label.includes('Неделя') || label.includes('Факт') ? 'center' : 'left',
                      padding: '10px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docsByWeek.map(([weekKey, weekDocs]) => (
                <Fragment key={weekKey}>
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        background: '#1a237e',
                        color: '#fff',
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        marginTop: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Неделя отгрузки: {weekKey === '__none' ? '—' : formatWeekRangeLabel(weekKey)}</span>
                        <span style={{ opacity: 0.85, fontWeight: 400 }}>{weekDocs.length} заказов</span>
                      </div>
                    </td>
                  </tr>
                  {weekDocs.map((doc) => {
                    const o = doc.Order;
                    const photo = firstPhotoSrc(o);
                    const client = o?.Client?.name || '—';
                    const planW = chainDateIso(doc.week_start);
                    const actW = chainDateIso(doc.actual_week_start) || planW;
                    const moved = planW && actW && planW !== actW;
                    return (
                      <tr
                        key={doc.id}
                        style={{
                          borderBottom: '0.5px solid #1a1a1a',
                          background: 'var(--bg2, #1a1d24)',
                        }}
                      >
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          {photo ? (
                            <img
                              src={photo}
                              alt=""
                              width={40}
                              height={40}
                              style={{ objectFit: 'cover', borderRadius: 4 }}
                            />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 4, background: '#222' }} />
                          )}
                          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>#{doc.order_id}</div>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#fff', fontWeight: 600, verticalAlign: 'top' }}>
                          {orderTzModelLine(o)}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#4a9eff', fontWeight: 600, verticalAlign: 'top' }}>
                          {client}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, verticalAlign: 'top' }}>
                          {planW ? formatWeekRangeLabel(planW) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, verticalAlign: 'top' }}>
                          {actW ? formatWeekRangeLabel(actW) : '—'}
                          {moved ? (
                            <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 4 }}>↗ перенесено</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 12px', verticalAlign: 'top' }}>
                          <select
                            value={doc.status || 'pending'}
                            onChange={(e) => patchDoc(doc.id, { status: e.target.value }, 'Сохранено')}
                            style={{
                              background: '#1a1a1a',
                              border: '0.5px solid #333',
                              color: '#fff',
                              padding: '4px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                            }}
                          >
                            <option value="pending">Не начато</option>
                            <option value="in_progress">В процессе</option>
                            <option value="done">Завершено</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
