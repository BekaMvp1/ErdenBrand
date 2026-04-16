'use strict';

/**
 * Гарантирует пользователя admin@factory.local с bcrypt-хэшем пароля admin123.
 * Идемпотентно: если запись есть — ничего не меняет.
 */

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const [existing] = await sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@factory.local' LIMIT 1"
    );
    if (existing && existing.length > 0) {
      return;
    }
    const passwordHash = await bcrypt.hash('admin123', 10);
    await queryInterface.bulkInsert('users', [
      {
        name: 'Администратор',
        email: 'admin@factory.local',
        password_hash: passwordHash,
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@factory.local' }, {});
  },
};
