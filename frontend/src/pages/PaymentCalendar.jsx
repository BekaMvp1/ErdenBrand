/**
 * Платёжный календарь по неделям (2026)
 */

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  clampPaymentCalendarStartWeek,
  generateWeeks2026,
  getCurrentCalendarWeek,
  getInitialPaymentCalendarStartWeek,
} from '../utils/paymentCalendarWeeks';

const SECTIONS = [
  {
    title: 'ПОСТУПЛЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ',
    color: '#16a34a',
    bg: '#0d2a0d',
    rows: [
      { key: 'income_wb', label: 'План к перечислению ВБ' },
      { key: 'income_loan', label: 'Получение займа' },
      { key: 'income_clients', label: 'План поступление заказчики' },
      { key: 'income_msk', label: 'План поступление МСК' },
      { key: 'income_early', label: 'Досрочный вывод по кнопке' },
      { key: 'income_other', label: 'Другие поступления' },
    ],
    canAdd: true,
    totalLabel: 'Итого поступления',
  },
  {
    title: 'ПОСТАВЩИКИ МАТЕРИАЛА',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [
      { key: 'supplier_madina', label: 'Мадина фурнитура' },
      { key: 'supplier_fabric', label: 'Ткань дордой' },
    ],
    canAdd: true,
    isSubSection: true,
    planReadonly: true,
  },
  {
    title: 'ОТДЕЛ РАСКРОЯ',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'dept_cutting', label: 'ЗП раскройного отдела' }],
    canAdd: true,
    isSubSection: true,
    planReadonly: true,
  },
  {
    title: 'ОТДЕЛ ПОШИВА',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'dept_sewing', label: 'ЗП пошивного отдела' }],
    canAdd: true,
    isSubSection: true,
    planReadonly: true,
  },
  {
    title: 'ОТК',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'dept_otk', label: 'ЗП отдела ОТК' }],
    canAdd: true,
    isSubSection: true,
    planReadonly: true,
  },
  {
    title: 'КРЕДИТЫ',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'credit_ayil', label: 'Айыл банк' }],
    canAdd: true,
    isSubSection: true,
  },
  {
    title: 'МАРКЕТИНГ РАСХОДЫ',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'marketing_telegram', label: 'Реклама телеграмм' }],
    canAdd: true,
    isSubSection: true,
  },
  {
    title: 'ОПЕРАЦИОННЫЕ РАСХОДЫ',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [{ key: 'ops_rent', label: 'Аренда помещение' }],
    canAdd: true,
    isSubSection: true,
  },
  {
    title: 'ФОТ',
    color: '#dc2626',
    bg: '#2a0d0d',
    rows: [
      { key: 'fot_rop', label: 'РОП ЗП' },
      { key: 'fot_warehouse', label: 'Склад ЗП' },
    ],
    canAdd: true,
    isSubSection: true,
  },
];

const WEEKS_2026 = generateWeeks2026();

/** Разделы: столбец «План» только из «Планирование расходов» */
const READONLY_PLAN_SECTIONS = [
  'ПОСТАВЩИКИ МАТЕРИАЛА',
  'ОТДЕЛ РАСКРОЯ',
  'ОТДЕЛ ПОШИВА',
  'ОТК',
];

const READONLY_PLAN_CATEGORIES = new Set([
  'supplier_madina',
  'supplier_fabric',
  'dept_cutting',
  'dept_sewing',
  'dept_otk',
]);

function isPlanReadonlySection(sectionTitle) {
  const t = String(sectionTitle || '').toUpperCase();
  return READONLY_PLAN_SECTIONS.some((s) => t.includes(s.toUpperCase()));
}

function isPlanReadonlyCategory(category) {
  return READONLY_PLAN_CATEGORIES.has(category);
}

const PLAN_READONLY_TITLE =
  'Автоматически из Планирования расходов. Нажмите для расшифровки по заказам.';

const SECTION_STAGE_MAP = {
  'ПОСТАВЩИКИ МАТЕРИАЛА': 'purchase',
  'ОТДЕЛ РАСКРОЯ': 'cutting',
  'ОТДЕЛ ПОШИВА': 'sewing',
  ОТК: 'otk',
};

const CELL_STYLE = {
  padding: '2px 4px',
  fontSize: 11,
  verticalAlign: 'middle',
  borderBottom: '1px solid #1e2a3a',
  borderRight: '1px solid #1e2a3a',
};

const INPUT_STYLE = {
  width: 65,
  background: '#0a1020',
  color: '#e2e8f0',
  border: '1px solid #374151',
  borderRadius: 3,
  padding: '2px 4px',
  fontSize: 11,
  textAlign: 'right',
};

function cellKey(weekNum, category, sub = '') {
  return `w${weekNum}_${category}_${sub}`;
}

