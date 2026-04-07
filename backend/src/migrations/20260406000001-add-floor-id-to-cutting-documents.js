'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('cutting_documents', 'floor_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cutting_documents', 'floor_id');
  },
};
