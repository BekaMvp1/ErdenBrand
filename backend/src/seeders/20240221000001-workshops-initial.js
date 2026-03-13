'use strict';

/**
 * Сидер: цехи пошива (Наш цех, Аутсорс, Аксы)
 * Идемпотентный — добавляет только если таблица пуста
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    const [countResult] = await sequelize.query('SELECT COUNT(*) FROM workshops');
    if (parseInt(countResult[0].count, 10) > 0) return;

    const now = new Date();
    await queryInterface.bulkInsert('workshops', [
      { name: 'Наш цех', floors_count: 4, is_active: true, created_at: now, updated_at: now },
      { name: 'Аутсорс', floors_count: 1, is_active: true, created_at: now, updated_at: now },
      { name: 'Аксы', floors_count: 1, is_active: true, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('workshops', {
      name: ['Наш цех', 'Аутсорс', 'Аксы'],
    });
  },
};
