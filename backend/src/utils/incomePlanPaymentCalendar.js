/**
 * Синхронизация плановых поступлений → платёжный календарь
 * (таблица payment_calendar, как PUT /api/payment-calendar/cell)
 */

const { Op } = require('sequelize');
const {
  PAYMENT_CALENDAR_YEAR,
  weekNumberForDate,
  toNum,
  addToMainPlanCell,
  upsertPaymentCalendarCell,
} = require('./paymentCalendarCell');

const ARTICLE_TO_CATEGORY = {
  'План к перечислению ВБ': 'income_wb',
  'Получение займа': 'income_loan',
  'План поступление заказчики': 'income_clients',
  'План поступление МСК': 'income_msk',
  'Досрочный вывод по кнопке': 'income_early',
  'Другие поступления': 'income_other',
};

function articleToCategory(article) {
  return ARTICLE_TO_CATEGORY[String(article || '').trim()] || 'income_clients';
}

function parsePlanDates(plan) {
  const raw = plan?.dates;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function resolveWeekNumber(dateItem) {
  const fromField = parseInt(dateItem.week_number, 10);
  if (fromField >= 1 && fromField <= 52) return fromField;
  const iso = String(dateItem.date || '').slice(0, 10);
  return weekNumberForDate(iso) || null;
}

function normalizeIncomePlanDates(dates) {
  return (Array.isArray(dates) ? dates : []).map((d) => {
    const iso = String(d.date || '').slice(0, 10);
    const week_number = resolveWeekNumber({ ...d, date: iso });
    return {
      ...d,
      date: iso || d.date,
      week_number: week_number || d.week_number,
      year: PAYMENT_CALENDAR_YEAR,
      amount: toNum(d.amount),
    };
  });
}

/** Убрать детальные строки плана (income_plan_{id}_{week}) из календаря */
async function clearPlanDetailRows(PaymentCalendar, planId) {
  const detailRows = await PaymentCalendar.findAll({
    where: {
      subcategory: { [Op.like]: `income_plan_${planId}_%` },
    },
  });

  for (const row of detailRows) {
    await addToMainPlanCell(PaymentCalendar, {
      category: row.category,
      week_number: row.week_number,
      addPlan: -toNum(row.plan),
    });
    await row.destroy();
  }

  return detailRows.length;
}

async function syncIncomePlanToPaymentCalendar(PaymentCalendar, plan) {
  const planId = plan.id;
  if (!planId) return;

  const category = articleToCategory(plan.article);
  const dates = parsePlanDates(plan);
  const client = String(plan.client || '').trim();
  const note = client
    ? `Плановое поступление: ${client}`
    : 'Плановое поступление';

  await clearPlanDetailRows(PaymentCalendar, planId);

  for (const dateItem of dates) {
    const week_number = resolveWeekNumber(dateItem);
    if (!week_number || dateItem.amount == null || dateItem.amount === '') {
      continue;
    }

    const amountForThisWeek = toNum(dateItem.amount);
    if (amountForThisWeek <= 0) continue;

    console.log(
      '[income-plans] week:',
      week_number,
      'amount:',
      amountForThisWeek
    );

    const subcategory = `income_plan_${planId}_${week_number}`;

    await upsertPaymentCalendarCell(PaymentCalendar, {
      year: PAYMENT_CALENDAR_YEAR,
      week_number,
      category,
      subcategory,
      plan: amountForThisWeek,
      fact: 0,
      note,
    });

    await addToMainPlanCell(PaymentCalendar, {
      category,
      week_number,
      addPlan: amountForThisWeek,
      note,
    });

    console.log(
      '[income-plans] updated calendar',
      category,
      'week',
      week_number,
      '=',
      amountForThisWeek
    );
  }
}

async function removeIncomePlanFromPaymentCalendar(PaymentCalendar, plan) {
  const planId = plan.id;
  if (!planId) return;

  const category = articleToCategory(plan.article);
  const hadDetail = await clearPlanDetailRows(PaymentCalendar, planId);

  if (hadDetail > 0) return;

  for (const dateItem of parsePlanDates(plan)) {
    const week_number = resolveWeekNumber(dateItem);
    if (!week_number) continue;

    const amountForThisWeek = toNum(dateItem.amount);
    if (amountForThisWeek <= 0) continue;

    await addToMainPlanCell(PaymentCalendar, {
      category,
      week_number,
      addPlan: -amountForThisWeek,
    });
  }
}

async function recalculateAllIncomePlans(PaymentCalendar, IncomePlan) {
  const plans = await IncomePlan.findAll();
  for (const plan of plans) {
    await removeIncomePlanFromPaymentCalendar(PaymentCalendar, plan);
  }
  for (const plan of plans) {
    await syncIncomePlanToPaymentCalendar(PaymentCalendar, plan);
  }
}

module.exports = {
  ARTICLE_TO_CATEGORY,
  articleToCategory,
  PAYMENT_CALENDAR_YEAR,
  normalizeIncomePlanDates,
  syncIncomePlanToPaymentCalendar,
  removeIncomePlanFromPaymentCalendar,
  recalculateAllIncomePlans,
};
