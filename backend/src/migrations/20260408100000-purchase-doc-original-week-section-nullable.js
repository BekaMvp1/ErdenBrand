'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, 'purchase_documents', 'original_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE purchase_documents
      SET original_week_start = week_start
      WHERE original_week_start IS NULL
    `);
    await queryInterface.changeColumn('purchase_documents', 'section_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('purchase_documents', 'section_id', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
    await queryInterface.removeColumn('purchase_documents', 'original_week_start');
  },
};
