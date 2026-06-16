import { useState, useEffect, useCallback, useMemo } from 'react';
import FinPlanArticlesModal from './FinPlanArticlesModal';
import { finplanApi, MONTH_LABELS, formatNum, parseAmount } from './financeApi';

const cellKey = (articleId, month) => `${articleId}_${month}`;

const SOURCE_TOOLTIPS = {
  planned_income: 'Данные из: Плановое поступление',
  planned_expense: 'Данные из: Планирование расходов',
};

function MonthCell({
  plan,
  fact,
  factEditable,
  canEdit,
  autoSource,
  sourceTooltip,
  planFromSource,
  factFromSource,
  onPlanChange,
  onFactChange,
}) {
  const [editPlan, setEditPlan] = useState(false);
  const [editFact, setEditFact] = useState(false);

  const factColor =
    plan > 0 || fact > 0 ? (fact >= plan ? '#4ade80' : '#f87171') : '#64748b';

  const showTooltip = autoSource && (planFromSource || factFromSource) && sourceTooltip;
  const tooltipText = showTooltip ? sourceTooltip : undefined;

  return (
    <td
      className="px-1 py-1 align-top"
      style={{ minWidth: 72 }}
      title={tooltipText}
    >
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] text-[#64748b] uppercase flex items-center gap-0.5">
          план
          {planFromSource ? <span className="text-[9px]">🔗</span> : null}
        </div>
        {canEdit && editPlan ? (
          <input
            autoFocus
            type="text"
            defaultValue={plan || ''}
            onBlur={(e) => {
              setEditPlan(false);
              onPlanChange(parseAmount(e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditPlan(false);
            }}
            className="w-full px-1 py-0.5 text-xs rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC]"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && setEditPlan(true)}
            className="w-full text-left text-xs text-[#ECECEC]/90 px-1 py-0.5 rounded hover:bg-white/5 disabled:cursor-default"
          >
            {formatNum(plan)}
          </button>
        )}
        <div className="text-[10px] text-[#64748b] uppercase mt-0.5 flex items-center gap-0.5">
          факт
          {factFromSource ? <span className="text-[9px]">🔗</span> : null}
        </div>
        {factEditable && canEdit && editFact ? (
          <input
            autoFocus
            type="text"
            defaultValue={fact || ''}
            onBlur={(e) => {
              setEditFact(false);
              onFactChange(parseAmount(e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditFact(false);
            }}
            className="w-full px-1 py-0.5 text-xs rounded bg-accent-2/80 dark:bg-dark-800 border border-white/25 text-[#ECECEC]"
          />
        ) : (
          <button
            type="button"
            disabled={!factEditable || !canEdit}
            onClick={() => factEditable && canEdit && setEditFact(true)}
            className="w-full text-left text-xs px-1 py-0.5 rounded disabled:cursor-default"
            style={{ color: factColor }}
          >
            {formatNum(fact)}
          </button>
        )}
      </div>
    </td>
  );
}

function DataRow({ row, canEdit, getCell, onCellChange }) {
  const isLinked = row.source && row.source !== 'manual';
  const articleTooltip = isLinked ? SOURCE_TOOLTIPS[row.source] : undefined;

  return (
    <tr className="border-b border-white/10">
      <td
        className="px-3 py-2 text-sm text-[#ECECEC] font-medium whitespace-nowrap"
        title={articleTooltip}
      >
        <div className="flex items-center gap-1">
          <span>{row.name}</span>
          {isLinked ? (
            <span className="text-[11px] opacity-70" title={articleTooltip}>
              🔗
            </span>
          ) : null}
        </div>
        {row.linked_article_name ? (
          <div className="text-[10px] text-[#64748b] font-normal mt-0.5">
            ← {row.linked_article_name}
          </div>
        ) : null}
      </td>
      {MONTH_LABELS.map((_, idx) => {
        const month = idx + 1;
        const cell = getCell(row.article_id, month);
        return (
          <MonthCell
            key={month}
            plan={cell.plan}
            fact={cell.fact}
            factEditable={cell.factEditable}
            canEdit={canEdit}
            autoSource={isLinked}
            sourceTooltip={cell.sourceTooltip || articleTooltip}
            planFromSource={cell.planFromSource}
            factFromSource={cell.factFromSource}
            onPlanChange={(v) => onCellChange(row.article_id, month, 'plan', v)}
            onFactChange={(v) => onCellChange(row.article_id, month, 'fact', v)}
          />
        );
      })}
      <td className="px-2 py-2 text-center text-sm">
        <div className="text-[#ECECEC]/90">{formatNum(row.totalPlan)}</div>
        <div
          className="text-xs mt-0.5"
          style={{
            color:
              row.totalPlan > 0 || row.totalFact > 0
                ? row.totalFact >= row.totalPlan
                  ? '#4ade80'
                  : '#f87171'
                : '#64748b',
          }}
        >
          {formatNum(row.totalFact)}
        </div>
      </td>
    </tr>
  );
}

function TotalRow({ label, months, totals, bg, bold }) {
  return (
    <tr style={{ background: bg }} className={bold ? 'font-bold' : ''}>
      <td className="px-3 py-2 text-sm text-[#ECECEC]">{label}</td>
      {months.map((m) => (
        <td key={m} className="px-1 py-2 text-center text-xs text-[#ECECEC]/90">
          <div>{formatNum(totals.plan[m])}</div>
          <div
            className="mt-0.5"
            style={{
              color:
                totals.plan[m] > 0 || totals.fact[m] > 0
                  ? totals.fact[m] >= totals.plan[m]
                    ? '#4ade80'
                    : '#f87171'
                  : '#64748b',
            }}
          >
            {formatNum(totals.fact[m])}
          </div>
        </td>
      ))}
      <td className="px-2 py-2 text-center text-sm text-[#ECECEC]">
        <div>{formatNum(totals.planTotal)}</div>
        <div
          className="mt-0.5"
          style={{
            color:
              totals.planTotal > 0 || totals.factTotal > 0
                ? totals.factTotal >= totals.planTotal
                  ? '#4ade80'
                  : '#f87171'
                : '#64748b',
          }}
        >
          {formatNum(totals.factTotal)}
        </div>
      </td>
    </tr>
  );
}

function buildTotals(rows, months) {
  const plan = {};
  const fact = {};
  months.forEach((m) => {
    plan[m] = 0;
    fact[m] = 0;
  });
  let planTotal = 0;
  let factTotal = 0;
  for (const row of rows) {
    months.forEach((m) => {
      plan[m] += row.months[m]?.plan || 0;
      fact[m] += row.months[m]?.fact || 0;
    });
    planTotal += row.totalPlan;
    factTotal += row.totalFact;
  }
  return { plan, fact, planTotal, factTotal };
}

function subtractTotals(a, b, months) {
  const plan = {};
  const fact = {};
  months.forEach((m) => {
    plan[m] = (a.plan[m] || 0) - (b.plan[m] || 0);
    fact[m] = (a.fact[m] || 0) - (b.fact[m] || 0);
  });
  return {
    plan,
    fact,
    planTotal: a.planTotal - b.planTotal,
    factTotal: a.factTotal - b.factTotal,
  };
}

function profitabilityTotals(profit, revenue, months) {
  const plan = {};
  const fact = {};
  months.forEach((m) => {
    plan[m] =
      revenue.plan[m] > 0 ? Math.round((profit.plan[m] / revenue.plan[m]) * 1000) / 10 : 0;
    fact[m] =
      revenue.fact[m] > 0 ? Math.round((profit.fact[m] / revenue.fact[m]) * 1000) / 10 : 0;
  });
  const planTotal =
    revenue.planTotal > 0 ? Math.round((profit.planTotal / revenue.planTotal) * 1000) / 10 : 0;
  const factTotal =
    revenue.factTotal > 0 ? Math.round((profit.factTotal / revenue.factTotal) * 1000) / 10 : 0;
  return { plan, fact, planTotal, factTotal };
}

export default function FinPlanPage({ canEdit }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showArticles, setShowArticles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setEdits({});
    try {
      const d = await finplanApi.getEntries(year);
      setData(d);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const getCell = useCallback(
    (articleId, month) => {
      const key = cellKey(articleId, month);
      const edit = edits[key];
      const row = data?.rows?.find((r) => r.article_id === articleId);
      const base = row?.months?.[month];
      const planFromEdit = edit?.plan_amount;
      const factFromEdit = edit?.fact_amount;

      return {
        plan: planFromEdit ?? base?.plan_amount ?? 0,
        fact: factFromEdit ?? base?.fact_amount ?? 0,
        factEditable: base?.fact_editable ?? false,
        planFromSource: base?.plan_from_source ?? false,
        factFromSource: base?.fact_from_source ?? false,
        sourceTooltip: base?.source_label
          ? `Данные из: ${base.source_label}`
          : row?.source
            ? SOURCE_TOOLTIPS[row.source]
            : undefined,
      };
    },
    [data, edits]
  );

  const onCellChange = (articleId, month, field, value) => {
    const key = cellKey(articleId, month);
    const base = data?.rows?.find((r) => r.article_id === articleId)?.months?.[month];
    setEdits((prev) => ({
      ...prev,
      [key]: {
        article_id: articleId,
        year,
        month,
        plan_amount:
          field === 'plan'
            ? value
            : prev[key]?.plan_amount ?? base?.plan_amount ?? 0,
        fact_amount:
          field === 'fact'
            ? value
            : prev[key]?.fact_amount ?? base?.fact_amount ?? 0,
      },
    }));
  };

  const mergedRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.map((row) => {
      let totalPlan = 0;
      let totalFact = 0;
      const months = {};
      for (let m = 1; m <= 12; m += 1) {
        const cell = getCell(row.article_id, m);
        months[m] = { plan: cell.plan, fact: cell.fact };
        totalPlan += cell.plan;
        totalFact += cell.fact;
      }
      return { ...row, months, totalPlan, totalFact };
    });
  }, [data, getCell]);

  const revenueRows = mergedRows.filter((r) => r.category === 'revenue');
  const expenseRows = mergedRows.filter((r) => r.category === 'expense');
  const months = data?.months || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const revenueTotals = buildTotals(revenueRows, months);
  const expenseTotals = buildTotals(expenseRows, months);
  const profitTotals = subtractTotals(revenueTotals, expenseTotals, months);
  const marginTotals = profitabilityTotals(profitTotals, revenueTotals, months);

  const handleSave = async () => {
    const items = Object.values(edits);
    if (!items.length) {
      alert('Нет изменений для сохранения');
      return;
    }
    setSaving(true);
    try {
      await finplanApi.saveEntriesBulk(items);
      setEdits({});
      await load();
    } catch (err) {
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="px-3 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] hover:bg-accent-1/40"
          >
            ←
          </button>
          <span className="text-lg font-bold text-[#ECECEC] min-w-[60px] text-center">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="px-3 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] hover:bg-accent-1/40"
          >
            →
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowArticles(true)}
            className="px-4 py-2 rounded-lg bg-accent-1/30 dark:bg-dark-2 text-[#ECECEC] hover:bg-accent-1/40 text-sm font-semibold"
          >
            ⚙️ Управление статьями
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !Object.keys(edits).length}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? 'Сохранение...' : '💾 Сохранить план'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 p-4 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-center text-[#ECECEC]/80">Загрузка...</div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full bg-accent-3/80 dark:bg-dark-900 rounded-xl border border-white/25">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left px-3 py-3 text-sm font-medium text-[#ECECEC] min-w-[140px]">
                  Статья
                </th>
                {MONTH_LABELS.map((label) => (
                  <th
                    key={label}
                    className="text-center px-1 py-3 text-xs font-medium text-[#ECECEC]/90 min-w-[72px]"
                  >
                    {label}
                  </th>
                ))}
                <th className="text-center px-2 py-3 text-sm font-medium text-[#ECECEC] min-w-[80px]">
                  ИТОГО
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-2 text-xs font-bold text-[#4ade80] bg-[#0a2a0a]/50"
                >
                  🟢 ВЫРУЧКА
                </td>
              </tr>
              {revenueRows.map((row) => (
                <DataRow
                  key={row.article_id}
                  row={row}
                  canEdit={canEdit}
                  getCell={getCell}
                  onCellChange={onCellChange}
                />
              ))}
              <TotalRow
                label="ИТОГО ВЫРУЧКА"
                months={months}
                totals={revenueTotals}
                bg="rgba(234, 179, 8, 0.15)"
                bold
              />

              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-2 text-xs font-bold text-[#f87171] bg-[#2a0a0a]/50"
                >
                  🔴 РАСХОДЫ
                </td>
              </tr>
              {expenseRows.map((row) => (
                <DataRow
                  key={row.article_id}
                  row={row}
                  canEdit={canEdit}
                  getCell={getCell}
                  onCellChange={onCellChange}
                />
              ))}
              <TotalRow
                label="ИТОГО РАСХОДЫ"
                months={months}
                totals={expenseTotals}
                bg="rgba(234, 179, 8, 0.15)"
                bold
              />

              <tr>
                <td
                  colSpan={14}
                  className="px-3 py-2 text-xs font-bold text-[#93c5fd] bg-[#0a1628]/80"
                >
                  🔵 ПРИБЫЛЬ
                </td>
              </tr>
              <TotalRow
                label="ВАЛОВАЯ ПРИБЫЛЬ"
                months={months}
                totals={profitTotals}
                bg="rgba(59, 130, 246, 0.2)"
                bold
              />
              <tr style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                <td className="px-3 py-2 text-sm text-[#ECECEC] font-bold">% РЕНТАБЕЛЬНОСТИ</td>
                {months.map((m) => (
                  <td key={m} className="px-1 py-2 text-center text-xs text-[#93c5fd]">
                    <div>{marginTotals.plan[m]}%</div>
                    <div className="mt-0.5 text-[#64748b]">{marginTotals.fact[m]}%</div>
                  </td>
                ))}
                <td className="px-2 py-2 text-center text-sm text-[#93c5fd]">
                  <div>{marginTotals.planTotal}%</div>
                  <div className="mt-0.5 text-[#64748b]">{marginTotals.factTotal}%</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-[#ECECEC]/80">Нет данных</div>
      )}

      {showArticles ? (
        <FinPlanArticlesModal
          onClose={() => setShowArticles(false)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
