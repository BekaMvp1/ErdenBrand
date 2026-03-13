/**
 * Разрешить model_size_id = NULL в warehouse_stock при учёте по size_id.
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE warehouse_stock ALTER COLUMN model_size_id DROP NOT NULL'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE warehouse_stock ALTER COLUMN model_size_id SET NOT NULL'
    );
  },
};
