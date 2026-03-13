/**
 * shipments.batch — сделать nullable.
 * При схеме batch_id код партии берётся из sewing_batches.batch_code.
 */

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE shipments ALTER COLUMN batch DROP NOT NULL'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE shipments SET batch = COALESCE(batch, '-') WHERE batch IS NULL`
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE shipments ALTER COLUMN batch SET NOT NULL'
    );
  },
};
