/**
 * Каталог статей расходов платёжного календаря (ключ строки ↔ название).
 * Синхронизирован с PaymentCalendar.jsx SECTIONS и paymentCalendarArticles.js
 */

const EXPENSE_SECTIONS = [
  {
    category: 'ОТДЕЛ ЗАКУПА',
    articles: [
      { key: 'supplier_madina', label: 'Мадина фурнитура' },
      { key: 'supplier_fabric', label: 'Ткань дордой' },
    ],
  },
  {
    category: 'ОТДЕЛ РАСКРОЯ',
    articles: [{ key: 'dept_cutting', label: 'ЗП раскройного отдела' }],
  },
  {
    category: 'ОТДЕЛ ПОШИВА',
    articles: [{ key: 'dept_sewing', label: 'ЗП пошивного отдела' }],
  },
  {
    category: 'ОТК',
    articles: [{ key: 'dept_otk', label: 'ЗП отдела ОТК' }],
  },
  {
    category: 'КРЕДИТЫ',
    articles: [{ key: 'credit_ayil', label: 'Айыл банк' }],
  },
  {
    category: 'МАРКЕТИНГ РАСХОДЫ',
    articles: [{ key: 'marketing_telegram', label: 'Реклама телеграмм' }],
  },
  {
    category: 'ОПЕРАЦИОННЫЕ РАСХОДЫ',
    articles: [{ key: 'ops_rent', label: 'Аренда помещение' }],
  },
  {
    category: 'ФОТ',
    articles: [
      { key: 'fot_rop', label: 'РОП ЗП' },
      { key: 'fot_warehouse', label: 'Склад ЗП' },
    ],
  },
];

const LABEL_TO_KEY = new Map();
const KEY_TO_LABEL = new Map();
const KEY_TO_SECTION = new Map();

for (const section of EXPENSE_SECTIONS) {
  for (const article of section.articles) {
    LABEL_TO_KEY.set(article.label, article.key);
    KEY_TO_LABEL.set(article.key, article.label);
    KEY_TO_SECTION.set(article.key, section.category);
  }
}

/** Старые названия из планирования расходов → ключ строки календаря */
const LEGACY_ARTICLE_ALIASES = {
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

/** Строка без привязки к статье — только сводка «Плановые расходы» */
const UNMATCHED_EXPENSE_CATEGORY = 'expense_plan_unmatched';

function normalizeArticleLabel(article) {
  return String(article || '').trim();
}

/** Точное совпадение названия статьи → ключ строки календаря (без custom и без fallback) */
function categoryKeyFromArticleLabel(article) {
  const label = normalizeArticleLabel(article);
  if (!label) return null;
  if (LABEL_TO_KEY.has(label)) return LABEL_TO_KEY.get(label);
  if (LEGACY_ARTICLE_ALIASES[label]) return LEGACY_ARTICLE_ALIASES[label];
  return null;
}

function customCategoryKeyFromLabel(label) {
  const s = normalizeArticleLabel(label);
  if (!s) return null;
  return `custom_${s}`;
}

function articleLabelFromCategoryKey(categoryKey) {
  const cat = String(categoryKey || '').trim();
  if (cat.startsWith('custom_')) return cat.slice('custom_'.length);
  return KEY_TO_LABEL.get(cat) || cat;
}

function sectionForCategoryKey(categoryKey) {
  const cat = String(categoryKey || '').trim();
  if (cat.startsWith('custom_')) return 'ОПЕРАЦИОННЫЕ РАСХОДЫ';
  return KEY_TO_SECTION.get(cat) || null;
}

module.exports = {
  EXPENSE_SECTIONS,
  LABEL_TO_KEY,
  KEY_TO_LABEL,
  LEGACY_ARTICLE_ALIASES,
  UNMATCHED_EXPENSE_CATEGORY,
  normalizeArticleLabel,
  categoryKeyFromArticleLabel,
  customCategoryKeyFromLabel,
  articleLabelFromCategoryKey,
  sectionForCategoryKey,
};
