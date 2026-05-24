/**
 * Сохранение ячейки платёжного календаря — та же логика, что PUT /api/payment-calendar/cell
 */

function normSub(v) {
  return v != null ? String(v).trim() : '';
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function generateWeeks2026() {
  const weeks = [];
  const date = new Date('2025-12-29T12:00:00');
  for (let w = 1; w <= 52; w++) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    weeks.push({
      number: w,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    date.setDate(date.getDate() + 7);
  }
  return weeks;
}

const WEEKS_2026 = generateWeeks2026();

const PAYMENT_CALENDAR_YEAR = 2026;

function weekMetaForNumber(weekNumber) {
  const n = parseInt(weekNumber, 10);
  return WEEKS_2026.find((w) => w.number === n) || WEEKS_2026[0];
}

function weekNumberForDate(isoDate) {
  const iso = String(isoDate || '').slice(0, 10);
  if (!iso) return null;
  for (const w of WEEKS_2026) {
    if (iso >= w.start && iso <= w.end) return w.number;
  }
  return null;
}

/**
 * Тело запроса как при ручном вводе (api.paymentCalendar.saveCell).
 * @returns {Promise<import('sequelize').Model>}
 */
async function upsertPaymentCalendarCell(PaymentCalendar, body) {
  const {
    year = PAYMENT_CALENDAR_YEAR,
    week_number,
    week_start,
    week_end,
    category,
    subcategory,
    plan,
    fact,
    note,
  } = body || {};

  if (!category || week_number == null) {
    throw new Error('category и week_number обязательны');
  }

  const y = parseInt(year, 10) || PAYMENT_CALENDAR_YEAR;
  const wn = parseInt(week_number, 10);
  const sub = normSub(subcategory);
  const meta = weekMetaForNumber(wn);

  let row = await PaymentCalendar.findOne({
    where: {
      year: y,
      week_number: wn,
      category: String(category),
      subcategory: sub,
    },
  });

  const payload = {
    year: y,
    week_number: wn,
    week_start: week_start || meta.start,
    week_end: week_end || meta.end,
    category: String(category),
    subcategory: sub,
    plan: plan != null ? toNum(plan) : undefined,
    fact: fact != null ? toNum(fact) : undefined,
    note: note != null ? note : undefined,
  };

  if (row) {
    const update = {};
    if (plan != null) update.plan = toNum(plan);
    if (fact != null) update.fact = toNum(fact);
    if (note !== undefined) update.note = note;
    if (payload.week_start) update.week_start = payload.week_start;
    if (payload.week_end) update.week_end = payload.week_end;
    await row.update(update);
    return row;
  }

  return PaymentCalendar.create({
    ...payload,
    plan: plan != null ? toNum(plan) : 0,
    fact: fact != null ? toNum(fact) : 0,
    note: note || null,
  });
}

/** Добавить сумму к плану основной ячейки (subcategory '') */
async function addToMainPlanCell(PaymentCalendar, { category, week_number, addPlan, note }) {
  const delta = toNum(addPlan);
  if (delta === 0) return null;

  const y = PAYMENT_CALENDAR_YEAR;
  const wn = parseInt(week_number, 10);
  const meta = weekMetaForNumber(wn);
  const main = await PaymentCalendar.findOne({
    where: {
      year: y,
      week_number: wn,
      category: String(category),
      subcategory: '',
    },
  });

  const nextPlan = toNum(main?.plan) + delta;

  return upsertPaymentCalendarCell(PaymentCalendar, {
    year: y,
    week_number: wn,
    week_start: meta.start,
    week_end: meta.end,
    category: String(category),
    subcategory: '',
    plan: nextPlan,
    fact: main ? toNum(main.fact) : 0,
    note: note != null ? note : main?.note,
  });
}

module.exports = {
  normSub,
  toNum,
  PAYMENT_CALENDAR_YEAR,
  weekMetaForNumber,
  weekNumberForDate,
  upsertPaymentCalendarCell,
  addToMainPlanCell,
};
