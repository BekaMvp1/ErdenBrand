/**
 * Синхронизация «Планирование расходов» → платёжный календарь.
 * subcategory: expense_plan_{id} — не пересекается с order_* (отделы).
 */

const { Op } = require('sequelize');
const {
  PAYMENT_CALENDAR_YEAR,
  weekNumberForDate,
  toNum,
  addToMainPlanCell,
  upsertPaymentCalendarCell,
} = require('./paymentCalendarCell');

/** Статья расхода → ключ строки в PaymentCalendar.jsx */
const ARTICLE_TO_CATEGORY = {
  'Поставщики материала': 'supplier_fabric',
  Аренда: 'ops_rent',
  'Зарплата сотрудников': 'fot_rop',
  'Транспортные расходы': 'ops_rent',
  'Коммунальные услуги': 'ops_rent',
  'Маркетинг и реклама': 'marketing_telegram',
  'Оборудование и ремонт': 'ops_rent',
  'Налоги и взносы': 'ops_rent',
  'Кредитные выплаты': 'credit_ayil',
  'Прочие расходы': 'ops_rent',
};

/** Основная ячейка = сумма order_* — не трогаем при синхронизации из финансов */
const DEPARTMENT_CATEGORIES = new Set([
  'supplier_fabric',
  'supplier_madina',
  'dept_cutting',
  'dept_sewing',
  'dept_otk',
]);

function articleToCategory(article) {
  return ARTICLE_TO_CATEGORY[String(article || '').trim()] || 'ops_rent';
}

function resolveWeekNumber(plan) {
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

  const category = articleToCategory(plan.article);
  const week_number = resolveWeekNumber(plan);
  const amountForThisWeek = toNum(plan.amount);

  if (!week_number || amountForThisWeek <= 0) return;

  console.log(
    '[expense-plans] week:',
    week_number,
    'amount:',
    amountForThisWeek,
    'category:',
    category
  );

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

  if (!DEPARTMENT_CATEGORIES.has(category)) {
    await addToMainPlanCell(PaymentCalendar, {
      category,
      week_number,
      addPlan: amountForThisWeek,
      note,
    });
  }

  console.log(
    '[expense-plans] записано в payment_calendar',
    'plan:',
    planId,
    'week:',
    week_number,
    'amount:',
    amountForThisWeek
  );
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
  ARTICLE_TO_CATEGORY,
  DEPARTMENT_CATEGORIES,
  articleToCategory,
  normalizeExpensePlanPayload,
  syncExpensePlanToPaymentCalendar,
  removeExpensePlanFromPaymentCalendar,
  recalculateAllExpensePlans,
};
