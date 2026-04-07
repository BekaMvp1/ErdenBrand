/**
 * Роуты аутентификации
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../models');
const { QueryTypes } = require('sequelize');
const config = require('../config');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/** Нормализация роли: только 'admin' | 'manager' | 'technologist' | 'operator' (без локализации и пробелов) */
function normalizeRole(r) {
  const s = String(r ?? '').trim().toLowerCase();
  if (s === 'administrator' || s === 'администратор') return 'admin';
  if (['admin', 'manager', 'technologist', 'operator'].includes(s)) return s;
  return s || 'operator';
}

/**
 * GET /api/auth/me — проверка токена, возвращает текущего пользователя
 * Используется при загрузке приложения для валидации сессии
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Не авторизован' });
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        floor_id: user.floor_id,
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Не авторизован' });
  }
});

/**
 * GET /api/auth/debug — проверка БД (для диагностики)
 */
router.get('/debug', async (req, res) => {
  try {
    const result = await db.sequelize.query('SELECT id, email FROM users LIMIT 3', { type: QueryTypes.SELECT });
    const users = Array.isArray(result) ? result : (result && result[0]) || [];
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

/**
 * POST /api/auth/login
 * Вход в систему
 */
router.post('/login', async (req, res) => {
  try {
    console.log('[login] попытка входа:', req.body?.email);

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const emailNorm = String(email).trim().toLowerCase();

    const user = await db.User.scope('withPassword').findOne({
      where: { email: emailNorm },
    });
    console.log('[login] пользователь найден:', !!user);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    let valid = false;
    try {
      const hash =
        user.password_hash != null ? String(user.password_hash).trim() : '';
      valid = hash.length > 0 && (await bcrypt.compare(password, hash));
    } catch (pe) {
      console.error('[login] bcrypt:', pe.message);
      valid = false;
    }
    console.log('[login] пароль верный:', valid);

    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    console.log('[login] успешный вход:', user.email);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        floor_id: user.floor_id,
      },
    });
  } catch (err) {
    console.error('[login] ОШИБКА 500:', err.message);
    console.error('[login] stack:', err.stack);
    res.status(500).json({
      error: err.message || 'Внутренняя ошибка сервера',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }
});

module.exports = router;
