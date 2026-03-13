/**
 * shipments.model_size_id — сделать nullable.
 * При схеме batch_id + ShipmentItem размер указывается в shipment_items, а Shipment — контейнер.
 */

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE shipments ALTER COLUMN model_size_id DROP NOT NULL'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE shipments ALTER COLUMN model_size_id SET NOT NULL'
    );
  },
};
