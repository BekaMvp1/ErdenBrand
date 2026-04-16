/**
 * Справочник: настройки опережения производственного цикла.
 * Роут: /settings/production-cycle (admin, manager)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { normalizeUserRole } from '../utils/userRole';
import {
  getMonday,
  getWeekSixWorkdays,
  subtractWeeksMonday,
  addWeeksMonday,
  MONTH_SHORT_RU,
} from '../utils/cycleWeekLabels';

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

function workweekSpanLabel(mondayIso) {
  if (!mondayIso) return '—';
  const dates = getWeekSixWorkdays(mondayIso);
  if (!dates?.[0] || !dates?.[5]) return '—';
  const p0 = dates[0].split('-');
  const p5 = dates[5].split('-');
  const M0 = MONTH_SHORT_RU[parseInt(p0[1], 10) - 1];
  const M5 = MONTH_SHORT_RU[parseInt(p5[1], 10) - 1];
  if (p0[1] === p5[1]) {
    return `${parseInt(p0[2], 10)}–${parseInt(p5[2], 10)} ${M5}`;
  }
  return `${parseInt(p0[2], 10)} ${M0} – ${parseInt(p5[2], 10)} ${M5}`;
}

const PREVIEW_STAGE_ORDER = { Закуп: 0, Раскрой: 1, Пошив: 2, ОТК: 3, Отгрузка: 4 };

function buildPreviewStageRows(
  monthKey,
  purchaseLead,
  cuttingLead,
  otkLead,
  shippingLead
) {
  const weeks = getWeeksInMonth(monthKey);
  const w = weeks[2];
  if (!w) return [];
  const sewMon = w.dateFrom;
  const sewingW = 3;
  const purMon = subtractWeeksMonday(sewMon, purchaseLead);
  const cutMon = subtractWeeksMonday(sewMon, cuttingLead);
  const otkMon = otkLead > 0 ? addWeeksMonday(sewMon, otkLead) : sewMon;
  const shipMon =
    shippingLead > 0 ? addWeeksMonday(otkMon, shippingLead) : otkMon;
  const items = [
    {
      label: 'Закуп',
      weekNum: sewingW - purchaseLead,
      weeks: purchaseLead,
      mon: purMon,
      sameWeek: false,
    },
    {
      label: 'Раскрой',
      weekNum: sewingW - cuttingLead,
      weeks: cuttingLead,
      mon: cutMon,
      sameWeek: false,
    },
    { label: 'Пошив', weekNum: sewingW, weeks: 1, mon: sewMon, sameWeek: false },
    {
      label: 'ОТК',
      weekNum: otkLead === 0 ? sewingW : sewingW + otkLead,
      weeks: otkLead,
      mon: otkMon,
      sameWeek: otkLead === 0,
    },
    {
      label: 'Отгрузка',
      weekNum:
        shippingLead === 0
          ? otkLead === 0
            ? sewingW
            : sewingW + otkLead
          : sewingW + (otkLead > 0 ? otkLead : 0) + shippingLead,
      weeks: shippingLead,
      mon: shipMon,
      sameWeek: shippingLead === 0,
    },
  ];
  return items.sort(
    (a, b) =>
      a.weekNum - b.weekNum ||
      (PREVIEW_STAGE_ORDER[a.label] ?? 99) - (PREVIEW_STAGE_ORDER[b.label] ?? 99)
  );
}

export default function ProductionCycleSettings() {
  const { user } = useAuth();
  const role = normalizeUserRole(user?.role);
  const allowed = ['admin', 'manager'].includes(role);
  const [purchaseLeadWeeks, setPurchaseLeadWeeks] = useState(3);
  const [cuttingLeadWeeks, setCuttingLeadWeeks] = useState(2);
  const [otkLeadWeeks, setOtkLeadWeeks] = useState(1);
  const [shippingLeadWeeks, setShippingLeadWeeks] = useState(0);
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
        const otkN = Number(data.otkLeadWeeks);
        setOtkLeadWeeks(Math.min(4, Math.max(0, Number.isFinite(otkN) ? otkN : 1)));
        const shipN = Number(data.shippingLeadWeeks);
        setShippingLeadWeeks(Math.min(4, Math.max(0, Number.isFinite(shipN) ? shipN : 0)));
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

  const bumpPurchase = (delta) =>
    setPurchaseLeadWeeks((v) => Math.min(8, Math.max(1, v + delta)));
  const bumpCutting = (delta) =>
    setCuttingLeadWeeks((v) => Math.min(6, Math.max(1, v + delta)));
  const bumpOtk = (delta) =>
    setOtkLeadWeeks((v) => Math.min(4, Math.max(0, v + delta)));
  const bumpShipping = (delta) =>
    setShippingLeadWeeks((v) => Math.min(4, Math.max(0, v + delta)));

  const previewMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const previewRows = useMemo(
    () =>
      buildPreviewStageRows(
        previewMonthKey,
        purchaseLeadWeeks,
        cuttingLeadWeeks,
        otkLeadWeeks,
        shippingLeadWeeks
      ),
    [
      previewMonthKey,
      purchaseLeadWeeks,
      cuttingLeadWeeks,
      otkLeadWeeks,
      shippingLeadWeeks,
    ]
  );

  const save = async () => {
    setSaving(true);
    setToast('');
    try {
      if (import.meta.env.DEV) {
        console.log('[Settings] сохранение:', {
          purchaseLeadWeeks,
          cuttingLeadWeeks,
          otkLeadWeeks,
          shippingLeadWeeks,
        });
      }
      const saved = await api.settings.productionCycleSave({
        purchaseLeadWeeks,
        cuttingLeadWeeks,
        otkLeadWeeks,
        shippingLeadWeeks,
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
                onClick={() => bumpPurchase(-1)}
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
                onClick={() => bumpPurchase(1)}
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
                onClick={() => bumpCutting(-1)}
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
                onClick={() => bumpCutting(1)}
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

          <div>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text)' }}>
              ОТК: через недель после пошива (0 = та же неделя):
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bumpOtk(-1)}
                aria-label="Минус ОТК"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-lg font-semibold" style={{ color: '#c8ff00' }}>
                {otkLeadWeeks}
              </span>
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bumpOtk(1)}
                aria-label="Плюс ОТК"
              >
                +
              </button>
              <span style={{ color: 'var(--muted)' }}>недели</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Минимум: 0, максимум: 4
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text)' }}>
              Отгрузка: через недель после пошива, в сумме с ОТК (0 = неделя ОТК):
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bumpShipping(-1)}
                aria-label="Минус отгрузка"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-lg font-semibold" style={{ color: '#c8ff00' }}>
                {shippingLeadWeeks}
              </span>
              <button
                type="button"
                className={btnSq}
                style={btnStyle}
                onClick={() => bumpShipping(1)}
                aria-label="Плюс отгрузка"
              >
                +
              </button>
              <span style={{ color: 'var(--muted)' }}>недели</span>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Минимум: 0, максимум: 4
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
            {previewRows.length === 0 ? (
              <div style={{ color: 'var(--muted)' }}>—</div>
            ) : (
              previewRows.map((item) => (
                <div key={item.label} className="mb-1 last:mb-0" style={{ color: 'var(--text)' }}>
                  → {item.label}: неделя {item.weekNum} ({workweekSpanLabel(item.mon)})
                  {item.sameWeek ? ' (та же неделя)' : ''}
                </div>
              ))
            )}
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
