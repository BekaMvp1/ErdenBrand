'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('purchase_documents', 'workshop', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('cutting_documents', 'workshop', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('purchase_documents', 'workshop');
    await queryInterface.removeColumn('cutting_documents', 'workshop');
  },
};
