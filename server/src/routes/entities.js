const express = require('express');
const prisma = require('../db');
const { entities } = require('../entities');
const { authenticate, maybeAuthenticate, HttpError } = require('../middleware/auth');

const router = express.Router();

// URL name (kebab-case, plural-friendly) -> entity key. Both /api/entities/Vehicle
// and /api/entities/vehicle resolve.
const byLower = Object.fromEntries(Object.keys(entities).map((k) => [k.toLowerCase(), k]));

function resolveEntity(req, res, next) {
  const key = byLower[String(req.params.entity).toLowerCase()];
  if (!key) return next(new HttpError(404, `Unknown entity: ${req.params.entity}`));
  req.entityKey = key;
  req.entityDef = entities[key];
  next();
}

function canRead(def, user) {
  if (def.read === 'public') return true;
  if (!user) return false;
  return def.read.includes(user.role);
}

function canWrite(def, user) {
  return !!user && def.write.includes(user.role);
}

// Coerce incoming JSON body values to the types Prisma expects.
function coerceData(def, body, { partial = false } = {}) {
  const data = {};
  for (const [field, spec] of Object.entries(def.fields)) {
    let v = body[field];
    if (v === undefined) continue;
    if (v === null || v === '') {
      data[field] = spec.type === 'string' ? (v === '' ? '' : null) : null;
      continue;
    }
    if (spec.format === 'date-time') {
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new HttpError(400, `${field} must be a valid date`);
      data[field] = d;
    } else if (spec.type === 'number') {
      const n = Number(v);
      if (isNaN(n)) throw new HttpError(400, `${field} must be a number`);
      data[field] = n;
    } else if (spec.type === 'boolean') {
      data[field] = v === true || v === 'true';
    } else if (spec.type === 'array' || spec.type === 'object') {
      data[field] = v;
    } else {
      data[field] = String(v);
    }
    if (spec.enum && data[field] != null && !spec.enum.includes(data[field])) {
      throw new HttpError(400, `${field} must be one of: ${spec.enum.join(', ')}`);
    }
  }
  if (!partial) {
    for (const [field, spec] of Object.entries(def.fields)) {
      if (spec.required && (data[field] === undefined || data[field] === null || data[field] === '')) {
        throw new HttpError(400, `${field} is required`);
      }
    }
  }
  return data;
}

// Build the row-level scope for this user: facility scoping for staff,
// owner scoping for vehicle owners.
async function buildScope(def, user) {
  if (!user) return {}; // public read entities
  if (user.role === 'super_admin') return {};
  const scope = {};
  if (def.facilityScoped && user.assigned_facility_id && user.role !== 'vehicle_owner') {
    scope.facility_id = user.assigned_facility_id;
  }
  if (user.role === 'vehicle_owner') {
    if (def.ownerField) {
      scope[def.ownerField] = user.email;
    } else if (def.ownerVia === 'vehicle') {
      const vehicles = await prisma.vehicle.findMany({
        where: { owner_email: user.email },
        select: { id: true },
      });
      scope.vehicle_id = { in: vehicles.map((v) => v.id) };
    } else if (def.read !== 'public') {
      // Entity has no owner concept: owners get nothing unless read is public.
      scope.id = '__forbidden__';
    }
  }
  return scope;
}

// Query params -> where clause. Special params: sort, limit, offset.
// Supports value lists (comma) and date range via field_gte / field_lte.
function parseFilters(def, query) {
  const where = {};
  for (const [rawKey, rawVal] of Object.entries(query)) {
    if (['sort', 'limit', 'offset'].includes(rawKey)) continue;
    let key = rawKey;
    let op = null;
    if (key.endsWith('_gte')) { op = 'gte'; key = key.slice(0, -4); }
    else if (key.endsWith('_lte')) { op = 'lte'; key = key.slice(0, -4); }
    const spec = def.fields[key] || (['id', 'created_date'].includes(key) ? { type: 'string' } : null);
    if (!spec) continue;
    let value = rawVal;
    if (key === 'created_date' || spec.format === 'date-time') value = new Date(value);
    else if (spec.type === 'number') value = Number(value);
    else if (spec.type === 'boolean') value = value === 'true';
    if (op) {
      where[key] = { ...(where[key] || {}), [op]: value };
    } else if (typeof rawVal === 'string' && rawVal.includes(',') && spec.type === 'string') {
      where[key] = { in: rawVal.split(',') };
    } else {
      where[key] = value;
    }
  }
  return where;
}

function parseSort(query) {
  const sort = query.sort || '-created_date';
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? 'desc' : 'asc' };
}

