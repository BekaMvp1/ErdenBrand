/**
 * Проверка наличия admin@factory.local в БД (Railway: railway run npm run railway:check-admin)
 */
'use strict';

require('dotenv').config();
const db = require('../src/models');

(async () => {
  try {
    await db.sequelize.authenticate();
    const u = await db.User.findOne({
      where: { email: 'admin@factory.local' },
      attributes: ['id', 'email', 'role', 'name'],
    });
    if (u) {
      console.log(`✓ Пользователь найден: ${u.email} role: ${u.role}`);
    } else {
      console.log('✗ Пользователь не найден — выполните: railway run npm run db:seed');
    }
    await db.sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
