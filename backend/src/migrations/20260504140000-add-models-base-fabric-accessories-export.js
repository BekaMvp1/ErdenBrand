'use strict';

/**
 * Плоские массивы для выгрузки в заказ: fabric, accessories
 * (дублируют свёртку fabric_data / fittings_data)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE models_base ADD COLUMN IF NOT EXISTS fabric JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE models_base ADD COLUMN IF NOT EXISTS accessories JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('models_base', 'accessories');
    await queryInterface.removeColumn('models_base', 'fabric');
  },
};