// LIST:   GET /api/entities/:entity?field=value&sort=-created_date&limit=100
router.get('/:entity', maybeAuthenticate, resolveEntity, async (req, res, next) => {
  try {
    const def = req.entityDef;
    if (!canRead(def, req.user)) throw new HttpError(req.user ? 403 : 401, 'Not allowed to read this entity');
    const scope = await buildScope(def, req.user);
    const where = { ...parseFilters(def, req.query), ...scope };
    const rows = await prisma[def.model].findMany({
      where,
      orderBy: parseSort(req.query),
      take: Math.min(parseInt(req.query.limit || '500', 10), 1000),
      skip: parseInt(req.query.offset || '0', 10),
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET one
router.get('/:entity/:id', maybeAuthenticate, resolveEntity, async (req, res, next) => {
  try {
    const def = req.entityDef;
    if (!canRead(def, req.user)) throw new HttpError(req.user ? 403 : 401, 'Not allowed to read this entity');
    const scope = await buildScope(def, req.user);
    const row = await prisma[def.model].findFirst({ where: { id: req.params.id, ...scope } });
    if (!row) throw new HttpError(404, `${req.entityKey} not found`);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// CREATE
router.post('/:entity', authenticate, resolveEntity, async (req, res, next) => {
  try {
    const def = req.entityDef;
    if (!canWrite(def, req.user)) throw new HttpError(403, 'Not allowed to write this entity');
    const data = coerceData(def, req.body || {});
    if (req.user.role === 'vehicle_owner' && def.ownerField) {
      data[def.ownerField] = req.user.email; // owners can only create records for themselves
    }
    if (
      def.facilityScoped &&
      req.user.role !== 'super_admin' &&
      req.user.role !== 'vehicle_owner' &&
      req.user.assigned_facility_id &&
      data.facility_id === undefined
    ) {
      data.facility_id = req.user.assigned_facility_id;
    }
    const row = await prisma[def.model].create({ data });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// BULK CREATE
router.post('/:entity/bulk', authenticate, resolveEntity, async (req, res, next) => {
  try {
    const def = req.entityDef;
    if (!canWrite(def, req.user)) throw new HttpError(403, 'Not allowed to write this entity');
    const items = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Provide an array of records');
    if (items.length > 1000) throw new HttpError(400, 'Max 1000 records per bulk create');
    const data = items.map((item) => coerceData(def, item));
    const created = await prisma.$transaction(data.map((d) => prisma[def.model].create({ data: d })));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// UPDATE
async function updateHandler(req, res, next) {
  try {
    const def = req.entityDef;
    const scope = await buildScope(def, req.user);
    const existing = await prisma[def.model].findFirst({ where: { id: req.params.id, ...scope } });
    if (!existing) throw new HttpError(404, `${req.entityKey} not found`);

    let allowedWrite = canWrite(def, req.user);
    // Vehicle owners may respond to their own exit requests and edit their own
    // owner-scoped records even when the entity is otherwise staff-writable.
    if (!allowedWrite && req.user.role === 'vehicle_owner' && def.ownerField && existing[def.ownerField] === req.user.email) {
      allowedWrite = true;
    }
    if (!allowedWrite) throw new HttpError(403, 'Not allowed to update this entity');

    let data = coerceData(def, req.body || {}, { partial: true });
    if (req.user.role === 'vehicle_owner' && req.entityKey === 'ExitRequest') {
      // Owners can only respond to a pending request.
      const allowed = {};
      if (data.status && ['approved', 'rejected'].includes(data.status)) allowed.status = data.status;
      if (data.notes !== undefined) allowed.notes = data.notes;
      if (existing.status !== 'pending') throw new HttpError(409, 'This exit request was already resolved');
      allowed.responded_at = new Date();
      allowed.responded_by = req.user.email;
      data = allowed;
    }
    const row = await prisma[def.model].update({ where: { id: req.params.id }, data });

    // Keep vehicle state consistent when an exit request is resolved.
    if (req.entityKey === 'ExitRequest' && data.status === 'approved' && existing.status === 'pending') {
      await onExitApproved(row);
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
}

async function onExitApproved(request) {
  await prisma.vehicle.updateMany({
    where: { id: request.vehicle_id },
    data: { is_inside: false, last_exit: new Date() },
  });
  await prisma.scanLog.updateMany({
    where: { vehicle_id: request.vehicle_id, scan_type: 'exit', status: 'pending_approval' },
    data: { status: 'completed' },
  });
}

router.put('/:entity/:id', authenticate, resolveEntity, updateHandler);
router.patch('/:entity/:id', authenticate, resolveEntity, updateHandler);

// DELETE
router.delete('/:entity/:id', authenticate, resolveEntity, async (req, res, next) => {
  try {
    const def = req.entityDef;
    const scope = await buildScope(def, req.user);
    const existing = await prisma[def.model].findFirst({ where: { id: req.params.id, ...scope } });
    if (!existing) throw new HttpError(404, `${req.entityKey} not found`);
    let allowedDelete = canWrite(def, req.user);
    if (!allowedDelete && req.user.role === 'vehicle_owner' && def.ownerField && existing[def.ownerField] === req.user.email) {
      allowedDelete = req.entityKey === 'DriverPass'; // owners may delete only their driver passes
    }
    if (!allowedDelete) throw new HttpError(403, 'Not allowed to delete this entity');
    await prisma[def.model].delete({ where: { id: req.params.id } });

    // Free the QR code when a vehicle is removed.
    if (req.entityKey === 'Vehicle' && existing.qr_code_id) {
      await prisma.qRCode.updateMany({
        where: { code_id: existing.qr_code_id },
        data: { status: 'available', vehicle_id: null },
      });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, onExitApproved };
