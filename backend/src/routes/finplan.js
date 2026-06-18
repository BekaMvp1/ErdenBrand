/**
 * Финплан — годовая таблица план/факт по статьям
 * Монтируется: /api/finance/finplan
 */

const express = require('express');
const db = require('../models');

const FinPlanArticle = require('../models/FinPlanArticle')(
  db.sequelize,
  db.Sequelize.DataTypes
);
const FinPlanEntry = require('../models/FinPlanEntry')(
  db.sequelize,
  db.Sequelize.DataTypes
);

FinPlanArticle.hasMany(FinPlanEntry, { foreignKey: 'article_id', as: 'Entries' });
FinPlanEntry.belongsTo(FinPlanArticle, { foreignKey: 'article_id', as: 'Article' });

const router = express.Router();

const DEFAULT_ARTICLES = [
  {
    name: 'Продажи Wildberries',
    category: 'revenue',
    source: 'planned_income',
    linked_article_name: 'План к перечислению ВБ',
    sort_order: 1,
  },
  {
    name: 'Заказы от заказчиков',
    category: 'revenue',
    source: 'planned_income',
    linked_article_name: 'План поступление заказчики',
    sort_order: 2,
  },
  { name: 'Оптовые продажи', category: 'revenue', source: 'manual', sort_order: 3 },
  {
    name: 'Ткань и фурнитура',
    category: 'expense',
    source: 'planned_expense',
    linked_article_name: 'Поставщики материала',
    sort_order: 10,
  },
  {
    name: 'Зарплата швей',
    category: 'expense',
    source: 'planned_expense',
    linked_article_name: 'Зарплата сотрудников',
    sort_order: 11,
  },
  { name: 'Аренда', category: 'expense', source: 'manual', sort_order: 12 },
  { name: 'Электричество', category: 'expense', source: 'manual', sort_order: 13 },
  { name: 'Налоги', category: 'expense', source: 'manual', sort_order: 14 },
  { name: 'Реклама', category: 'expense', source: 'manual', sort_order: 15 },
  { name: 'Прочие расходы', category: 'expense', source: 'manual', sort_order: 16 },
];

