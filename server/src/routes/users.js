const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate, requireRole, sanitizeUser, HttpError } = require('../middleware/auth');

const router = express.Router();
const MANAGER_ROLES = ['park_admin', 'facility_admin', 'super_admin'];
const VALID_ROLES = ['super_admin', 'park_admin', 'facility_admin', 'security', 'vehicle_owner'];

router.use(authenticate, requireRole(...MANAGER_ROLES));

// Non-super admins only see users of their own facility (plus unassigned owners they created).
function scope(req) {
  if (req.user.role === 'super_admin') return {};
  return { assigned_facility_id: req.user.assigned_facility_id || '__none__' };
}

router.get('/', async (req, res, next) => {
  try {
    const where = scope(req);
    if (req.query.role) where.role = String(req.query.role);
    const users = await prisma.user.findMany({ where, orderBy: { created_date: 'desc' } });
    res.json(users.map(sanitizeUser));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { email, password, full_name, phone, role, assigned_facility_id } = req.body || {};
    if (!email) throw new HttpError(400, 'email is required');
    if (role && !VALID_ROLES.includes(role)) throw new HttpError(400, `role must be one of ${VALID_ROLES.join(', ')}`);
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      throw new HttpError(403, 'Only a super admin can create super admins');
    }
    const tempPassword = password || Math.random().toString(36).slice(2, 10) + 'A1!';
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password_hash: await bcrypt.hash(tempPassword, 12),
        full_name: full_name || null,
        phone: phone || null,
        role: role || 'security',
        assigned_facility_id:
          req.user.role === 'super_admin' ? assigned_facility_id || null : req.user.assigned_facility_id,
      },
    });
    res.status(201).json({ user: sanitizeUser(user), temp_password: password ? undefined : tempPassword });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'User not found');
    if (req.user.role !== 'super_admin' && (target.role === 'super_admin' || req.body.role === 'super_admin')) {
      throw new HttpError(403, 'Only a super admin can modify super admins');
    }
    if (req.body.role && !VALID_ROLES.includes(req.body.role)) {
      throw new HttpError(400, `role must be one of ${VALID_ROLES.join(', ')}`);
    }
    const allowed = ['full_name', 'phone', 'role', 'assigned_facility_id', 'is_active', 'avatar_url'];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];
    if (req.body.password) data.password_hash = await bcrypt.hash(req.body.password, 12);
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json(sanitizeUser(user));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
    if (target.role === 'super_admin' && req.user.role !== 'super_admin') {
      throw new HttpError(403, 'Only a super admin can delete super admins');
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
