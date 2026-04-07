'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('cutting_documents', 'original_week_start', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE cutting_documents
      SET original_week_start = week_start
      WHERE original_week_start IS NULL
    `);
    await queryInterface.changeColumn('cutting_documents', 'section_id', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('cutting_documents', 'section_id', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
    await queryInterface.removeColumn('cutting_documents', 'original_week_start');
  },
};
