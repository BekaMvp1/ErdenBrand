'use strict';

const { addColumnIfMissing } = require('../utils/migrationHelpers');


/**
 * Статус ОТК-партии: DONE после проведения ОТК.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'qc_batches', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'DONE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('qc_batches', 'status');
  },
};