function money(n) {
  return Math.round(n || 0).toLocaleString('ru-RU');
}

export default function PaymentCalendar({ initialWeek, initialYear }) {
  const { user } = useAuth();
  const year = parseInt(initialYear, 10) || 2026;
  const [data, setData] = useState({});
  const [customRows, setCustomRows] = useState({});
  const [startWeek, setStartWeek] = useState(() =>
    getInitialPaymentCalendarStartWeek(initialWeek)
  );
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState(null);
  const [calcPopup, setCalcPopup] = useState(null);
  const [incomeByWeek, setIncomeByWeek] = useState({});
  const [expenseByWeek, setExpenseByWeek] = useState({});
  const saveTimerRef = useRef(null);
  const dataRef = useRef(data);

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const currentWeekNum = useMemo(() => getCurrentCalendarWeek(), []);

  const displayWeeks = useMemo(() => {
    const end = Math.min(52, startWeek + 7);
    return WEEKS_2026.filter((w) => w.number >= startWeek && w.number <= end);
  }, [startWeek]);

  const setStartWeekClamped = useCallback((value) => {
    setStartWeek((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      return clampPaymentCalendarStartWeek(next);
    });
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.paymentCalendar
      .list(year)
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        const mainRowKeys = new Set();

        (rows || []).forEach((row) => {
          const sub = row.subcategory != null ? String(row.subcategory) : '';
          const plan = parseFloat(row.plan || 0);
          const fact = parseFloat(row.fact || 0);
          const key = cellKey(row.week_number, row.category, sub);

          if (!sub.startsWith('order_')) {
            if (sub === '') {
              mainRowKeys.add(cellKey(row.week_number, row.category, ''));
            }
            map[key] = { plan, fact, id: row.id };
          }
        });

        (rows || []).forEach((row) => {
          const sub = row.subcategory != null ? String(row.subcategory) : '';
          if (!sub.startsWith('order_')) return;

          const plan = parseFloat(row.plan || 0);
          const fact = parseFloat(row.fact || 0);
          const baseKey = cellKey(row.week_number, row.category, '');

          map[cellKey(row.week_number, row.category, sub)] = {
            plan,
            fact,
            id: row.id,
          };

          if (!mainRowKeys.has(baseKey)) {
            const cur = map[baseKey] || { plan: 0, fact: 0 };
            map[baseKey] = {
              plan: cur.plan + plan,
              fact: cur.fact + fact,
              id: row.id,
            };
          }
        });

        (rows || []).forEach((row) => {
          const sub = row.subcategory != null ? String(row.subcategory) : '';
          if (!sub.startsWith('income_plan_')) return;

          const plan = parseFloat(row.plan || 0);
          const fact = parseFloat(row.fact || 0);
          const baseKey = cellKey(row.week_number, row.category, '');

          map[cellKey(row.week_number, row.category, sub)] = {
            plan,
            fact,
            id: row.id,
          };

          if (!mainRowKeys.has(baseKey)) {
            const cur = map[baseKey] || { plan: 0, fact: 0 };
            map[baseKey] = {
              plan: cur.plan + plan,
              fact: cur.fact + fact,
              id: row.id,
            };
          }
        });

        (rows || []).forEach((row) => {
          const sub = row.subcategory != null ? String(row.subcategory) : '';
          if (!sub.startsWith('expense_plan_')) return;

          const plan = parseFloat(row.plan || 0);
          const fact = parseFloat(row.fact || 0);
          const baseKey = cellKey(row.week_number, row.category, '');

          map[cellKey(row.week_number, row.category, sub)] = {
            plan,
            fact,
            id: row.id,
          };

          if (!mainRowKeys.has(baseKey)) {
            const cur = map[baseKey] || { plan: 0, fact: 0 };
            map[baseKey] = {
              plan: cur.plan + plan,
              fact: cur.fact + fact,
              id: row.id,
            };
          }
        });

        setData(map);
      })
      .catch((e) => console.warn('[PaymentCalendar load]:', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    api
      .get('/api/income-plans')
      .then((r) => {
        const plans = Array.isArray(r) ? r : r?.data || [];
        const byWeek = {};

        plans.forEach((plan) => {
          const dates = Array.isArray(plan.dates)
            ? plan.dates
            : typeof plan.dates === 'string'
              ? (() => {
                  try {
                    return JSON.parse(plan.dates);
                  } catch {
                    return [];
                  }
                })()
              : [];

          dates.forEach((d) => {
            if (!d.week_number || !d.amount) return;

            const key = `${d.year || year}_${d.week_number}`;

            if (!byWeek[key]) {
              byWeek[key] = {
                week: d.week_number,
                year: d.year || year,
                total: 0,
                items: [],
              };
            }

            byWeek[key].total += parseFloat(d.amount || 0);

            byWeek[key].items.push({
              client: plan.client,
              article: plan.article,
              amount: parseFloat(d.amount || 0),
              date: d.date,
            });
          });
        });

        console.log('[incomeByWeek]', byWeek);
        setIncomeByWeek(byWeek);
      })
      .catch(() => {});
  }, [year]);

  useEffect(() => {
    api
      .get('/api/expense-plans')
      .then((r) => {
        const plans = Array.isArray(r) ? r : r?.data || [];
        const byWeek = {};

        plans.forEach((plan) => {
          if (!plan.week_number || !plan.amount) return;

          const key = `${plan.year || year}_${plan.week_number}`;
          if (!byWeek[key]) {
            byWeek[key] = { total: 0, items: [] };
          }

          const amount = parseFloat(plan.amount || 0);
          byWeek[key].total += amount;
          byWeek[key].items.push({
            article: plan.article,
            supplier: plan.supplier,
            employee: plan.employee,
            amount,
            tz: plan.tz,
          });
        });

        setExpenseByWeek(byWeek);
      })
      .catch(() => {});
  }, [year]);

  useEffect(() => {
    const wn = parseInt(initialWeek, 10);
    if (wn >= 1 && wn <= 52) {
      setStartWeekClamped(getInitialPaymentCalendarStartWeek(wn));
    }
  }, [initialWeek, setStartWeekClamped]);

  const getCell = useCallback(
    (weekNum, category, sub = '') => data[cellKey(weekNum, category, sub)] || { plan: 0, fact: 0 },
    [data]
  );

  const updateCell = useCallback(
    (weekNum, weekStart, weekEnd, category, sub, field, value, planReadonly = false) => {
      if (!canEdit) return;
      if (field === 'plan' && (planReadonly || isPlanReadonlyCategory(category))) return;
      const key = cellKey(weekNum, category, sub);
      const current = dataRef.current[key] || { plan: 0, fact: 0 };
      const num = parseFloat(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
      const updated = { ...current, [field]: num };
      setData((prev) => {
        const next = { ...prev, [key]: updated };
        dataRef.current = next;
        return next;
      });

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const latest = dataRef.current[key] || updated;
          await api.paymentCalendar.saveCell({
            year,
            week_number: weekNum,
            week_start: weekStart,
            week_end: weekEnd,
            category,
            subcategory: sub,
            plan: latest.plan,
            fact: latest.fact,
          });
        } catch (e) {
          console.error('[PaymentCalendar save]:', e?.message || e);
        }
      }, 800);
    },
    [canEdit, year]
  );

  const getTotalIncome = useCallback(
    (weekNum) => {
      let sum = 0;
      for (const row of SECTIONS[0].rows) {
        sum += getCell(weekNum, row.key).plan;
      }
      for (const label of customRows[SECTIONS[0].title] || []) {
        sum += getCell(weekNum, `custom_${label}`).plan;
      }
      return sum;
    },
    [getCell, customRows]
  );

  const getTotalPayments = useCallback(
    (weekNum) => {
      let total = 0;
      for (const section of SECTIONS.slice(1)) {
        for (const row of section.rows) {
          total += getCell(weekNum, row.key).plan;
        }
        for (const label of customRows[section.title] || []) {
          total += getCell(weekNum, `custom_${label}`).plan;
        }
      }
      return total;
    },
    [getCell, customRows]
  );

  const getBalance = useCallback(
    (weekNum) => {
      let balance = 0;
      for (let w = 1; w <= weekNum; w++) {
        balance += getTotalIncome(w) - getTotalPayments(w);
      }
      return balance;
    },
    [getTotalIncome, getTotalPayments]
  );

  const getWeekLabel = useCallback((weekNum) => {
    const w = WEEKS_2026.find((x) => x.number === weekNum);
    if (!w) return `Неделя ${weekNum}`;
    const startD = new Date(`${w.start}T12:00:00`);
    const endD = new Date(`${w.end}T12:00:00`);
    const sm = String(startD.getMonth() + 1).padStart(2, '0');
    const em = String(endD.getMonth() + 1).padStart(2, '0');
    return `${startD.getDate()}.${sm}–${endD.getDate()}.${em}`;
  }, []);

  const openCalcPopup = useCallback(
    (weekNum) => {
      const key = `${year}_${weekNum}`;
      const weekData = incomeByWeek[key];

      if (weekData?.items?.length) {
        setCalcPopup({
          weekNum,
          weekLabel: getWeekLabel(weekNum),
          items: weekData.items.map((i) => ({
            name: [i.article, i.client].filter(Boolean).join(' — '),
            amount: i.amount,
          })),
          total: weekData.total || 0,
        });
        return;
      }

      const items = [];
      for (const row of SECTIONS[0].rows) {
        const val = getCell(weekNum, row.key).plan;
        if (val > 0) {
          items.push({ name: row.label, amount: val });
        }
      }
      for (const label of customRows[SECTIONS[0].title] || []) {
        const val = getCell(weekNum, `custom_${label}`).plan;
        if (val > 0) {
          items.push({ name: label, amount: val });
        }
      }
      setCalcPopup({
        weekNum,
        weekLabel: getWeekLabel(weekNum),
        items,
        total: items.reduce((s, i) => s + i.amount, 0),
      });
    },
    [year, incomeByWeek, getCell, customRows, getWeekLabel]
  );

  const handlePlanBreakdownClick = useCallback(
    async (e, { sectionTitle, rowName, category, weekNum, planValue }) => {
      if (!planValue || planValue <= 0) return;
      e.stopPropagation();

      const stage = SECTION_STAGE_MAP[sectionTitle] || 'unknown';

      setPopup({
        stage,
        category,
        weekNumber: weekNum,
        year,
        amount: planValue,
        rowName: rowName || sectionTitle,
        orders: [],
        loading: true,
      });

      try {
        const orders = await api.paymentCalendar.byWeek({
          stage,
          category,
          week_number: weekNum,
          year,
        });
        setPopup((prev) =>
          prev
            ? {
                ...prev,
                orders: Array.isArray(orders) ? orders : [],
                loading: false,
              }
            : null
        );
      } catch (err) {
        console.error('[PaymentCalendar by-week]:', err?.message || err);
        setPopup((prev) =>
          prev ? { ...prev, orders: [], loading: false } : null
        );
      }
    },
    [year]
  );

  const renderWeekInputs = (
    w,
    category,
    sub = '',
    customLabel = null,
    sectionTitle = '',
    rowName = ''
  ) => {
    const cat = customLabel ? `custom_${customLabel}` : category;
    const cell = getCell(w.number, cat, sub);
    const planReadonly = isPlanReadonlySection(sectionTitle);
    const planValue = cell.plan || 0;

    const isIncomeSection = sectionTitle === SECTIONS[0].title;
    const weekIncomeKey = `${year}_${w.number}`;
    const weekIncome = incomeByWeek[weekIncomeKey];
    const rowPlanItems =
      isIncomeSection && !customLabel && sub === ''
        ? (weekIncome?.items || []).filter((i) => i.article === rowName)
        : [];

    return (
      <Fragment key={`${w.number}_${cat}_${sub}`}>
        <td
          style={{ ...CELL_STYLE, textAlign: 'right' }}
          onClick={
            isIncomeSection
              ? (e) => {
                  if (e.target.closest('input')) return;
                  openCalcPopup(w.number);
                }
              : undefined
          }
          title={isIncomeSection ? 'Калькулятор поступлений по неделе' : undefined}
        >
          {canEdit && !planReadonly ? (
            <input
              type="number"
              min={0}
              value={cell.plan || ''}
              placeholder="0"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                updateCell(
                  w.number,
                  w.start,
                  w.end,
                  cat,
                  sub,
                  'plan',
                  e.target.value,
                  planReadonly
                )
              }
              style={INPUT_STYLE}
            />
          ) : planReadonly ? (
            <div
              role="button"
              tabIndex={planValue > 0 ? 0 : -1}
              title={PLAN_READONLY_TITLE}
              onClick={(e) =>
                handlePlanBreakdownClick(e, {
                  sectionTitle,
                  rowName: rowName || sectionTitle,
                  category: cat,
                  weekNum: w.number,
                  planValue,
                })
              }
              onKeyDown={(e) => {
                if (planValue > 0 && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handlePlanBreakdownClick(e, {
                    sectionTitle,
                    rowName: rowName || sectionTitle,
                    category: cat,
                    weekNum: w.number,
                    planValue,
                  });
                }
              }}
              style={{
                padding: '4px 6px',
                textAlign: 'right',
                color: planValue > 0 ? '#a3e635' : '#374151',
                fontWeight: planValue > 0 ? 700 : 400,
                fontSize: 13,
                cursor: planValue > 0 ? 'pointer' : 'default',
                userSelect: 'none',
                background: '#050d1a',
                borderRadius: 4,
                minWidth: 60,
                border: '1px solid #1a1a2e',
                position: 'relative',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => {
                if (planValue > 0) e.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              {planValue > 0 ? money(planValue) : '—'}
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  fontSize: 8,
                  color: '#374151',
                }}
              >
                🔒
              </span>
            </div>
          ) : (
            money(cell.plan)
          )}
          {rowPlanItems.length > 0 ? (
            <div
              title={rowPlanItems
                .map(
                  (i) =>
                    `${i.client}: ${i.amount.toLocaleString('ru-RU')} сом`
                )
                .join('\n')}
              style={{
                fontSize: 9,
                color: '#4ade80',
                marginTop: 2,
                cursor: 'help',
              }}
            >
              📥 {rowPlanItems.length} план.
            </div>
          ) : null}
        </td>
        <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
          {canEdit ? (
            <input
              type="number"
              min={0}
              value={cell.fact || ''}
              placeholder="0"
              onChange={(e) =>
                updateCell(
                  w.number,
                  w.start,
                  w.end,
                  cat,
                  sub,
                  'fact',
                  e.target.value,
                  planReadonly
                )
              }
              style={{ ...INPUT_STYLE, color: '#fbbf24' }}
            />
          ) : (
            <span style={{ color: '#fbbf24' }}>{money(cell.fact)}</span>
          )}
        </td>
      </Fragment>
    );
  };

  return (
    <div style={{ padding: '0 0 16px', color: '#e2e8f0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ color: '#a3e635', margin: 0, fontSize: 16 }}>📅 Платёжный календарь {year}</h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setStartWeekClamped(1)}
            title="В начало года"
            style={{
              background: '#1e2a3a',
              color: '#64748b',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            ⏮ Янв
          </button>
          <button
            type="button"
            onClick={() => setStartWeekClamped((w) => w - 4)}
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← −4 нед
          </button>
          <button
            type="button"
            onClick={() => setStartWeekClamped((w) => w - 1)}
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ←
          </button>
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: '6px 14px',
              color: '#e2e8f0',
              fontSize: 12,
              fontWeight: 600,
              minWidth: 100,
              textAlign: 'center',
            }}
          >
            Нед. {startWeek}–{Math.min(52, startWeek + 7)}
          </div>
          <button
            type="button"
            onClick={() => setStartWeekClamped((w) => w + 1)}
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setStartWeekClamped((w) => w + 4)}
            style={{
              background: '#1e3a5f',
              color: '#93c5fd',
              border: '1px solid #1e3a5f',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            +4 нед →
          </button>
          <button
            type="button"
            onClick={() =>
              setStartWeekClamped(Math.max(1, currentWeekNum - 1))
            }
            style={{
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            📅 Сейчас
          </button>
          <button
            type="button"
            onClick={() => setStartWeekClamped(45)}
            title="К концу года"
            style={{
              background: '#1e2a3a',
              color: '#64748b',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Дек ⏭
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Загрузка…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              minWidth: 900,
              fontSize: 11,
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: 220 }} />
              {displayWeeks.flatMap((w) => [
                <col key={`${w.number}-p`} style={{ width: 44 }} />,
                <col key={`${w.number}-f`} style={{ width: 44 }} />,
              ])}
            </colgroup>
            <thead>
              <tr style={{ background: '#1e3a5f' }}>
                <th
                  style={{
                    ...CELL_STYLE,
                    textAlign: 'left',
                    color: '#a3e635',
                    fontWeight: 700,
                    padding: '6px 8px',
                  }}
                >
                  Статья
                </th>
                {displayWeeks.map((w) => {
                  const isCurrent = w.number === currentWeekNum;
                  const startD = new Date(`${w.start}T12:00:00`);
                  const endD = new Date(`${w.end}T12:00:00`);
                  const sm = String(startD.getMonth() + 1).padStart(2, '0');
                  const em = String(endD.getMonth() + 1).padStart(2, '0');
                  const weekDateRange = `${startD.getDate()}.${sm}–${endD.getDate()}.${em}`;
                  return (
                    <th
                      key={w.number}
                      colSpan={2}
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'center',
                        color: '#e2e8f0',
                        fontSize: 10,
                        whiteSpace: 'pre-line',
                        background: isCurrent ? '#1a3a1a' : '#1e3a5f',
                        border: isCurrent
                          ? '2px solid #a3e635'
                          : '1px solid #2d3a8a',
                        padding: '6px 4px',
                      }}
                    >
                      {isCurrent ? (
                        <div
                          style={{
                            fontSize: 9,
                            color: '#a3e635',
                            marginBottom: 2,
                            fontWeight: 700,
                          }}
                        >
                          ● СЕЙЧАС
                        </div>
                      ) : null}
                      <div style={{ fontWeight: 600 }}>Нед {w.number}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
                        {weekDateRange}
                      </div>
                    </th>
                  );
                })}
              </tr>
              <tr style={{ background: '#0f172a' }}>
                <th style={CELL_STYLE} />
                {displayWeeks.map((w) => (
                  <Fragment key={`h-${w.number}`}>
                    <th
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'center',
                        color: '#a3e635',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      План
                    </th>
                    <th
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'center',
                        color: '#fbbf24',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      Факт
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <Fragment key={section.title}>
                  <tr style={{ background: section.bg }}>
                    <td
                      colSpan={displayWeeks.length * 2 + 1}
                      style={{
                        ...CELL_STYLE,
                        fontWeight: 700,
                        color: section.color,
                        padding: '6px 8px',
                      }}
                    >
                      {section.title}
                      {section.planReadonly ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: '#475569',
                            fontWeight: 400,
                          }}
                        >
                          🔒 авто
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.key} style={{ background: '#090f18' }}>
                      <td
                        style={{
                          ...CELL_STYLE,
                          paddingLeft: section.isSubSection ? 20 : 8,
                          color: '#cbd5e1',
                        }}
                      >
                        {row.label}
                      </td>
                      {displayWeeks.map((w) =>
                        renderWeekInputs(w, row.key, '', null, section.title, row.label)
                      )}
                    </tr>
                  ))}
                  {(customRows[section.title] || []).map((label) => (
                    <tr key={`custom_${section.title}_${label}`} style={{ background: '#090f18' }}>
                      <td
                        style={{
                          ...CELL_STYLE,
                          paddingLeft: section.isSubSection ? 20 : 8,
                          color: '#94a3b8',
                        }}
                      >
                        {label}
                      </td>
                      {displayWeeks.map((w) =>
                        renderWeekInputs(w, '', '', label, section.title, label)
                      )}
                    </tr>
                  ))}
                  {section.totalLabel && (
                    <tr style={{ background: '#0d2a0d' }}>
                      <td
                        style={{
                          ...CELL_STYLE,
                          fontWeight: 700,
                          color: '#86efac',
                          paddingLeft: 8,
                        }}
                      >
                        {section.totalLabel}
                      </td>
                      {displayWeeks.map((w) => (
                        <Fragment key={`inc-t-${w.number}`}>
                          <td
                            style={{
                              ...CELL_STYLE,
                              textAlign: 'right',
                              fontWeight: 700,
                              color: '#86efac',
                            }}
                          >
                            {money(getTotalIncome(w.number))}
                          </td>
                          <td style={CELL_STYLE} />
                        </Fragment>
                      ))}
                    </tr>
                  )}
                  {section.totalLabel === 'Итого поступления' && (
                    <tr
                      style={{
                        background: '#0a1a0a',
                        borderTop: '2px solid #16a34a',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 12px',
                          color: '#4ade80',
                          fontWeight: 700,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid #1e2a3a',
                          borderRight: '1px solid #1e2a3a',
                        }}
                      >
                        📊 Ожидаемый приход
                      </td>
                      {displayWeeks.map((w) => {
                        const key = `${year}_${w.number}`;
                        const weekData = incomeByWeek[key];
                        const weekTotal = weekData?.total || 0;
                        return (
                          <Fragment key={`expected-${w.number}`}>
                            <td
                              role="button"
                              tabIndex={0}
                              onClick={() => openCalcPopup(w.number)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openCalcPopup(w.number);
                                }
                              }}
                              style={{
                                padding: '8px 6px',
                                textAlign: 'right',
                                color: weekTotal > 0 ? '#4ade80' : '#374151',
                                fontWeight: 700,
                                fontSize: 13,
                                background: weekTotal > 0 ? '#0a2a0a' : 'transparent',
                                cursor: 'pointer',
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                              title="Калькулятор поступлений"
                            >
                              {weekTotal > 0 ? weekTotal.toLocaleString('ru-RU') : '—'}
                            </td>
                            <td
                              style={{
                                padding: '8px 6px',
                                color: '#374151',
                                textAlign: 'right',
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                            >
                              —
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  )}
                  {section.totalLabel === 'Итого поступления' && (
                    <tr
                      style={{
                        background: '#1a0505',
                        borderTop: '1px solid #f87171',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 12px',
                          color: '#f87171',
                          fontWeight: 700,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid #1e2a3a',
                          borderRight: '1px solid #1e2a3a',
                        }}
                      >
                        📤 Плановые расходы
                      </td>
                      {displayWeeks.map((w) => {
                        const key = `${year}_${w.number}`;
                        const data = expenseByWeek[key];
                        const total = data?.total || 0;
                        const title =
                          data?.items
                            ?.map(
                              (i) =>
                                `${i.article}: ${i.amount.toLocaleString('ru-RU')} сом`
                            )
                            .join('\n') || '';
                        return (
                          <Fragment key={`exp-plan-${w.number}`}>
                            <td
                              title={title}
                              style={{
                                padding: '6px 4px',
                                textAlign: 'right',
                                color: total > 0 ? '#f87171' : '#374151',
                                fontWeight: total > 0 ? 700 : 400,
                                fontSize: 12,
                                background: total > 0 ? '#1a0505' : 'transparent',
                                cursor: total > 0 ? 'help' : 'default',
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                            >
                              {total > 0
                                ? `-${total.toLocaleString('ru-RU')}`
                                : '—'}
                            </td>
                            <td
                              style={{
                                padding: '6px 4px',
                                color: '#374151',
                                textAlign: 'right',
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                            >
                              —
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  )}
                  {section.totalLabel === 'Итого поступления' && (
                    <tr
                      style={{
                        background: '#050f05',
                        borderTop: '2px solid #374151',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 12px',
                          color: '#a3e635',
                          fontWeight: 700,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid #1e2a3a',
                          borderRight: '1px solid #1e2a3a',
                        }}
                      >
                        💼 Баланс недели
                      </td>
                      {displayWeeks.map((w) => {
                        const key = `${year}_${w.number}`;
                        const income = incomeByWeek[key]?.total || 0;
                        const expense = expenseByWeek[key]?.total || 0;
                        const balance = income - expense;
                        return (
                          <Fragment key={`week-balance-${w.number}`}>
                            <td
                              style={{
                                padding: '6px 4px',
                                textAlign: 'right',
                                color:
                                  balance > 0
                                    ? '#4ade80'
                                    : balance < 0
                                      ? '#f87171'
                                      : '#374151',
                                fontWeight: 700,
                                fontSize: 12,
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                            >
                              {balance !== 0
                                ? `${balance > 0 ? '+' : ''}${balance.toLocaleString('ru-RU')}`
                                : '—'}
                            </td>
                            <td
                              style={{
                                padding: '6px 4px',
                                color: '#374151',
                                borderBottom: '1px solid #1e2a3a',
                                borderRight: '1px solid #1e2a3a',
                              }}
                            >
                              —
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  )}
                  {section.canAdd && canEdit && (
                    <tr style={{ background: '#090f18' }}>
                      <td colSpan={displayWeeks.length * 2 + 1} style={{ ...CELL_STYLE, paddingLeft: 16 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const label = window.prompt('Название статьи:');
                            if (!label?.trim()) return;
                            setCustomRows((prev) => ({
                              ...prev,
                              [section.title]: [...(prev[section.title] || []), label.trim()],
                            }));
                          }}
                          style={{
                            background: 'none',
                            color: '#64748b',
                            border: '1px dashed #374151',
                            borderRadius: 4,
                            padding: '3px 10px',
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                        >
                          + Добавить статью
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              <tr style={{ background: '#1a0d0d' }}>
                <td style={{ ...CELL_STYLE, fontWeight: 700, color: '#f87171', padding: '6px 8px' }}>
                  ИТОГО ПЛАТЕЖИ
                </td>
                {displayWeeks.map((w) => (
                  <Fragment key={`pay-t-${w.number}`}>
                    <td
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#f87171',
                      }}
                    >
                      {money(getTotalPayments(w.number))}
                    </td>
                    <td style={CELL_STYLE} />
                  </Fragment>
                ))}
              </tr>

              <tr style={{ background: '#0d1f0d' }}>
                <td style={{ ...CELL_STYLE, fontWeight: 700, color: '#86efac', padding: '6px 8px' }}>
                  Доход − Расход
                </td>
                {displayWeeks.map((w) => {
                  const diff = getTotalIncome(w.number) - getTotalPayments(w.number);
                  return (
                    <td
                      key={`diff-${w.number}`}
                      colSpan={2}
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'right',
                        fontWeight: 700,
                        color: diff >= 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {diff >= 0 ? '+' : ''}
                      {money(diff)}
                    </td>
                  );
                })}
              </tr>

              <tr style={{ background: '#0a1628' }}>
                <td style={{ ...CELL_STYLE, fontWeight: 600, color: '#93c5fd', padding: '6px 8px' }}>
                  Баланс на начало недели
                </td>
                {displayWeeks.map((w) => (
                  <td
                    key={`bs-${w.number}`}
                    colSpan={2}
                    style={{ ...CELL_STYLE, textAlign: 'right', color: '#93c5fd', fontWeight: 600 }}
                  >
                    {money(getBalance(w.number - 1))}
                  </td>
                ))}
              </tr>

              <tr style={{ background: '#0a1628' }}>
                <td
                  style={{
                    ...CELL_STYLE,
                    fontWeight: 700,
                    color: '#a3e635',
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                >
                  💰 Баланс на конец недели
                </td>
                {displayWeeks.map((w) => {
                  const bal = getBalance(w.number);
                  return (
                    <td
                      key={`be-${w.number}`}
                      colSpan={2}
                      style={{
                        ...CELL_STYLE,
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: 12,
                        color: bal >= 0 ? '#a3e635' : '#f87171',
                      }}
                    >
                      {money(bal)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {calcPopup ? (
        <>
          <div
            role="presentation"
            onClick={() => setCalcPopup(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #16a34a',
              borderRadius: 12,
              padding: '20px 24px',
              minWidth: 380,
              maxWidth: 500,
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    color: '#4ade80',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  📊 Поступления — Нед {calcPopup.weekNum}
                </div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {calcPopup.weekLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalcPopup(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                }}
              >
                ✕
              </button>
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: 12,
              }}
            >
              <thead>
                <tr style={{ background: '#1a237e' }}>
                  <th
                    style={{
                      padding: '6px 10px',
                      color: '#fff',
                      fontSize: 12,
                      textAlign: 'left',
                    }}
                  >
                    Статья
                  </th>
                  <th
                    style={{
                      padding: '6px 10px',
                      color: '#fff',
                      fontSize: 12,
                      textAlign: 'right',
                    }}
                  >
                    Сумма (план)
                  </th>
                </tr>
              </thead>
              <tbody>
                {calcPopup.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: '12px',
                        color: '#64748b',
                        textAlign: 'center',
                        fontSize: 12,
                      }}
                    >
                      Нет данных
                    </td>
                  </tr>
                ) : (
                  calcPopup.items.map((item, i) => (
                    <tr
                      key={`${item.name}-${i}`}
                      style={{
                        background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 10px',
                          color: '#e2e8f0',
                          fontSize: 13,
                        }}
                      >
                        {item.name}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'right',
                          color: '#4ade80',
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {item.amount.toLocaleString('ru-RU')} сом
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div
              style={{
                background: '#0a2a0a',
                border: '1px solid #16a34a',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: '#4ade80',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                ИТОГО поступит:
              </span>
              <span
                style={{
                  color: '#4ade80',
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {calcPopup.total.toLocaleString('ru-RU')} сом
              </span>
            </div>

            {(() => {
              const expenses = getTotalPayments(calcPopup.weekNum);
              const balance = calcPopup.total - expenses;
              return expenses > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 16px',
                      color: '#f87171',
                      fontSize: 13,
                    }}
                  >
                    <span>Расходы план:</span>
                    <span>
                      -{expenses.toLocaleString('ru-RU')} сом
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 16px',
                      background: balance >= 0 ? '#0a2a0a' : '#2a0a0a',
                      borderRadius: 6,
                      color: balance >= 0 ? '#4ade80' : '#f87171',
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    <span>Остаток:</span>
                    <span>
                      {balance >= 0 ? '+' : ''}
                      {balance.toLocaleString('ru-RU')} сом
                    </span>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </>
      ) : null}

      {popup ? (
        <>
          <div
            role="presentation"
            onClick={() => setPopup(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1001,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 12,
              padding: '20px 24px',
              minWidth: 480,
              maxWidth: 680,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#a3e635' }}>
                  📋 {popup.rowName}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                  Неделя {popup.weekNumber} • Итого: {money(popup.amount || 0)} сом
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            {popup.loading ? (
              <div
                style={{
                  color: '#64748b',
                  textAlign: 'center',
                  padding: 24,
                  fontSize: 14,
                }}
              >
                ⏳ Загрузка...
              </div>
            ) : popup.orders.length === 0 ? (
              <div
                style={{
                  color: '#64748b',
                  textAlign: 'center',
                  padding: 24,
                  fontSize: 13,
                }}
              >
                Нет данных по заказам
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: '#1a237e' }}>
                    <th
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        color: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Заказ
                    </th>
                    <th
                      style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        color: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Кол-во
                    </th>
                    <th
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        color: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Клиент
                    </th>
                    <th
                      style={{
                        padding: '8px 10px',
                        textAlign: 'right',
                        color: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Сумма
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {popup.orders.map((item, i) => (
                    <tr
                      key={item.order_id ?? i}
                      style={{
                        background: i % 2 === 0 ? '#0a1020' : '#0f172a',
                        borderBottom: '1px solid #111',
                      }}
                    >
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, color: '#a3e635', fontSize: 13 }}>
                          {item.order_number || item.order_id}
                        </div>
                        {item.order_name ? (
                          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                            {item.order_name}
                          </div>
                        ) : null}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'center',
                          color: '#e2e8f0',
                        }}
                      >
                        {item.quantity ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          color: item.client === 'WB' ? '#3b82f6' : '#94a3b8',
                          fontWeight: item.client === 'WB' ? 700 : 400,
                        }}
                      >
                        {item.client || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#4ade80',
                          fontSize: 13,
                        }}
                      >
                        {money(item.amount || 0)} сом
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0f2040', borderTop: '2px solid #1e3a5f' }}>
                    <td
                      colSpan={3}
                      style={{
                        padding: '10px',
                        fontWeight: 700,
                        color: '#a3e635',
                        fontSize: 13,
                      }}
                    >
                      ИТОГО ({popup.orders.length} заказов)
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#a3e635',
                        fontSize: 15,
                      }}
                    >
                      {money(
                        popup.orders.reduce((s, o) => s + (Number(o.amount) || 0), 0)
                      )}{' '}
                      сом
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
