'use strict';

/** JSON-поля: ткань, фурнитура, операции раскроя/пошива/ОТК */

module.exports = {
  async up(queryInterface, Sequelize) {
    const jsonbNotNull = {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: { rows: [] },
    };
    await queryInterface.addColumn('models_base', 'fabric_data', jsonbNotNull);
    await queryInterface.addColumn('models_base', 'fittings_data', jsonbNotNull);
    await queryInterface.addColumn('models_base', 'cutting_ops', jsonbNotNull);
    await queryInterface.addColumn('models_base', 'sewing_ops', jsonbNotNull);
    await queryInterface.addColumn('models_base', 'otk_ops', jsonbNotNull);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('models_base', 'otk_ops');
    await queryInterface.removeColumn('models_base', 'sewing_ops');
    await queryInterface.removeColumn('models_base', 'cutting_ops');
    await queryInterface.removeColumn('models_base', 'fittings_data');
    await queryInterface.removeColumn('models_base', 'fabric_data');
  },
};
