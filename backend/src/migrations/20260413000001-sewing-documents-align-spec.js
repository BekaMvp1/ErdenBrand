'use strict';

/**
 * Выравнивание sewing_* под спецификацию (nullable FK, ON DELETE SET NULL, без workshop_id).
 * Для БД, где уже применены 20260412000001–02.
 */
module.exports = {
  async up(queryInterface) {
    try {
      const { sequelize } = queryInterface;
      const [tables] = await sequelize.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sewing_documents'"
      );
      if (!tables?.length) return;

      await sequelize.query(`
      DROP INDEX IF EXISTS sewing_documents_cutting_document_id_unique;
    `);
      await sequelize.query(`
      ALTER TABLE sewing_documents DROP CONSTRAINT IF EXISTS sewing_documents_cutting_document_id_fkey;
    `);
      await sequelize.query(`
      ALTER TABLE sewing_documents DROP CONSTRAINT IF EXISTS sewing_documents_chain_id_fkey;
    `);
      await sequelize.query(`
      ALTER TABLE sewing_documents DROP CONSTRAINT IF EXISTS sewing_documents_order_id_fkey;
    `);

      await sequelize.query(`
      ALTER TABLE sewing_documents ALTER COLUMN cutting_document_id DROP NOT NULL;
      ALTER TABLE sewing_documents ALTER COLUMN chain_id DROP NOT NULL;
      ALTER TABLE sewing_documents ALTER COLUMN order_id DROP NOT NULL;
    `);

      await sequelize.query(`
      ALTER TABLE sewing_documents
        ADD CONSTRAINT sewing_documents_cutting_document_id_fkey
        FOREIGN KEY (cutting_document_id) REFERENCES cutting_documents(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    `);
      await sequelize.query(`
      ALTER TABLE sewing_documents
        ADD CONSTRAINT sewing_documents_chain_id_fkey
        FOREIGN KEY (chain_id) REFERENCES planning_chains(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    `);
      await sequelize.query(`
      ALTER TABLE sewing_documents
        ADD CONSTRAINT sewing_documents_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES orders(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
    `);

      const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sewing_documents' AND column_name = 'workshop_id'
    `);
      if (cols?.length) {
        await sequelize.query(`
        ALTER TABLE sewing_documents DROP CONSTRAINT IF EXISTS sewing_documents_workshop_id_fkey;
      `);
        await sequelize.query(`ALTER TABLE sewing_documents DROP COLUMN IF EXISTS workshop_id;`);
      }
    } catch (e) {
      if (String(e?.message || '').includes('foreign key') || e.parent?.code === '23503') {
        console.warn('Пропуск миграции sewing-documents-align-spec - FK ошибка:', e.message);
      } else {
        throw e;
      }
    }
  },

  async down() {
    // необратимо без восстановления данных
  },
};
