/**
 * Разрешить model_size_id = NULL в shipment_items при учёте по size_id (ростовка).
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE shipment_items ALTER COLUMN model_size_id DROP NOT NULL'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE shipment_items ALTER COLUMN model_size_id SET NOT NULL'
    );
  },
};
