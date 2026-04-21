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
    await addColumnIfMissing(queryInterface, 'purchase_documents', 'workshop', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'cutting_documents', 'workshop', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('purchase_documents', 'workshop');
    await queryInterface.removeColumn('cutting_documents', 'workshop');
  },
};
