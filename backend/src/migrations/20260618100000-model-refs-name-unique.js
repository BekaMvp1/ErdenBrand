'use strict';

/** Уникальные наименования в справочниках моделей (без учёта регистра и пробелов по краям). */
const REF_TABLES = [
  'fabric_names',
  'fabric_units',
  'fittings_names',
  'cutting_operations',
  'sewing_operations',
  'otk_operations',
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    for (const table of REF_TABLES) {
      await sequelize.query(`
        DELETE FROM "${table}" AS a
        USING "${table}" AS b
        WHERE a.id > b.id
          AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
      `);

      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "${table}_name_normalized_unique"
        ON "${table}" (LOWER(TRIM(name)))
      `);
    }
  },

  async down(queryInterface) {
    const { sequelize } = queryInterface;
    for (const table of REF_TABLES) {
      await sequelize.query(`DROP INDEX IF EXISTS "${table}_name_normalized_unique"`);
    }
  },
};
