/**
 * Синхронизация «Планирование расходов» → платёжный календарь.
 * subcategory: expense_plan_{id} — не пересекается с order_* (отделы).
 */

const {
  PAYMENT_CALENDAR_YEAR,
  weekNumberForDate,
  toNum,
  addToMainPlanCell,
  upsertPaymentCalendarCell,
} = require('./paymentCalendarCell');
const {
  categoryKeyFromArticleLabel,
  customCategoryKeyFromLabel,
  UNMATCHED_EXPENSE_CATEGORY,
} = require('./paymentCalendarExpenseArticles');

/** Основная ячейка = сумма order_* — не трогаем при синхронизации из финансов */
const DEPARTMENT_CATEGORIES = new Set([
  'supplier_fabric',
  'supplier_madina',
  'dept_cutting',
  'dept_sewing',
  'dept_otk',
]);

/**
 * Статья расхода → ключ строки календаря.
 * 1) точное совпадение названия с каталогом календаря
 * 2) пользовательская строка custom_{название}
 * 3) null → только сводка «Плановые расходы»
 */
async function resolveExpensePlanCategory(PaymentCalendar, article) {
  const fromCatalog = categoryKeyFromArticleLabel(article);
  if (fromCatalog) return fromCatalog;

  const customKey = customCategoryKeyFromLabel(article);
  if (customKey) {
    const customRow = await PaymentCalendar.findOne({
      where: { category: customKey },
      attributes: ['id'],
    });
    if (customRow) return customKey;
  }

  return null;
}

/** @deprecated используйте resolveExpensePlanCategory */
function articleToCategory(article) {
  return categoryKeyFromArticleLabel(article);
}

function resolveWeekNumber(plan) {
  const fromDate = weekNumberForDate(plan.plan_date);
  if (fromDate) return fromDate;
  const fromField = parseInt(plan.week_number, 10);
  if (fromField >= 1 && fromField <= 52) return fromField;
  const iso = String(plan.plan_date || '').slice(0, 10);
  return weekNumberForDate(iso) || null;
}

function buildExpenseNote(plan) {
  const parts = [
    'Планирование расходов',
    plan.article,
    plan.tz ? `ТЗ ${plan.tz}` : null,
    plan.supplier ? plan.supplier : null,
    plan.employee ? plan.employee : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function normalizeExpensePlanPayload(body) {
  const week_number = resolveWeekNumber(body || {});
  return {
    ...body,
    week_number,
    year: parseInt(body?.year, 10) || PAYMENT_CALENDAR_YEAR,
    amount: toNum(body?.amount),
  };
}

async function clearExpensePlanDetailRows(PaymentCalendar, planId) {
  const detailRows = await PaymentCalendar.findAll({
    where: {
      subcategory: `expense_plan_${planId}`,
    },
  });

  for (const row of detailRows) {
    if (!DEPARTMENT_CATEGORIES.has(row.category)) {
      await addToMainPlanCell(PaymentCalendar, {
        category: row.category,
        week_number: row.week_number,
        addPlan: -toNum(row.plan),
      });
    }
    await row.destroy();
  }

  return detailRows.length;
}

async function syncExpensePlanToPaymentCalendar(PaymentCalendar, plan) {
  const planId = plan.id;
  if (!planId) return;

  const matchedCategory = await resolveExpensePlanCategory(PaymentCalendar, plan.article);
  const category = matchedCategory || UNMATCHED_EXPENSE_CATEGORY;
  const week_number = resolveWeekNumber(plan);
  const amountForThisWeek = toNum(plan.amount);

  if (!week_number || amountForThisWeek <= 0) return;

  await clearExpensePlanDetailRows(PaymentCalendar, planId);

  const subcategory = `expense_plan_${planId}`;
  const note = buildExpenseNote(plan);

  await upsertPaymentCalendarCell(PaymentCalendar, {
    year: parseInt(plan.year, 10) || PAYMENT_CALENDAR_YEAR,
    week_number,
    category,
    subcategory,
    plan: amountForThisWeek,
    fact: 0,
    note,
  });

  if (matchedCategory && !DEPARTMENT_CATEGORIES.has(matchedCategory)) {
    await addToMainPlanCell(PaymentCalendar, {
      category: matchedCategory,
      week_number,
      addPlan: amountForThisWeek,
      note,
    });
  }
}

async function removeExpensePlanFromPaymentCalendar(PaymentCalendar, plan) {
  const planId = plan.id;
  if (!planId) return;
  await clearExpensePlanDetailRows(PaymentCalendar, planId);
}

async function recalculateAllExpensePlans(PaymentCalendar, ExpensePlan) {
  const plans = await ExpensePlan.findAll();
  for (const plan of plans) {
    await removeExpensePlanFromPaymentCalendar(PaymentCalendar, plan);
  }
  for (const plan of plans) {
    await syncExpensePlanToPaymentCalendar(PaymentCalendar, plan);
  }
}

module.exports = {
  DEPARTMENT_CATEGORIES,
  UNMATCHED_EXPENSE_CATEGORY,
  articleToCategory,
  resolveExpensePlanCategory,
  normalizeExpensePlanPayload,
  syncExpensePlanToPaymentCalendar,
  removeExpensePlanFromPaymentCalendar,
  recalculateAllExpensePlans,
};
