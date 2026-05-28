'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('shipments_new');

    if (!table.shipment_type) {
      await queryInterface.addColumn('shipments_new', 'shipment_type', {
        type: Sequelize.STRING,
        defaultValue: 'goods',
      });
    }

    if (!table.defect_type) {
      await queryInterface.addColumn('shipments_new', 'defect_type', {
        type: Sequelize.STRING,
      });
    }

    if (!table.defect_reason) {
      await queryInterface.addColumn('shipments_new', 'defect_reason', {
        type: Sequelize.TEXT,
      });
    }

    if (!table.defect_destination) {
      await queryInterface.addColumn('shipments_new', 'defect_destination', {
        type: Sequelize.STRING,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('shipments_new');

    if (table.defect_destination) {
      await queryInterface.removeColumn('shipments_new', 'defect_destination');
    }
    if (table.defect_reason) {
      await queryInterface.removeColumn('shipments_new', 'defect_reason');
    }
    if (table.defect_type) {
      await queryInterface.removeColumn('shipments_new', 'defect_type');
    }
    if (table.shipment_type) {
      await queryInterface.removeColumn('shipments_new', 'shipment_type');
    }
  },
};
