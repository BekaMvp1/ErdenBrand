/**
 * Платёжный календарь по неделям
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const PaymentCalendar = db.PaymentCalendar;
const { upsertPaymentCalendarCell } = require('../utils/paymentCalendarCell');

const router = express.Router();

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

function weekMetaForNumber(weekNumber) {
  const n = parseInt(weekNumber, 10);
  return WEEKS_2026.find((w) => w.number === n) || WEEKS_2026[0];
}

const STAGE_CATEGORY = {
  Закуп: 'supplier_fabric',
  Раскрой: 'dept_cutting',
  Пошив: 'dept_sewing',
  ОТК: 'dept_otk',
  procurement: 'supplier_fabric',
  purchase: 'supplier_fabric',
  cutting: 'dept_cutting',
  sewing: 'dept_sewing',
  otk: 'dept_otk',
};

/** Подписи строк в UI платёжного календаря (PaymentCalendar.jsx SECTIONS) */
const STAGE_ROW_LABEL = {
  cutting: 'ЗП раскройного отдела',
  sewing: 'ЗП пошивного отдела',
  otk: 'ЗП отдела ОТК',
  purchase: 'Поставщики материала',
  procurement: 'Поставщики материала',
  dept_cutting: 'ЗП раскройного отдела',
  dept_sewing: 'ЗП пошивного отдела',
  dept_otk: 'ЗП отдела ОТК',
  supplier_fabric: 'Ткань дордой',
};

const WRITE_ROW_CATEGORIES = new Set([
  'dept_cutting',
  'dept_sewing',
  'dept_otk',
  'supplier_fabric',
]);

function orderSubcategory(orderId) {
  return `order_${orderId}`;
}

function categoryForStage(stage) {
  return STAGE_CATEGORY[stage] || STAGE_CATEGORY[String(stage || '').trim()] || null;
}

/** Перенос записи заказа на неделю: удалить старые, создать новую, пересчитать итоги всех затронутых недель. */
async function moveOrderPaymentToWeek({
  orderId,
  category,
  year,
  weekNumber,
  planVal,
  note,
}) {
  const orderSub = orderSubcategory(orderId);
  const weekMeta = weekMetaForNumber(weekNumber);

  const existing = await PaymentCalendar.findAll({
    where: { category, subcategory: orderSub },
  });

  const affectedWeeks = new Map();
  for (const row of existing) {
    affectedWeeks.set(`${row.year}-${row.week_number}`, {
      year: row.year,
      weekNumber: row.week_number,
    });
  }
  affectedWeeks.set(`${year}-${weekNumber}`, { year, weekNumber });

  await PaymentCalendar.destroy({
    where: { category, subcategory: orderSub },
  });

  let upsertResult = null;
  if (planVal > 0) {
    upsertResult = await upsertOrderPaymentCell({
      year,
      weekNumber,
      category,
      orderSub,
      planVal,
      note,
      weekMeta,
    });
  }

  const aggregates = [];
  for (const { year: y, weekNumber: wn } of affectedWeeks.values()) {
    const agg = await syncMainRowAggregate(y, wn, category);
    aggregates.push({ year: y, week_number: wn, totalPlan: agg.totalPlan });
  }

  return { upsertResult, affectedWeeks: [...affectedWeeks.values()], aggregates };
}

/** Итог в основную строку статьи (subcategory '') = сумма всех order_* за неделю. */
async function syncMainRowAggregate(year, weekNumber, category) {
  const orderRows = await PaymentCalendar.findAll({
    where: {
      year,
      week_number: weekNumber,
      category,
      subcategory: { [Op.like]: 'order_%' },
    },
  });

  const totalPlan = orderRows.reduce((s, r) => s + toNum(r.plan), 0);
  const totalFact = orderRows.reduce((s, r) => s + toNum(r.fact), 0);
  const weekMeta = weekMetaForNumber(weekNumber);

  const mainRow = await PaymentCalendar.findOne({
    where: { year, week_number: weekNumber, category, subcategory: '' },
  });

  if (orderRows.length === 0 && !mainRow) return { totalPlan: 0 };

  const payload = {
    year,
    week_number: weekNumber,
    week_start: weekMeta.start,
    week_end: weekMeta.end,
    category,
    subcategory: '',
    plan: totalPlan,
    fact: totalFact,
    note: `Итого по заказам (${orderRows.length})`,
  };

  if (mainRow) {
    await mainRow.update(payload);
    return { totalPlan, mainRowId: mainRow.id, action: 'updated' };
  }
  if (totalPlan > 0) {
    const created = await PaymentCalendar.create(payload);
    return { totalPlan, mainRowId: created.id, action: 'created' };
  }
  return { totalPlan: 0 };
}

