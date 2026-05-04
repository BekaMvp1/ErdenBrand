'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const refTable = (name) =>
      queryInterface.createTable(name, {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        name: {
          type: Sequelize.STRING(500),
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });

    await refTable('fabric_names');
    await refTable('fabric_units');
    await refTable('fittings_names');
    await refTable('cutting_operations');
    await refTable('sewing_operations');
    await refTable('otk_operations');

    const units = ['м', 'м²', 'кг', 'шт', 'рулон', 'моток'];
    await queryInterface.bulkInsert(
      'fabric_units',
      units.map((name) => ({
        name,
        created_at: new Date(),
      })),
      {},
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('otk_operations');
    await queryInterface.dropTable('sewing_operations');
    await queryInterface.dropTable('cutting_operations');
    await queryInterface.dropTable('fittings_names');
    await queryInterface.dropTable('fabric_units');
    await queryInterface.dropTable('fabric_names');
  },
};
