const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');
const { authenticate, signToken, sanitizeUser, HttpError } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, full_name, phone } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Valid email is required');
    if (!password || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const normalized = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    // Bootstrap: the very first account becomes the super admin.
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'super_admin' : 'vehicle_owner';

    const user = await prisma.user.create({
      data: {
        email: normalized,
        password_hash: await bcrypt.hash(password, 12),
        full_name: full_name || null,
        phone: phone || null,
        role,
      },
    });
    res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'Email and password are required');
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (!user.is_active) throw new HttpError(403, 'Account is disabled');
    await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });
    res.json({ token: signToken(user), user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json(sanitizeUser(req.user));
});

router.put('/me', authenticate, async (req, res, next) => {
  try {
    const allowed = ['full_name', 'phone', 'avatar_url'];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json(sanitizeUser(user));
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!new_password || new_password.length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
    if (!(await bcrypt.compare(current_password || '', req.user.password_hash))) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password_hash: await bcrypt.hash(new_password, 12) },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Register an Expo push token for the signed-in user.
router.post('/push-token', authenticate, async (req, res, next) => {
  try {
    const { token, platform } = req.body || {};
    if (!token) throw new HttpError(400, 'token is required');
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, platform: platform || null, user_email: req.user.email },
      update: { user_email: req.user.email, platform: platform || null },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/push-token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (token) await prisma.pushToken.deleteMany({ where: { token, user_email: req.user.email } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
