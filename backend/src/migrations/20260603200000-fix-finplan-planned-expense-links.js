'use strict';

/**
 * Привязка статей расходов финплана к значениям expense_plans.article.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET linked_article_name = 'Поставщики материала'
      WHERE name = 'Ткань и фурнитура'
        AND source = 'planned_expense';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET linked_article_name = 'Зарплата сотрудников'
      WHERE name = 'Зарплата швей'
        AND source = 'planned_expense';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET source = 'planned_expense',
          linked_article_name = 'Аренда'
      WHERE name = 'Аренда'
        AND category = 'expense'
        AND source = 'manual';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET source = 'planned_expense',
          linked_article_name = 'Реклама телеграмм'
      WHERE name = 'Реклама'
        AND category = 'expense'
        AND source = 'manual';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET linked_article_name = NULL
      WHERE name IN ('Ткань и фурнитура', 'Зарплата швей')
        AND source = 'planned_expense';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET source = 'manual',
          linked_article_name = NULL
      WHERE name IN ('Аренда', 'Реклама')
        AND category = 'expense';
    `);
  },
};
