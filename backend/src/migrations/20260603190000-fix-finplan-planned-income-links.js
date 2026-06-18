'use strict';

/**
 * Привязка статей финплана к типам документов планового поступления (income_plans.article).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET linked_article_name = 'План к перечислению ВБ'
      WHERE name = 'Продажи Wildberries'
        AND source = 'planned_income';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET source = 'planned_income',
          linked_article_name = 'План поступление заказчики'
      WHERE name = 'Заказы от заказчиков';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET linked_article_name = NULL
      WHERE name = 'Продажи Wildberries'
        AND source = 'planned_income';
    `);

    await queryInterface.sequelize.query(`
      UPDATE fin_plan_articles
      SET source = 'manual',
          linked_article_name = NULL
      WHERE name = 'Заказы от заказчиков';
    `);
  },
};