function toMoney(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function ensureDefaultArticles() {
  const count = await FinPlanArticle.count({ where: { is_active: true } });
  if (count > 0) return;
  await FinPlanArticle.bulkCreate(DEFAULT_ARTICLES);
}

function matchesLinkedArticle(planArticle, linkedArticleName) {
  if (!linkedArticleName) return false;
  if (!planArticle) return false;
  return String(planArticle).trim() === String(linkedArticleName).trim();
}

function normalizeLinkedName(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  return s || null;
}

function parseLinkedArticleName(body) {
  if (!('linked_article_name' in (body || {}))) return undefined;
  return normalizeLinkedName(body.linked_article_name);
}

function emptyMonthBuckets() {
  const plan = {};
  const fact = {};
  for (let m = 1; m <= 12; m += 1) {
    plan[m] = 0;
    fact[m] = 0;
  }
  return { plan, fact };
}

function parsePlanDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Плановое поступление (IncomePlan / income_plans):
 * status 'done' → факт, status 'planned' → план
 */
async function getIncomeByMonth(year, linkedArticleName) {
  const result = emptyMonthBuckets();
  const plans = await db.IncomePlan.findAll();

  for (const p of plans) {
    if (!matchesLinkedArticle(p.article, linkedArticleName)) continue;

    const isDone = p.status === 'done';
    const isPlanned = p.status === 'planned';
    const dates = Array.isArray(p.dates) ? p.dates : [];

    if (dates.length) {
      for (const d of dates) {
        const dt = parsePlanDate(d?.date);
        if (!dt || dt.getFullYear() !== year) continue;
        const month = dt.getMonth() + 1;
        const amt = toMoney(d.amount);
        if (amt <= 0) continue;
        if (isDone) result.fact[month] += amt;
        else if (isPlanned) result.plan[month] += amt;
      }
      continue;
    }

    if (!p.total_amount) continue;
    const dt = parsePlanDate(p.created_at);
    if (!dt || dt.getFullYear() !== year) continue;
    const month = dt.getMonth() + 1;
    const amt = toMoney(p.total_amount);
    if (isDone) result.fact[month] += amt;
    else if (isPlanned) result.plan[month] += amt;
  }

  return result;
}

/**
 * Планирование расходов (ExpensePlan / expense_plans):
 * status 'paid' → факт, status 'planned' → план
 */
async function getExpenseByMonth(year, linkedArticleName) {
  const result = emptyMonthBuckets();
  const plans = await db.ExpensePlan.findAll();

  for (const e of plans) {
    if (!matchesLinkedArticle(e.article, linkedArticleName)) continue;

    const dt = parsePlanDate(e.plan_date);
    if (!dt || dt.getFullYear() !== year) continue;
    const month = dt.getMonth() + 1;
    const amt = toMoney(e.amount);
    if (amt <= 0) continue;

    if (e.status === 'paid') result.fact[month] += amt;
    else if (e.status === 'planned') result.plan[month] += amt;
  }

  return result;
}

function resolveMonthCell(article, month, entry, autoData) {
  const manualPlan = toMoney(entry?.plan_amount);
  const manualFact = toMoney(entry?.fact_amount);

  if (article.source === 'manual') {
    return {
      plan_amount: manualPlan,
      fact_amount: manualFact,
      plan_manual: true,
      fact_editable: true,
      plan_from_source: false,
      fact_from_source: false,
      source_label: null,
    };
  }

  const autoPlan = toMoney(autoData?.plan?.[month]);
  const autoFact = toMoney(autoData?.fact?.[month]);
  const planManual = manualPlan > 0;
  const planAmount = planManual ? manualPlan : autoPlan;
  const sourceLabel =
    article.source === 'planned_income'
      ? 'Плановое поступление'
      : 'Планирование расходов';

  return {
    plan_amount: planAmount,
    fact_amount: autoFact,
    plan_manual: planManual,
    fact_editable: false,
    plan_from_source: !planManual && autoPlan > 0,
    fact_from_source: autoFact > 0,
    auto_plan_amount: autoPlan,
    auto_fact_amount: autoFact,
    source_label: sourceLabel,
  };
}

/** GET /source-articles — уникальные статьи из источников */
router.get('/source-articles', async (req, res) => {
  try {
    const [incomeRows, expenseRows] = await Promise.all([
      db.IncomePlan.findAll({ attributes: ['article'], raw: true }),
      db.ExpensePlan.findAll({ attributes: ['article'], raw: true }),
    ]);

    const planned_income = [
      ...new Set(
        incomeRows.map((r) => r.article).filter((a) => a && String(a).trim())
      ),
    ]
      .map((a) => String(a).trim())
      .sort((a, b) => a.localeCompare(b, 'ru'));

    const planned_expense = [
      ...new Set(
        expenseRows.map((r) => r.article).filter((a) => a && String(a).trim())
      ),
    ]
      .map((a) => String(a).trim())
      .sort((a, b) => a.localeCompare(b, 'ru'));

    res.json({ planned_income, planned_expense });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /articles */
router.get('/articles', async (req, res) => {
  try {
    await ensureDefaultArticles();
    const articles = await FinPlanArticle.findAll({
      where: { is_active: true },
      order: [
        ['category', 'ASC'],
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /articles */
router.post('/articles', async (req, res) => {
  try {
    const { name, category, source, sort_order, linked_article_name } = req.body || {};
    if (!name || !category) {
      return res.status(400).json({ error: 'Укажите название и категорию' });
    }
    if (!['revenue', 'expense'].includes(category)) {
      return res.status(400).json({ error: 'Некорректная категория' });
    }
    const src = source || 'manual';
    if (!['manual', 'planned_income', 'planned_expense'].includes(src)) {
      return res.status(400).json({ error: 'Некорректный источник' });
    }
    const linkedName = parseLinkedArticleName(req.body);
    if ((src === 'planned_income' || src === 'planned_expense') && !linkedName) {
      return res.status(400).json({
        error: 'Для автоматического источника укажите linked_article_name (статью из планирования)',
      });
    }
    const maxOrder = await FinPlanArticle.max('sort_order', {
      where: { category, is_active: true },
    });
    const row = await FinPlanArticle.create({
      name: String(name).trim(),
      category,
      source: src,
      linked_article_name: src === 'manual' ? null : linkedName,
      sort_order: Number.isFinite(Number(sort_order))
        ? Number(sort_order)
        : (parseInt(maxOrder, 10) || 0) + 1,
      is_active: true,
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /articles/:id */
router.put('/articles/:id', async (req, res) => {
  try {
    const row = await FinPlanArticle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Статья не найдена' });

    const { name, category, source, sort_order, is_active } = req.body || {};
    const updates = {};
    if (name != null && String(name).trim()) updates.name = String(name).trim();
    if (category && ['revenue', 'expense'].includes(category)) updates.category = category;
    if (source && ['manual', 'planned_income', 'planned_expense'].includes(source)) {
      updates.source = source;
      if (source === 'manual') updates.linked_article_name = null;
    }
    const linkedName = parseLinkedArticleName(req.body);
    if (linkedName !== undefined) {
      const effectiveSource = updates.source || row.source;
      if (
        (effectiveSource === 'planned_income' || effectiveSource === 'planned_expense') &&
        !linkedName
      ) {
        return res.status(400).json({
          error: 'Для автоматического источника укажите linked_article_name (статью из планирования)',
        });
      }
      updates.linked_article_name = effectiveSource === 'manual' ? null : linkedName;
    } else if (updates.source === 'planned_income' || updates.source === 'planned_expense') {
      const currentLinked = normalizeLinkedName(row.linked_article_name);
      if (!currentLinked) {
        return res.status(400).json({
          error: 'Для автоматического источника укажите linked_article_name (статью из планирования)',
        });
      }
    }
    if (sort_order != null && Number.isFinite(Number(sort_order))) {
      updates.sort_order = Number(sort_order);
    }
    if (is_active != null) updates.is_active = !!is_active;

    await row.update(updates);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /articles/:id — soft */
router.delete('/articles/:id', async (req, res) => {
  try {
    const row = await FinPlanArticle.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'Статья не найдена' });
    await row.update({ is_active: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /entries?year= */
router.get('/entries', async (req, res) => {
  try {
    await ensureDefaultArticles();
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const articles = await FinPlanArticle.findAll({
      where: { is_active: true },
      order: [
        ['category', 'ASC'],
        ['sort_order', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const entries = await FinPlanEntry.findAll({ where: { year } });
    const entryMap = new Map();
    for (const e of entries) {
      entryMap.set(`${e.article_id}_${e.month}`, e);
    }

    const sourceCache = new Map();
    const getCachedIncome = async (linkedArticleName) => {
      const key = `in_${linkedArticleName || '__ALL__'}`;
      if (!sourceCache.has(key)) {
        sourceCache.set(key, await getIncomeByMonth(year, linkedArticleName));
      }
      return sourceCache.get(key);
    };
    const getCachedExpense = async (linkedArticleName) => {
      const key = `ex_${linkedArticleName || '__ALL__'}`;
      if (!sourceCache.has(key)) {
        sourceCache.set(key, await getExpenseByMonth(year, linkedArticleName));
      }
      return sourceCache.get(key);
    };

    const rows = [];
    for (const article of articles) {
      let autoData = null;
      const linkedName = normalizeLinkedName(article.linked_article_name);
      if (article.source === 'planned_income') {
        autoData = await getCachedIncome(linkedName);
      } else if (article.source === 'planned_expense') {
        autoData = await getCachedExpense(linkedName);
      }

      const months = {};
      let totalPlan = 0;
      let totalFact = 0;
      for (let m = 1; m <= 12; m += 1) {
        const entry = entryMap.get(`${article.id}_${m}`);
        const cell = resolveMonthCell(article, m, entry, autoData);
        months[m] = cell;
        totalPlan += cell.plan_amount;
        totalFact += cell.fact_amount;
      }
      rows.push({
        article_id: article.id,
        name: article.name,
        category: article.category,
        source: article.source,
        linked_article_name: linkedName,
        sort_order: article.sort_order,
        months,
        total_plan: totalPlan,
        total_fact: totalFact,
      });
    }

    res.json({
      year,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /entries/bulk */
router.post('/entries/bulk', async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : req.body;
    if (!Array.isArray(items) || !items.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Передайте массив items' });
    }

    for (const it of items) {
      const articleId = parseInt(it.article_id, 10);
      const year = parseInt(it.year, 10);
      const month = parseInt(it.month, 10);
      if (!articleId || !year || month < 1 || month > 12) continue;

      const article = await FinPlanArticle.findByPk(articleId, { transaction: t });
      if (!article || !article.is_active) continue;

      const planAmount = toMoney(it.plan_amount);
      let factAmount = toMoney(it.fact_amount);

      if (article.source !== 'manual') {
        const existing = await FinPlanEntry.findOne({
          where: { article_id: articleId, year, month },
          transaction: t,
        });
        factAmount = existing ? toMoney(existing.fact_amount) : 0;
      }

      const [entry] = await FinPlanEntry.findOrCreate({
        where: { article_id: articleId, year, month },
        defaults: {
          plan_amount: planAmount,
          fact_amount: factAmount,
        },
        transaction: t,
      });

      await entry.update(
        {
          plan_amount: planAmount,
          ...(article.source === 'manual' ? { fact_amount: factAmount } : {}),
        },
        { transaction: t }
      );
    }

    await t.commit();
    res.json({ ok: true });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
