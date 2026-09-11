const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) throw new HttpError(401, 'Account not found or disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Optional auth: attaches req.user if a valid token is present, otherwise continues.
async function maybeAuthenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  return authenticate(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient permissions'));
    next();
  };
}

const isStaff = (user) => ['security', 'facility_admin', 'park_admin', 'super_admin'].includes(user.role);

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function sanitizeUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = { authenticate, maybeAuthenticate, requireRole, signToken, sanitizeUser, HttpError, isStaff };
