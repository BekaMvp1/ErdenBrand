'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: добавить TZ/MODEL поля в заказы
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('orders');

    if (!table.tz_code) {
      await addColumnIfMissing(queryInterface, 'orders', 'tz_code', {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: '',
      });
    }

    if (!table.model_name) {
      await addColumnIfMissing(queryInterface, 'orders', 'model_name', {
        type: Sequelize.STRING(160),
        allowNull: false,
        defaultValue: '',
      });
    }

    if (!table.article) {
      await addColumnIfMissing(queryInterface, 'orders', 'article', {
        type: Sequelize.STRING(80),
        allowNull: true,
      });
    }

    await safeAddIndex(queryInterface, 'orders', ['tz_code'], {
      name: 'orders_tz_code_idx',
    });
    await safeAddIndex(queryInterface, 'orders', ['model_name'], {
      name: 'orders_model_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_tz_code_idx').catch(() => {});
    await queryInterface.removeIndex('orders', 'orders_model_name_idx').catch(() => {});

    await queryInterface.removeColumn('orders', 'article').catch(() => {});
    await queryInterface.removeColumn('orders', 'model_name').catch(() => {});
    await queryInterface.removeColumn('orders', 'tz_code').catch(() => {});
  },
};
