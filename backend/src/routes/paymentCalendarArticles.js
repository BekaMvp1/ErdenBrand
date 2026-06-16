/**
 * Статьи расходов платёжного календаря (каталог + данные из payment_calendar)
 * Монтируется: GET /api/finance/payment-calendar-articles
 */

const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const {
  EXPENSE_SECTIONS,
  articleLabelFromCategoryKey,
  sectionForCategoryKey,
} = require('../utils/paymentCalendarExpenseArticles');

const router = express.Router();

const INCOME_KEY_PREFIX = 'income_';
const SKIP_PREFIXES = ['income_', 'expense_plan_', 'order_'];

function shouldSkipCategory(category) {
  const cat = String(category || '').trim();
  if (!cat) return true;
  return SKIP_PREFIXES.some((p) => cat.startsWith(p));
}

router.get('/', async (req, res) => {
  try {
    const grouped = new Map();
    for (const section of EXPENSE_SECTIONS) {
      grouped.set(
        section.category,
        new Set(section.articles.map((a) => a.label))
      );
    }

    const rows = await db.PaymentCalendar.findAll({
      attributes: ['category', 'subcategory'],
      where: {
        category: {
          [Op.notLike]: `${INCOME_KEY_PREFIX}%`,
        },
      },
      raw: true,
    });

    for (const row of rows) {
      const categoryKey = String(row.category || '').trim();
      if (shouldSkipCategory(categoryKey)) continue;

      const sectionTitle = sectionForCategoryKey(categoryKey);
      if (!sectionTitle) continue;

      if (!grouped.has(sectionTitle)) {
        grouped.set(sectionTitle, new Set());
      }
      const articles = grouped.get(sectionTitle);

      const label = articleLabelFromCategoryKey(categoryKey);
      if (label) articles.add(label);

      const sub = String(row.subcategory || '').trim();
      if (sub && !sub.startsWith('income_plan_') && !sub.startsWith('expense_plan_')) {
        articles.add(sub);
      }
    }

    const result = EXPENSE_SECTIONS.map((section) => ({
      category: section.category,
      articles: [...(grouped.get(section.category) || new Set())].sort((a, b) =>
        a.localeCompare(b, 'ru')
      ),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
