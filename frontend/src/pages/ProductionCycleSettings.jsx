/**
 * Справочник: настройки опережения производственного цикла.
 * Роут: /settings/production-cycle (admin, manager)
 */

import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { normalizeUserRole } from '../utils/userRole';
import {
  getMonday,
  getWeekSixWorkdays,
  subtractWeeksMonday,
  MONTH_SHORT_RU,
} from '../utils/cycleWeekLabels';

function formatDdMm(iso) {
  if (!iso) return '';
  const [, mm, dd] = iso.split('-');
  return `${dd}.${mm}`;
}

/** Недели месяца как в PlanningDraft.getWeeksInMonth */
function getWeeksInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const weeks = [];
  let mon = getMonday(first);
  let weekNum = 1;
  while (mon <= last) {
    const sun = new Date(`${mon}T12:00:00`);
    sun.setDate(sun.getDate() + 6);
    const dateTo = sun.toISOString().slice(0, 10);
    const dates = getWeekSixWorkdays(mon);
    const inMonth = dates.some((d) => d >= first && d <= last);
    if (inMonth) {
      weeks.push({ weekNum, dateFrom: mon, dateTo });
      weekNum++;
    }
    const next = new Date(`${mon}T12:00:00`);
    next.setDate(next.getDate() + 7);
    mon = next.toISOString().slice(0, 10);
  }
  return weeks;
}

function previewForSewingWeek3(purchaseLead, cuttingLead) {
  const d = new Date();
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const weeks = getWeeksInMonth(monthKey);
  const w = weeks[2];
  if (!w) return { cut: '—', pur: '—' };
  const sewMon = w.dateFrom;
  const cutMon = subtractWeeksMonday(sewMon, cuttingLead);
  const purMon = subtractWeeksMonday(sewMon, purchaseLead);
  const cutDates = getWeekSixWorkdays(cutMon);
  const purDates = getWeekSixWorkdays(purMon);
  const cutLabel = `${formatDdMm(cutDates[0])}–${formatDdMm(cutDates[5])}`;
  const p0 = purDates[0].split('-');
  const p5 = purDates[5].split('-');
  const M0 = MONTH_SHORT_RU[parseInt(p0[1], 10) - 1];
  const M5 = MONTH_SHORT_RU[parseInt(p5[1], 10) - 1];
  const purLabel =
    p0[1] === p5[1]
      ? `${parseInt(p0[2], 10)}–${parseInt(p5[2], 10)} ${M5}`
      : `${parseInt(p0[2], 10)} ${M0} – ${parseInt(p5[2], 10)} ${M5}`;
  return { cut: cutLabel, pur: purLabel };
}

export default function ProductionCycleSettings() {
  const { user } = useAuth();
  const role = normalizeUserRole(user?.role);
  const allowed = ['admin', 'manager'].includes(role);
  const [purchaseLeadWeeks, setPurchaseLeadWeeks] = useState(3);
  const [cuttingLeadWeeks, setCuttingLeadWeeks] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    if (import.meta.env.DEV) console.log('[Settings] загрузка настроек...');
    try {
      const data = await api.settings.productionCycleGet();
      if (import.meta.env.DEV) console.log('[Settings] ответ API:', data);
      if (data && typeof data === 'object') {
        setPurchaseLeadWeeks(
          Math.min(8, Math.max(1, Number(data.purchaseLeadWeeks) || 3))
        );
        setCuttingLeadWeeks(
          Math.min(6, Math.max(1, Number(data.cuttingLeadWeeks) || 2))
        );
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[Settings] ошибка:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) console.log('[Settings] компонент смонтирован');
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && allowed) console.log('[Settings] useEffect: загрузка при монтировании');
    if (allowed) load();
  }, [allowed, load]);

  const bump = (field, delta, min, max) => {
    if (field === 'purchase') {
      setPurchaseLeadWeeks((v) => Math.min(max, Math.max(min, v + delta)));
    } else {
      setCuttingLeadWeeks((v) => Math.min(max, Math.max(min, v + delta)));
    }
  };

  const prev = previewForSewingWeek3(purchaseLeadWeeks, cuttingLeadWeeks);

  const save = async () => {
    setSaving(true);
    setToast('');
    try {
      if (import.meta.env.DEV) {
        console.log('[Settings] сохранение:', { purchaseLeadWeeks, cuttingLeadWeeks });
      }
      const saved = await api.settings.productionCycleSave({
        purchaseLeadWeeks,
        cuttingLeadWeeks,
      });
      if (import.meta.env.DEV) console.log('[Settings] ответ API (save):', saved);
      setToast('Настройки сохранены');
      setTimeout(() => setToast(''), 3500);
    } catch (e) {
      console.error('[Settings] ошибка POST:', e?.status ?? '', e?.message ?? e);
      setToast(e?.message || 'Ошибка сохранения');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  const btnSq =
    'flex h-8 w-8 items-center justify-center rounded border text-sm font-bold transition-colors';
  const btnStyle = {
    background: '#c8ff00',
    borderColor: '#9fcc00',
    color: '#111',
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-bold md:text-2xl" style={{ color: 'var(--text, #ECECEC)' }}>
        Настройки производственного цикла
      </h1>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Загрузка…</p>
      ) : (
        <div
          className="space-y-6 rounded-xl border p-6"
          style={{
            background: 'var(--bg2, #1a1d24)',
            borderColor: 'var(--border, #333)',
          }}
        >
          <div>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text)' }}>
              Закуп опережает производство на:
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bump('purchase', -1, 1, 8)}
                aria-label="Минус"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-lg font-semibold" style={{ color: '#c8ff00' }}>
                {purchaseLeadWeeks}
              </span>
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bump('purchase', 1, 1, 8)}
                aria-label="Плюс"
              >
                +
              </button>
              <span style={{ color: 'var(--muted)' }}>недели</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Минимум: 1, максимум: 8
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text)' }}>
              Раскрой опережает производство на:
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bump('cutting', -1, 1, 6)}
                aria-label="Минус"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-lg font-semibold" style={{ color: '#c8ff00' }}>
                {cuttingLeadWeeks}
              </span>
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bump('cutting', 1, 1, 6)}
                aria-label="Плюс"
              >
                +
              </button>
              <span style={{ color: 'var(--muted)' }}>недели</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Минимум: 1, максимум: 6
            </p>
          </div>

          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Пошив = неделя производства (фиксировано)
          </p>

          <div
            className="rounded-lg border p-4 text-sm"
            style={{ borderColor: 'var(--border)', background: 'rgba(200,255,0,0.06)' }}
          >
            <div className="mb-2 font-medium" style={{ color: '#c8ff00' }}>
              Предпросмотр (если пошив на неделе 3):
            </div>
            <div style={{ color: 'var(--text)' }}>→ Раскрой: неделя 1 ({prev.cut})</div>
            <div style={{ color: 'var(--text)' }}>→ Закуп: {prev.pur}</div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            style={{ background: '#c8ff00' }}
          >
            {saving ? 'Сохранение…' : 'Сохранить настройки'}
          </button>

          {toast ? (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: toast.includes('Ошибка') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                color: toast.includes('Ошибка') ? '#f87171' : '#86efac',
              }}
            >
              {toast}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