async function upsertOrderPaymentCell({
  year,
  weekNumber,
  category,
  orderSub,
  planVal,
  note,
  weekMeta,
}) {
  let row = await PaymentCalendar.findOne({
    where: {
      year,
      week_number: weekNumber,
      category,
      subcategory: orderSub,
    },
  });

  const payload = {
    year,
    week_number: weekNumber,
    week_start: weekMeta.start,
    week_end: weekMeta.end,
    category,
    subcategory: orderSub,
    plan: planVal,
    fact: row ? toNum(row.fact) : 0,
    note,
  };

  if (row) {
    await row.update(payload);
    return { row, action: 'updated' };
  }
  row = await PaymentCalendar.create(payload);
  return { row, action: 'created' };
}

function parseOrderIdFromSubcategory(subcategory) {
  const m = String(subcategory || '').match(/^order_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function parseOrderNumberFromNote(note) {
  const m = String(note || '').match(/№\s*([^.,]+)/);
  return m ? m[1].trim() : null;
}

/**
 * GET /api/payment-calendar/by-week?week_number=&year=&category=|stage=
 * Список заказов (order_*) за неделю и статью.
 */
router.get('/by-week', async (req, res, next) => {
  try {
    const { stage, week_number, year, category } = req.query;
    const y = parseInt(year, 10) || 2026;
    const wn = parseInt(week_number, 10);
    if (!Number.isFinite(wn)) {
      return res.status(400).json({ error: 'week_number обязателен' });
    }

    let cat = category ? String(category).trim() : '';
    if (!cat && stage) cat = categoryForStage(stage) || '';
    if (!cat) {
      return res.status(400).json({ error: 'category или stage обязателен' });
    }

    const rows = await PaymentCalendar.findAll({
      where: {
        year: y,
        week_number: wn,
        category: cat,
        subcategory: { [Op.like]: 'order_%' },
      },
      order: [['plan', 'DESC']],
    });

    const orderIds = rows
      .map((r) => parseOrderIdFromSubcategory(r.subcategory))
      .filter((id) => id != null);

    const orders =
      orderIds.length > 0
        ? await db.Order.findAll({
            where: { id: orderIds },
            attributes: [
              'id',
              'tz_code',
              'model_name',
              'title',
              'quantity',
              'total_quantity',
            ],
            include: [{ model: db.Client, attributes: ['name'] }],
          })
        : [];

    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const result = rows.map((row) => {
      const orderId = parseOrderIdFromSubcategory(row.subcategory);
      const order = orderId != null ? orderMap.get(orderId) : null;
      const plan = toNum(row.plan);
      return {
        order_id: orderId,
        order_number:
          order?.tz_code ||
          parseOrderNumberFromNote(row.note) ||
          (orderId != null ? String(orderId) : ''),
        order_name: order?.model_name || order?.title || null,
        quantity: order?.total_quantity ?? order?.quantity ?? null,
        client: order?.Client?.name || null,
        amount: plan,
        category: row.category,
        week_number: row.week_number,
        year: row.year,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[by-week]:', err.message);
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year, 10) || 2026;
    const rows = await PaymentCalendar.findAll({
      where: { year },
      order: [
        ['week_number', 'ASC'],
        ['category', 'ASC'],
        ['subcategory', 'ASC'],
      ],
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payment-calendar/from-order
 * Запись суммы заказа в ячейку недели (без дублирования по order_id).
 */
router.post('/from-order', async (req, res, next) => {
  try {
    const {
      order_id,
      order_number,
      order_name,
      amount,
      week_number,
      year = 2026,
      plan_date,
      client,
      stage,
    } = req.body || {};

    if (!order_id || week_number == null) {
      return res.status(400).json({ error: 'order_id и week_number обязательны' });
    }

    const y = parseInt(year, 10) || 2026;
    const wn = parseInt(week_number, 10);
    const category = STAGE_CATEGORY[stage] || STAGE_CATEGORY[String(stage || '').trim()] || 'supplier_fabric';
    const subcategory = `order_${order_id}`;
    const weekMeta = weekMetaForNumber(wn);
    const planVal = Math.round(toNum(amount));

    const noteParts = [
      `Авто из планирования расходов — ${stage || '—'}`,
      order_number ? `№ ${order_number}` : null,
      order_name ? order_name : null,
      client ? `Клиент: ${client}` : null,
      plan_date ? `План: ${String(plan_date).slice(0, 10)}` : null,
    ].filter(Boolean);

    const { upsertResult, aggregates } = await moveOrderPaymentToWeek({
      orderId: order_id,
      category,
      year: y,
      weekNumber: wn,
      planVal,
      note: noteParts.join('. '),
    });

    res.json({
      ok: true,
      action: upsertResult?.action || 'removed',
      id: upsertResult?.row?.id,
      week_number: wn,
      category,
      aggregated_plan: aggregates.find((a) => a.week_number === wn)?.totalPlan ?? 0,
      affected_weeks: aggregates,
    });
  } catch (err) {
    console.error('[from-order]:', err.message);
    next(err);
  }
});

/**
 * POST /api/payment-calendar/write-to-row
 * Запись суммы в статью недели (dept_cutting / dept_sewing / dept_otk).
 * Основная строка: subcategory '' — «ЗП … отдела».
 * Повторная отправка того же order_id обновляет вклад заказа без двойного суммирования.
 */
router.post('/write-to-row', async (req, res, next) => {
  const t0 = Date.now();
  try {
    const {
      stage,
      week_number,
      year = 2026,
      amount,
      order_id,
      order_number,
      order_name,
      client,
      plan_date,
    } = req.body || {};

    const category = categoryForStage(stage);
    if (!category || !WRITE_ROW_CATEGORIES.has(category)) {
      return res.status(400).json({
        error: `Unknown stage for payment row: ${stage}`,
      });
    }

    if (week_number == null) {
      return res.status(400).json({ error: 'week_number обязателен' });
    }

    const y = parseInt(year, 10) || 2026;
    const wn = parseInt(week_number, 10);
    const planVal = Math.round(toNum(amount));
    if (planVal <= 0) {
      return res.status(400).json({ error: 'amount должен быть больше 0' });
    }

    const weekMeta = weekMetaForNumber(wn);
    const rowLabel = STAGE_ROW_LABEL[stage] || STAGE_ROW_LABEL[category] || category;
    const orderSub = order_id != null ? `order_${order_id}` : '';

    const noteParts = [
      `Из планирования расходов — ${rowLabel}`,
      order_number ? `№ ${order_number}` : null,
      order_name ? order_name : null,
      client ? `Клиент: ${client}` : null,
      plan_date ? `План: ${String(plan_date).slice(0, 10)}` : null,
    ].filter(Boolean);

    if (!orderSub) {
      return res.status(400).json({ error: 'order_id обязателен' });
    }

    const { upsertResult, aggregates } = await moveOrderPaymentToWeek({
      orderId: order_id,
      category,
      year: y,
      weekNumber: wn,
      planVal,
      note: noteParts.join('. '),
    });

    const aggNew = aggregates.find((a) => a.week_number === wn);

    console.log(
      `[payment-calendar write-to-row] ${Date.now() - t0}ms stage=${stage} category=${category} week=${wn} order=${planVal} total=${aggNew?.totalPlan ?? 0} ${upsertResult?.action || 'removed'}`
    );

    res.json({
      ok: true,
      action: upsertResult?.action || 'removed',
      category,
      rowLabel,
      week_number: wn,
      year: y,
      plan: planVal,
      aggregated_plan: aggNew?.totalPlan ?? 0,
      affected_weeks: aggregates,
      id: upsertResult?.row?.id,
    });
  } catch (err) {
    console.error('[write-to-row]:', err.message);
    next(err);
  }
});

/**
 * POST /api/payment-calendar/update-order-week
 * Перенос заказа на другую неделю: удаление старых записей, новая запись, пересчёт итогов.
 */
router.post('/update-order-week', async (req, res, next) => {
  const t0 = Date.now();
  try {
    const {
      order_id,
      stage,
      week_number,
      year = 2026,
      amount,
      order_number,
      order_name,
      client,
      plan_date,
    } = req.body || {};

    if (!order_id || week_number == null) {
      return res.status(400).json({ error: 'order_id и week_number обязательны' });
    }

    const category = categoryForStage(stage);
    if (!category || !WRITE_ROW_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Unknown stage: ${stage}` });
    }

    const y = parseInt(year, 10) || 2026;
    const wn = parseInt(week_number, 10);
    const planVal = Math.round(toNum(amount));
    const rowLabel = STAGE_ROW_LABEL[stage] || STAGE_ROW_LABEL[category] || category;

    const noteParts = [
      `Из планирования расходов — ${rowLabel}`,
      order_number ? `№ ${order_number}` : null,
      order_name ? order_name : null,
      client ? `Клиент: ${client}` : null,
      plan_date ? `План: ${String(plan_date).slice(0, 10)}` : null,
    ].filter(Boolean);

    const { upsertResult, aggregates } = await moveOrderPaymentToWeek({
      orderId: order_id,
      category,
      year: y,
      weekNumber: wn,
      planVal,
      note: noteParts.join('. '),
    });

    console.log(
      `[payment-calendar update-order-week] ${Date.now() - t0}ms order=${order_id} week=${wn} affected=${aggregates.length}`
    );

    res.json({
      ok: true,
      action: upsertResult?.action || 'removed',
      week_number: wn,
      year: y,
      category,
      affected_weeks: aggregates,
    });
  } catch (err) {
    console.error('[update-order-week]:', err.message);
    next(err);
  }
});

router.put('/cell', async (req, res, next) => {
  try {
    const row = await upsertPaymentCalendarCell(PaymentCalendar, req.body);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('обязательны')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
