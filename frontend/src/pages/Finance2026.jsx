/**
 * Финансовый модуль: БДР и БДДС на 2026 год
 * Таблица план/факт по месяцам, редактирование плановых значений, экспорт в CSV
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import PrintButton from '../components/PrintButton';
import PaymentCalendar from './PaymentCalendar';
import IncomePlanForm from '../components/IncomePlanForm';
import ExpensePlanForm from '../components/ExpensePlanForm';
import FinPlanPage from '../components/finance/FinPlanPage';
import ExpensesPanelPage from '../components/finance/ExpensesPanelPage';

const MONTH_LABELS = {
  '2026-01': 'Янв', '2026-02': 'Фев', '2026-03': 'Мар', '2026-04': 'Апр',
  '2026-05': 'Май', '2026-06': 'Июн', '2026-07': 'Июл', '2026-08': 'Авг',
  '2026-09': 'Сен', '2026-10': 'Окт', '2026-11': 'Ноя', '2026-12': 'Дек',
};

function formatNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const VIEW_ROW = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  background: '#0a1628',
  border: '1px solid #1e3a5f',
  borderRadius: 8,
};

const VIEW_LABEL = {
  color: '#64748b',
  fontSize: 12,
  fontWeight: 600,
};

const VIEW_VALUE = {
  color: '#e2e8f0',
  fontSize: 13,
  textAlign: 'right',
};

export default function Finance2026() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [tab, setTab] = useState(() =>
    tabFromUrl === 'payment' ? 'payment_calendar' : 'BDR'
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [incomeTab, setIncomeTab] = useState('list');
  const [incomePlans, setIncomePlans] = useState([]);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [viewPlan, setViewPlan] = useState(null);
  const [editPlan, setEditPlan] = useState(null);
  const [showExpensePlan, setShowExpensePlan] = useState(false);
  const [expensePlans, setExpensePlans] = useState([]);
  const [expenseTab, setExpenseTab] = useState('list');
  const [viewExpense, setViewExpense] = useState(null);
  const [editExpense, setEditExpense] = useState(null);

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const fn = tab === 'BDR' ? api.finance.bdr2026 : api.finance.bdds2026;
      const d = await fn();
      setData(d);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tabFromUrl === 'payment') setTab('payment_calendar');
  }, [tabFromUrl]);

  useEffect(() => {
    if (tab === 'BDR' || tab === 'BDDS') load();
  }, [tab]);

  const loadIncomePlans = () => {
    api.incomePlans
      .list()
      .then((rows) => setIncomePlans(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadIncomePlans();
  }, []);

  const loadExpensePlans = () => {
    api.expensePlans
      .list()
      .then((rows) => setExpensePlans(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadExpensePlans();
  }, []);

  const handlePlanChange = async (categoryId, month, value) => {
    if (!canEdit || saving) return;
    const num = parseFloat(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
    setSaving(true);
    try {
      await api.finance.updatePlan({
        type: tab,
        category_id: categoryId,
        month,
        planned_amount: num,
      });
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        const cat = next.categories.find((c) => c.category_id === categoryId);
        if (cat) {
          cat.months[month] = { ...cat.months[month], planned_amount: num };
          cat.row_planned_total = Object.values(cat.months).reduce((s, m) => s + (m.planned_amount || 0), 0);
        }
        next.totals.planned[month] = next.categories.reduce(
          (s, c) => s + (c.months[month]?.planned_amount || 0),
          0
        );
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [];
    const header = ['Категория', ...data.months.map((m) => MONTH_LABELS[m] || m), 'Итого план', 'Итого факт'];
    rows.push(header.join(';'));
    for (const cat of data.categories) {
      const cells = [
        cat.category_name,
        ...data.months.map((m) => formatNum(cat.months[m]?.planned_amount)),
        formatNum(cat.row_planned_total),
        formatNum(cat.row_fact_total),
      ];
      rows.push(cells.join(';'));
    }
    const totalsRow = [
      'Итого',
      ...data.months.map((m) => formatNum(data.totals.planned[m])),
      formatNum(Object.values(data.totals.planned).reduce((a, b) => a + b, 0)),
      formatNum(Object.values(data.totals.fact).reduce((a, b) => a + b, 0)),
    ];
    rows.push(totalsRow.join(';'));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}_2026.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#ECECEC] dark:text-dark-text">Финансы 2026</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <PrintButton />
          {(tab === 'BDR' || tab === 'BDDS') && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data}
              className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text hover:bg-accent-1/40 dark:hover:bg-dark-3 disabled:opacity-50"
            >
              Экспорт CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('BDR')}
          className={`px-4 py-2 rounded-lg ${tab === 'BDR' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          БДР 2026
        </button>
        <button
          type="button"
          onClick={() => setTab('BDDS')}
          className={`px-4 py-2 rounded-lg ${tab === 'BDDS' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          БДДС 2026
        </button>
        <button
          type="button"
          onClick={() => setTab('finplan')}
          className={`px-4 py-2 rounded-lg ${tab === 'finplan' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          📋 Финплан
        </button>
        <button
          type="button"
          onClick={() => setTab('expenses_panel')}
          className={`px-4 py-2 rounded-lg ${tab === 'expenses_panel' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          💰 Панель расходов
        </button>
        <button
          type="button"
          onClick={() => setTab('payment_calendar')}
          className={`px-4 py-2 rounded-lg ${tab === 'payment_calendar' ? 'bg-primary-600 text-white' : 'bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] dark:text-dark-text'}`}
        >
          📅 Платёжный календарь
        </button>
        <button
          type="button"
          onClick={() => {
            setIncomeTab('list');
            loadIncomePlans();
            setShowIncomeForm(true);
          }}
          style={{
            background: '#1e3a5f',
            color: '#93c5fd',
            border: '1px solid #1e3a5f',
            borderRadius: 8,
            padding: '10px 18px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          💰 Плановое поступление
        </button>
        <button
          type="button"
          onClick={() => {
            setExpenseTab('list');
            loadExpensePlans();
            setShowExpensePlan(true);
          }}
          style={{
            background: '#2a1a00',
            color: '#fbbf24',
            border: '1px solid #fbbf24',
            borderRadius: 8,
            padding: '10px 18px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          📤 Планирование расходов
        </button>
      </div>

      {error && tab !== 'payment_calendar' && tab !== 'finplan' && tab !== 'expenses_panel' && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {error}
        </div>
      )}

      {tab === 'payment_calendar' ? (
        <PaymentCalendar
          key={calendarRefreshKey}
          initialWeek={searchParams.get('week')}
          initialYear={searchParams.get('year')}
        />
      ) : tab === 'finplan' ? (
        <FinPlanPage canEdit={canEdit} />
      ) : tab === 'expenses_panel' ? (
        <ExpensesPanelPage />
      ) : loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Загрузка...</div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25 dark:border-white/25">
            <thead>
              <tr className="border-b border-white/20 dark:border-white/20">
                <th className="text-left px-4 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[160px]">
                  Категория
                </th>
                {data.months.map((m) => (
                  <th key={m} className="text-center px-2 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[90px]">
                    {MONTH_LABELS[m] || m}
                  </th>
                ))}
                <th className="text-center px-2 py-3 text-sm font-medium text-[#ECECEC] dark:text-dark-text/90 min-w-[90px]">
                  Итого
                </th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat) => (
                <tr key={cat.category_id} className="border-b border-white/15 dark:border-white/15">
                  <td className="px-4 py-2 text-[#ECECEC] dark:text-dark-text font-medium">
                    {cat.category_name}
                  </td>
                  {data.months.map((m) => (
                    <td key={m} className="px-2 py-1">
                      <div className="flex flex-col gap-0.5">
                        {canEdit ? (
                          <input
                            key={`${cat.category_id}-${m}-${cat.months[m]?.planned_amount}`}
                            type="text"
                            defaultValue={cat.months[m]?.planned_amount ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value;
                              handlePlanChange(cat.category_id, m, v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.target.blur();
                              }
                            }}
                            className="w-full px-2 py-1 text-sm rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 dark:border-white/25 text-[#ECECEC] dark:text-dark-text"
                          />
                        ) : (
                          <span className="text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                            {formatNum(cat.months[m]?.planned_amount)}
                          </span>
                        )}
                        <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                          факт: {formatNum(cat.months[m]?.fact_amount)}
                        </span>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-sm">
                    <span className="text-[#ECECEC]/90 dark:text-dark-text/80">{formatNum(cat.row_planned_total)}</span>
                    <br />
                    <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                      факт: {formatNum(cat.row_fact_total)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-white/25 dark:border-white/25 bg-accent-2/50 dark:bg-dark-800 font-medium">
                <td className="px-4 py-3 text-[#ECECEC] dark:text-dark-text">Итого</td>
                {data.months.map((m) => (
                  <td key={m} className="px-2 py-2 text-center text-sm text-[#ECECEC]/90 dark:text-dark-text/80">
                    {formatNum(data.totals.planned[m])}
                    <br />
                    <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                      факт: {formatNum(data.totals.fact[m])}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-2 text-center text-sm">
                  {formatNum(Object.values(data.totals.planned).reduce((a, b) => a + b, 0))}
                  <br />
                  <span className="text-xs text-[#ECECEC]/80 dark:text-dark-text/80">
                    факт: {formatNum(Object.values(data.totals.fact).reduce((a, b) => a + b, 0))}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-[#ECECEC]/80 dark:text-dark-text/80">Нет данных</div>
      )}

      {showIncomeForm ? (
        <>
          <div
            role="presentation"
            onClick={() => setShowIncomeForm(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              padding: '24px',
              width: 680,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#4ade80',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                💰 Плановое поступление
              </div>
              <button
                type="button"
                onClick={() => setShowIncomeForm(false)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => setIncomeTab('list')}
                style={{
                  flex: 1,
                  background: incomeTab === 'list' ? '#16a34a' : '#1e2a3a',
                  color: incomeTab === 'list' ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                📋 Список документов
                {incomePlans.length > 0 ? (
                  <span
                    style={{
                      background: '#ffffff33',
                      borderRadius: 10,
                      padding: '1px 8px',
                      marginLeft: 6,
                      fontSize: 11,
                    }}
                  >
                    {incomePlans.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setIncomeTab('create')}
                style={{
                  flex: 1,
                  background: incomeTab === 'create' ? '#16a34a' : '#1e2a3a',
                  color: incomeTab === 'create' ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                + Создать новый
              </button>
            </div>

            {incomeTab === 'list' ? (
              <div>
                {incomePlans.length === 0 ? (
                  <div
                    style={{
                      color: '#64748b',
                      textAlign: 'center',
                      padding: '40px 20px',
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontSize: 32 }}>📭</div>
                    <div style={{ marginTop: 8 }}>Документов пока нет</div>
                    <button
                      type="button"
                      onClick={() => setIncomeTab('create')}
                      style={{
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        marginTop: 16,
                      }}
                    >
                      + Создать первый документ
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {incomePlans.map((plan) => {
                      const planDates = Array.isArray(plan.dates) ? plan.dates : [];
                      const createdAt = plan.created_at || plan.createdAt;
                      return (
                        <div
                          key={plan.id}
                          style={{
                            background: '#0a1628',
                            border: '1px solid #1e3a5f',
                            borderRadius: 10,
                            padding: '14px 16px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: 10,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: '#4ade80',
                                  fontWeight: 700,
                                  fontSize: 14,
                                }}
                              >
                                {plan.article}
                              </div>
                              <div
                                style={{
                                  color: '#94a3b8',
                                  fontSize: 12,
                                  marginTop: 2,
                                }}
                              >
                                👤 {plan.client}
                              </div>
                              {plan.note ? (
                                <div
                                  style={{
                                    color: '#64748b',
                                    fontSize: 11,
                                    marginTop: 2,
                                  }}
                                >
                                  {plan.note}
                                </div>
                              ) : null}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div
                                style={{
                                  color: '#4ade80',
                                  fontWeight: 700,
                                  fontSize: 16,
                                }}
                              >
                                {parseFloat(plan.total_amount || 0).toLocaleString('ru-RU')} сом
                              </div>
                              {createdAt ? (
                                <div
                                  style={{
                                    color: '#475569',
                                    fontSize: 10,
                                    marginTop: 2,
                                  }}
                                >
                                  {new Date(createdAt).toLocaleDateString('ru-RU')}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {planDates.length > 0 ? (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                marginBottom: 10,
                              }}
                            >
                              {planDates.map((d, j) => (
                                <div
                                  key={j}
                                  style={{
                                    background: '#1e3a5f',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    fontSize: 11,
                                  }}
                                >
                                  <span style={{ color: '#93c5fd' }}>
                                    Нед {d.week_number}:
                                  </span>{' '}
                                  <span style={{ color: '#e2e8f0' }}>
                                    {d.date
                                      ? new Date(d.date).toLocaleDateString('ru-RU')
                                      : '—'}
                                  </span>
                                  {' — '}
                                  <span
                                    style={{
                                      color: '#4ade80',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {parseFloat(d.amount || 0).toLocaleString('ru-RU')} сом
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              justifyContent: 'flex-end',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setViewPlan(plan)}
                              style={{
                                background: '#1e3a5f',
                                color: '#93c5fd',
                                border: '1px solid #1e3a5f',
                                borderRadius: 6,
                                padding: '3px 10px',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              👁 Просмотр
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditPlan(plan)}
                              style={{
                                background: '#2a1a00',
                                color: '#fbbf24',
                                border: '1px solid #fbbf24',
                                borderRadius: 6,
                                padding: '3px 10px',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              ✏️ Изменить
                            </button>
                            <span
                              style={{
                                background:
                                  plan.status === 'done' ? '#16a34a' : '#1e3a5f',
                                color: plan.status === 'done' ? '#fff' : '#93c5fd',
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {plan.status === 'done' ? '✅ Получено' : '⏳ Ожидается'}
                            </span>
                            {plan.status !== 'done' ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Пометить как получено?')) return;
                                  try {
                                    await api.incomePlans.update(plan.id, {
                                      status: 'done',
                                    });
                                    setIncomePlans((prev) =>
                                      prev.map((p) =>
                                        p.id === plan.id ? { ...p, status: 'done' } : p
                                      )
                                    );
                                  } catch (err) {
                                    alert(err.message || 'Ошибка сохранения');
                                  }
                                }}
                                style={{
                                  background: '#0a2a0a',
                                  color: '#4ade80',
                                  border: '1px solid #16a34a',
                                  borderRadius: 6,
                                  padding: '3px 10px',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                }}
                              >
                                ✓ Получено
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm('Удалить документ?')) return;
                                try {
                                  await api.incomePlans.delete(plan.id);
                                  setIncomePlans((prev) =>
                                    prev.filter((p) => p.id !== plan.id)
                                  );
                                } catch (err) {
                                  alert(err.message || 'Ошибка удаления');
                                }
                              }}
                              style={{
                                background: '#2a0a0a',
                                color: '#f87171',
                                border: '1px solid #f87171',
                                borderRadius: 6,
                                padding: '3px 10px',
                                cursor: 'pointer',
                                fontSize: 11,
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {incomeTab === 'create' ? (
              <IncomePlanForm
                onSave={(plan) => {
                  setIncomePlans((prev) => [plan, ...prev]);
                  setIncomeTab('list');
                }}
                onClose={() => setIncomeTab('list')}
                onRefreshCalendar={() =>
                  setCalendarRefreshKey((k) => k + 1)
                }
              />
            ) : null}
          </div>
        </>
      ) : null}

      {showExpensePlan ? (
        <>
          <div
            role="presentation"
            onClick={() => setShowExpensePlan(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
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
              border: '1px solid #fbbf24',
              borderRadius: 14,
              padding: '24px',
              width: 700,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#fbbf24',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                📤 Планирование расходов
              </div>
              <button
                type="button"
                onClick={() => setShowExpensePlan(false)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => setExpenseTab('list')}
                style={{
                  flex: 1,
                  background: expenseTab === 'list' ? '#fbbf24' : '#1e2a3a',
                  color: expenseTab === 'list' ? '#000' : '#94a3b8',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                📋 Список
                {expensePlans.length > 0 ? (
                  <span
                    style={{
                      background: '#00000033',
                      borderRadius: 10,
                      padding: '1px 8px',
                      marginLeft: 6,
                      fontSize: 11,
                    }}
                  >
                    {expensePlans.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setExpenseTab('create')}
                style={{
                  flex: 1,
                  background: expenseTab === 'create' ? '#fbbf24' : '#1e2a3a',
                  color: expenseTab === 'create' ? '#000' : '#94a3b8',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                + Создать расход
              </button>
            </div>

            {expenseTab === 'list' ? (
              <div>
                {expensePlans.length === 0 ? (
                  <div
                    style={{
                      color: '#64748b',
                      textAlign: 'center',
                      padding: '40px 20px',
                    }}
                  >
                    <div style={{ fontSize: 32 }}>📭</div>
                    <div style={{ marginTop: 8 }}>Расходов пока нет</div>
                    <button
                      type="button"
                      onClick={() => setExpenseTab('create')}
                      style={{
                        background: '#fbbf24',
                        color: '#000',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                        marginTop: 16,
                      }}
                    >
                      + Создать первый расход
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {expensePlans.map((exp) => (
                      <div
                        key={exp.id}
                        style={{
                          background: '#0a1628',
                          border: '1px solid #374151',
                          borderRadius: 10,
                          padding: '14px 16px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                color: '#fbbf24',
                                fontWeight: 700,
                                fontSize: 14,
                              }}
                            >
                              {exp.article}
                            </div>
                            <div
                              style={{
                                color: '#94a3b8',
                                fontSize: 12,
                                marginTop: 2,
                              }}
                            >
                              📋 {exp.tz || '—'}
                              {exp.supplier ? ` • 🏭 ${exp.supplier}` : ''}
                              {exp.employee ? ` • 👤 ${exp.employee}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div
                              style={{
                                color: '#f87171',
                                fontWeight: 700,
                                fontSize: 16,
                              }}
                            >
                              -
                              {parseFloat(exp.amount || 0).toLocaleString('ru-RU')} сом
                            </div>
                            <div
                              style={{
                                color: '#475569',
                                fontSize: 10,
                                marginTop: 2,
                              }}
                            >
                              {exp.plan_date
                                ? new Date(exp.plan_date).toLocaleDateString('ru-RU')
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {exp.note ? (
                          <div
                            style={{
                              color: '#64748b',
                              fontSize: 11,
                              marginBottom: 8,
                            }}
                          >
                            💬 {exp.note}
                          </div>
                        ) : null}

                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setViewExpense(exp)}
                            style={{
                              background: '#1e3a5f',
                              color: '#93c5fd',
                              border: '1px solid #1e3a5f',
                              borderRadius: 6,
                              padding: '3px 10px',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            👁 Просмотр
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowExpensePlan(false);
                              setEditExpense(exp);
                            }}
                            style={{
                              background: '#2a1a00',
                              color: '#fbbf24',
                              border: '1px solid #fbbf24',
                              borderRadius: 6,
                              padding: '3px 10px',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            ✏️ Изменить
                          </button>
                          <span
                            style={{
                              background:
                                exp.status === 'paid' ? '#16a34a' : '#2a1a00',
                              color: exp.status === 'paid' ? '#fff' : '#fbbf24',
                              padding: '3px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {exp.status === 'paid' ? '✅ Оплачено' : '⏳ Запланировано'}
                          </span>
                          {exp.status !== 'paid' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await api.expensePlans.update(exp.id, {
                                    status: 'paid',
                                  });
                                  setExpensePlans((prev) =>
                                    prev.map((p) =>
                                      p.id === exp.id ? { ...p, status: 'paid' } : p
                                    )
                                  );
                                } catch (err) {
                                  alert(err.message || 'Ошибка');
                                }
                              }}
                              style={{
                                background: '#0a2a0a',
                                color: '#4ade80',
                                border: '1px solid #16a34a',
                                borderRadius: 6,
                                padding: '3px 10px',
                                cursor: 'pointer',
                                fontSize: 11,
                              }}
                            >
                              ✓ Оплачено
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm('Удалить расход?')) return;
                              try {
                                await api.expensePlans.delete(exp.id);
                                setExpensePlans((prev) =>
                                  prev.filter((p) => p.id !== exp.id)
                                );
                              } catch (err) {
                                alert(err.message || 'Ошибка удаления');
                              }
                            }}
                            style={{
                              background: '#2a0a0a',
                              color: '#f87171',
                              border: '1px solid #f87171',
                              borderRadius: 6,
                              padding: '3px 10px',
                              cursor: 'pointer',
                              fontSize: 11,
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {expenseTab === 'create' ? (
              <ExpensePlanForm
                onSave={(exp) => {
                  setExpensePlans((prev) => [exp, ...prev]);
                  setExpenseTab('list');
                }}
                onClose={() => setExpenseTab('list')}
                onRefreshCalendar={() =>
                  setCalendarRefreshKey((k) => k + 1)
                }
              />
            ) : null}
          </div>
        </>
      ) : null}

      {viewExpense ? (
        <>
          <div
            role="presentation"
            onClick={() => setViewExpense(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1100,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1101,
              background: '#0f172a',
              border: '1px solid #fbbf24',
              borderRadius: 14,
              padding: '24px',
              width: 520,
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 700 }}>
                👁 Просмотр расхода
              </div>
              <button
                type="button"
                onClick={() => setViewExpense(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Статья</span>
                <span style={VIEW_VALUE}>{viewExpense.article}</span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Дата</span>
                <span style={VIEW_VALUE}>
                  {viewExpense.plan_date
                    ? new Date(viewExpense.plan_date).toLocaleDateString('ru-RU')
                    : '—'}
                  {viewExpense.week_number ? ` (нед. ${viewExpense.week_number})` : ''}
                </span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>ТЗ</span>
                <span style={VIEW_VALUE}>{viewExpense.tz || '—'}</span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Поставщик</span>
                <span style={VIEW_VALUE}>{viewExpense.supplier || '—'}</span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Сотрудник</span>
                <span style={VIEW_VALUE}>{viewExpense.employee || '—'}</span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Сумма</span>
                <span style={{ ...VIEW_VALUE, color: '#f87171', fontWeight: 700 }}>
                  -{parseFloat(viewExpense.amount || 0).toLocaleString('ru-RU')} сом
                </span>
              </div>
              {viewExpense.note ? (
                <div style={VIEW_ROW}>
                  <span style={VIEW_LABEL}>Примечание</span>
                  <span style={VIEW_VALUE}>{viewExpense.note}</span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setViewExpense(null)}
              style={{
                marginTop: 20,
                width: '100%',
                background: '#1e2a3a',
                color: '#94a3b8',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '10px',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Закрыть
            </button>
          </div>
        </>
      ) : null}

      {editExpense ? (
        <>
          <div
            role="presentation"
            onClick={() => setEditExpense(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1100,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1101,
              background: '#0f172a',
              border: '1px solid #fbbf24',
              borderRadius: 14,
              padding: '24px',
              width: 580,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 700 }}>
                ✏️ Редактирование расхода
              </div>
              <button
                type="button"
                onClick={() => setEditExpense(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>
            <ExpensePlanForm
              key={editExpense.id}
              initialData={editExpense}
              isEdit
              editId={editExpense.id}
              onSave={(updated) => {
                setExpensePlans((prev) =>
                  prev.map((p) => (p.id === editExpense.id ? updated : p))
                );
                setEditExpense(null);
              }}
              onClose={() => setEditExpense(null)}
              onRefreshCalendar={() =>
                setCalendarRefreshKey((k) => k + 1)
              }
            />
          </div>
        </>
      ) : null}

      {viewPlan ? (
        <>
          <div
            role="presentation"
            onClick={() => setViewPlan(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1100,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1101,
              background: '#0f172a',
              border: '1px solid #1e3a5f',
              borderRadius: 14,
              padding: '24px',
              width: 520,
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#4ade80',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                👁 Просмотр документа
              </div>
              <button
                type="button"
                onClick={() => setViewPlan(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Статья поступления</span>
                <span style={VIEW_VALUE}>{viewPlan.article}</span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Заказчик</span>
                <span
                  style={{
                    ...VIEW_VALUE,
                    color: '#93c5fd',
                    fontWeight: 700,
                  }}
                >
                  {viewPlan.client}
                </span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Итого сумма</span>
                <span
                  style={{
                    ...VIEW_VALUE,
                    color: '#4ade80',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {parseFloat(viewPlan.total_amount || 0).toLocaleString('ru-RU')} сом
                </span>
              </div>
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Статус</span>
                <span
                  style={{
                    ...VIEW_VALUE,
                    color: viewPlan.status === 'done' ? '#4ade80' : '#fbbf24',
                  }}
                >
                  {viewPlan.status === 'done' ? '✅ Получено' : '⏳ Ожидается'}
                </span>
              </div>
              {viewPlan.note ? (
                <div style={VIEW_ROW}>
                  <span style={VIEW_LABEL}>Примечание</span>
                  <span style={VIEW_VALUE}>{viewPlan.note}</span>
                </div>
              ) : null}
              <div style={VIEW_ROW}>
                <span style={VIEW_LABEL}>Создан</span>
                <span style={VIEW_VALUE}>
                  {new Date(
                    viewPlan.created_at || viewPlan.createdAt
                  ).toLocaleString('ru-RU')}
                </span>
              </div>

              <div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  Даты и суммы поступления
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {(viewPlan.dates || []).map((d, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#0a1628',
                        border: '1px solid #1e3a5f',
                        borderRadius: 8,
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: '#93c5fd',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Неделя {d.week_number}
                        </div>
                        <div
                          style={{
                            color: '#64748b',
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          {d.date
                            ? new Date(d.date).toLocaleDateString('ru-RU')
                            : '—'}
                        </div>
                      </div>
                      <div
                        style={{
                          color: '#4ade80',
                          fontWeight: 700,
                          fontSize: 15,
                        }}
                      >
                        {parseFloat(d.amount || 0).toLocaleString('ru-RU')} сом
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setViewPlan(null);
                  setEditPlan(viewPlan);
                }}
                style={{
                  flex: 1,
                  background: '#2a1a00',
                  color: '#fbbf24',
                  border: '1px solid #fbbf24',
                  borderRadius: 8,
                  padding: '10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ✏️ Редактировать
              </button>
              <button
                type="button"
                onClick={() => setViewPlan(null)}
                style={{
                  background: '#1e2a3a',
                  color: '#94a3b8',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </>
      ) : null}

      {editPlan ? (
        <>
          <div
            role="presentation"
            onClick={() => setEditPlan(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              zIndex: 1100,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1101,
              background: '#0f172a',
              border: '1px solid #fbbf24',
              borderRadius: 14,
              padding: '24px',
              width: 580,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  color: '#fbbf24',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                ✏️ Редактирование документа
              </div>
              <button
                type="button"
                onClick={() => setEditPlan(null)}
                style={{
                  background: 'none',
                  color: '#64748b',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 20,
                }}
              >
                ✕
              </button>
            </div>

            <IncomePlanForm
              key={editPlan.id}
              initialData={editPlan}
              isEdit
              editId={editPlan.id}
              onSave={(updatedPlan) => {
                setIncomePlans((prev) =>
                  prev.map((p) => (p.id === editPlan.id ? updatedPlan : p))
                );
                setEditPlan(null);
              }}
              onClose={() => setEditPlan(null)}
              onRefreshCalendar={() => setCalendarRefreshKey((k) => k + 1)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
