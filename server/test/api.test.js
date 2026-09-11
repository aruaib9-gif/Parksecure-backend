/**
 * ParkSecure API integration tests.
 *
 * Boots the Express app in-process on an ephemeral port and drives it over HTTP,
 * so routing, middleware, auth and the Prisma layer are all exercised for real.
 *
 * Requires a migrated PostgreSQL database reachable via DATABASE_URL and a
 * seeded super admin (ADMIN_EMAIL / ADMIN_PASSWORD). Run:
 *   npm run migrate:deploy && npm run seed && npm test
 *
 * Records it creates are namespaced with a per-run tag and removed in `after()`.
 */
process.env.NODE_ENV = 'test';
process.env.CRON_ENABLED = 'false';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const prisma = require('../src/db');
const { computeBilling, durationText } = require('../src/services/billing');

// Credentials come from the environment (server/.env) so no real password is
// ever committed. Seed the admin with `npm run seed` before running the suite.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@parksecure.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set (see server/.env.example) to run the integration tests');
}

// Unique per run so repeated runs never collide on unique columns.
const TAG = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let server;
let baseUrl;
let adminToken;

/** Minimal fetch wrapper returning { status, body }. */
async function api(path, { method = 'GET', token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return { status: res.status, body: await res.text() };
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  assert.equal(login.status, 200, `admin login failed: ${JSON.stringify(login.body)}`);
  adminToken = login.body.token;
});

after(async () => {
  // Remove everything this run created, children first.
  const facilities = await prisma.facility.findMany({
    where: { name: { contains: TAG } },
    select: { id: true },
  });
  const ids = facilities.map((f) => f.id);
  if (ids.length) {
    const scope = { facility_id: { in: ids } };
    await prisma.itemLog.deleteMany({ where: scope });
    await prisma.payment.deleteMany({ where: scope });
    await prisma.exitRequest.deleteMany({ where: scope });
    await prisma.securityAlert.deleteMany({ where: scope });
    await prisma.scanLog.deleteMany({ where: scope });
    await prisma.qRCode.deleteMany({ where: scope });
    await prisma.vehicle.deleteMany({ where: scope });
    await prisma.facility.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { contains: TAG } } });
  await prisma.$disconnect();
  await new Promise((resolve) => server.close(resolve));
});

/** Creates a facility with the given billing setup. */
async function createFacility(overrides = {}) {
  const res = await api('/api/entities/Facility', {
    method: 'POST',
    token: adminToken,
    body: { name: `${TAG} Park`, city: 'Lagos', billing_mode: 'free', ...overrides },
  });
  assert.equal(res.status, 201, `facility create: ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Creates a facility + QR code + vehicle with the QR assigned, ready to scan. */
async function createScannableVehicle(facilityOverrides = {}, vehicleOverrides = {}) {
  const facility = await createFacility(facilityOverrides);

  const batch = await api('/api/functions/generateQRBatch', {
    method: 'POST',
    token: adminToken,
    body: { facility_id: facility.id, count: 1, batch_name: `${TAG} batch`, prefix: TAG.toUpperCase().slice(0, 6) },
  });
  assert.equal(batch.status, 201, `qr batch: ${JSON.stringify(batch.body)}`);
  const code = batch.body[0].code_id;

  const vehicle = await api('/api/entities/Vehicle', {
    method: 'POST',
    token: adminToken,
    body: {
      plate_number: `${TAG.toUpperCase().slice(0, 5)}-${Math.floor(Math.random() * 900 + 100)}`,
      owner_name: 'Test Owner',
      owner_email: `owner-${TAG}@test.local`,
      facility_id: facility.id,
      ...vehicleOverrides,
    },
  });
  assert.equal(vehicle.status, 201, `vehicle create: ${JSON.stringify(vehicle.body)}`);

  const assign = await api('/api/functions/assignQRCode', {
    method: 'POST',
    token: adminToken,
    body: { vehicle_id: vehicle.body.id, code_id: code },
  });
  assert.equal(assign.status, 200, `assign qr: ${JSON.stringify(assign.body)}`);

  return { facility, vehicle: vehicle.body, code };
}

describe('service health and discovery', () => {
  test('health reports ok with a reachable database', async () => {
    const res = await api('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('root advertises docs and health', async () => {
    const res = await api('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'ParkSecure API');
    assert.match(res.body.docs, /\/api-docs$/);
  });

  test('OpenAPI spec is valid and covers the documented surface', async () => {
    const res = await api('/api-docs.json');
    assert.equal(res.status, 200);
    assert.equal(res.body.openapi, '3.0.3');
    assert.ok(Object.keys(res.body.paths).length >= 50, 'expected a substantial path count');
    // Every path item must declare at least one operation with a response.
    for (const [path, item] of Object.entries(res.body.paths)) {
      const ops = Object.entries(item).filter(([m]) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(m)
      );
      assert.ok(ops.length > 0, `${path} declares no operations`);
      for (const [method, op] of ops) {
        assert.ok(op.responses && Object.keys(op.responses).length, `${method} ${path} has no responses`);
      }
    }
  });

  test('Swagger UI is served', async () => {
    const res = await api('/api-docs/', { raw: true });
    assert.equal(res.status, 200);
    assert.match(res.body, /swagger/i);
  });

  test('unknown route returns a JSON 404', async () => {
    const res = await api('/api/nope');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });
});

describe('authentication and authorization', () => {
  test('admin login returns a token and the super_admin identity', async () => {
    const me = await api('/api/auth/me', { token: adminToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.role, 'super_admin');
    assert.equal(me.body.email, ADMIN_EMAIL);
    assert.equal(me.body.password_hash, undefined, 'must never expose the password hash');
  });

  test('wrong password is rejected', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: ADMIN_EMAIL, password: 'definitely-wrong' },
    });
    assert.equal(res.status, 401);
  });

  test('unauthenticated access is rejected', async () => {
    const res = await api('/api/entities/Vehicle');
    assert.equal(res.status, 401);
  });

  test('a malformed token is rejected', async () => {
    const res = await api('/api/entities/Vehicle', { token: 'not.a.jwt' });
    assert.equal(res.status, 401);
  });

  test('self-registration creates a vehicle_owner', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: { email: `newowner-${TAG}@test.local`, password: 'OwnerPass123!', full_name: 'New Owner' },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'vehicle_owner');
  });

  test('a vehicle owner cannot create facilities', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { email: `nofac-${TAG}@test.local`, password: 'OwnerPass123!', full_name: 'Owner' },
    });
    const res = await api('/api/entities/Facility', {
      method: 'POST',
      token: reg.body.token,
      body: { name: `${TAG} Hack Park` },
    });
    assert.equal(res.status, 403);
  });

  test('a vehicle owner cannot list all users', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { email: `nouser-${TAG}@test.local`, password: 'OwnerPass123!', full_name: 'Owner' },
    });
    const res = await api('/api/users', { token: reg.body.token });
    assert.equal(res.status, 403);
  });
});

describe('billing calculation', () => {
  test('free mode never charges', () => {
    const r = computeBilling({ billing_mode: 'free' }, new Date(Date.now() - 5 * 3600 * 1000));
    assert.equal(r.amount, 0);
    assert.equal(r.mode, 'free');
  });

  test('standard mode charges a flat rate regardless of duration', () => {
    const facility = { billing_mode: 'standard', standard_rate: 750 };
    const short = computeBilling(facility, new Date(Date.now() - 10 * 60 * 1000));
    const long = computeBilling(facility, new Date(Date.now() - 10 * 3600 * 1000));
    assert.equal(short.amount, 750);
    assert.equal(long.amount, 750);
  });

  test('hourly mode rounds part-hours up', () => {
    const facility = { billing_mode: 'hourly', hourly_rate: 500 };
    assert.equal(computeBilling(facility, new Date(Date.now() - 5 * 60 * 1000)).amount, 500, '5 min bills 1 hr');
    assert.equal(computeBilling(facility, new Date(Date.now() - 60 * 60 * 1000)).amount, 500, '60 min bills 1 hr');
    assert.equal(computeBilling(facility, new Date(Date.now() - 61 * 60 * 1000)).amount, 1000, '61 min bills 2 hr');
  });

  test('a just-arrived vehicle is still billed one hour, not zero', () => {
    const r = computeBilling({ billing_mode: 'hourly', hourly_rate: 400 }, new Date());
    assert.equal(r.amount, 400);
  });

  test('duration text is human readable', () => {
    assert.equal(durationText(0), '');
    assert.equal(durationText(45), '45 min');
    assert.equal(durationText(60), '1 hr');
    assert.equal(durationText(125), '2 hr 5 min');
  });
});

describe('QR code lifecycle', () => {
  test('a generated batch starts available and becomes assigned', async () => {
    const facility = await createFacility();
    const batch = await api('/api/functions/generateQRBatch', {
      method: 'POST',
      token: adminToken,
      body: { facility_id: facility.id, count: 3, batch_name: `${TAG} lifecycle`, prefix: 'LC' },
    });
    assert.equal(batch.status, 201);
    assert.equal(batch.body.length, 3);
    assert.ok(batch.body.every((c) => c.status === 'available'));

    const vehicle = await api('/api/entities/Vehicle', {
      method: 'POST',
      token: adminToken,
      body: { plate_number: `LC-${TAG.slice(0, 4)}`, facility_id: facility.id, owner_name: 'QR Owner' },
    });
    const assign = await api('/api/functions/assignQRCode', {
      method: 'POST',
      token: adminToken,
      body: { vehicle_id: vehicle.body.id, code_id: batch.body[0].code_id },
    });
    assert.equal(assign.status, 200);
    assert.equal(assign.body.qr_code.status, 'assigned');
    assert.equal(assign.body.qr_code.vehicle_id, vehicle.body.id);
  });

  test('looking up an unknown code reports it as unregistered rather than erroring', async () => {
    const res = await api(`/api/scans/lookup?code=NOPE-${TAG}`, { token: adminToken });
    assert.equal(res.status, 200);
    assert.notEqual(res.body.result, 'ok');
  });
});

describe('entry and exit scanning', () => {
  test('entry marks the vehicle inside and records declared items', async () => {
    const { code, vehicle } = await createScannableVehicle();
    const entry = await api('/api/scans/entry', {
      method: 'POST',
      token: adminToken,
      body: { qr_code_id: code, items: [{ name: 'Laptop', quantity: 1 }, { name: 'Toolbox', quantity: 2 }] },
    });
    assert.equal(entry.status, 201);
    assert.equal(entry.body.vehicle.is_inside, true);

    const items = await api(`/api/entities/ItemLog?vehicle_id=${vehicle.id}`, { token: adminToken });
    assert.equal(items.body.length, 2);
    assert.ok(items.body.every((i) => i.scan_type === 'entry'));
  });

  test('a second entry without an exit is rejected', async () => {
    const { code } = await createScannableVehicle();
    await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    const dup = await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    assert.equal(dup.status, 409);
  });

  test('exiting a vehicle that is not inside is rejected', async () => {
    const { code } = await createScannableVehicle();
    const res = await api('/api/scans/exit', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    assert.equal(res.status, 409);
  });

  test('a blacklisted vehicle is denied entry and raises an alert', async () => {
    const { code, vehicle, facility } = await createScannableVehicle();
    await api(`/api/entities/Vehicle/${vehicle.id}`, {
      method: 'PUT',
      token: adminToken,
      body: { status: 'blacklisted' },
    });

    const entry = await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    assert.equal(entry.status, 403);
    assert.equal(entry.body.denied, true);

    const alerts = await api(`/api/entities/SecurityAlert?facility_id=${facility.id}`, { token: adminToken });
    assert.ok(
      alerts.body.some((a) => a.alert_type === 'blacklist_attempt'),
      'expected a blacklist_attempt alert'
    );
  });

  test('a guest QR stamps an expiry on the vehicle and is denied entry once past it', async () => {
    // A guest pass originates from a guest QR code: assignQRCode derives both
    // registration_type and guest_pass_expires from the code, so the pass has to
    // be set up that way rather than by writing the fields onto the vehicle.
    const facility = await createFacility();
    const batch = await api('/api/functions/generateQRBatch', {
      method: 'POST',
      token: adminToken,
      body: {
        facility_id: facility.id,
        count: 1,
        batch_name: `${TAG} guest`,
        prefix: 'GST',
        code_type: 'guest',
        guest_duration_hours: 4,
      },
    });
    assert.equal(batch.status, 201);
    const code = batch.body[0].code_id;

    const vehicle = await api('/api/entities/Vehicle', {
      method: 'POST',
      token: adminToken,
      body: { plate_number: `GST-${TAG.slice(0, 4)}`, facility_id: facility.id, owner_name: 'Guest Owner' },
    });
    const assign = await api('/api/functions/assignQRCode', {
      method: 'POST',
      token: adminToken,
      body: { vehicle_id: vehicle.body.id, code_id: code },
    });
    assert.equal(assign.body.vehicle.registration_type, 'guest');
    assert.ok(assign.body.vehicle.guest_pass_expires, 'a guest QR must stamp an expiry');

    // While the pass is valid, entry is allowed.
    const allowed = await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    assert.equal(allowed.status, 201);

    // Wind the pass into the past and send the vehicle back out.
    await api(`/api/entities/Vehicle/${vehicle.body.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        guest_pass_expires: new Date(Date.now() - 3600 * 1000).toISOString(),
        is_inside: false,
      },
    });

    const denied = await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    assert.equal(denied.status, 403, 'an expired guest pass must be refused');
  });
});

describe('exit approval workflow', () => {
  test('hourly exit bills the owner, waits for approval, then clears the vehicle', async () => {
    const { code, vehicle } = await createScannableVehicle({ billing_mode: 'hourly', hourly_rate: 500 });
    await api('/api/scans/entry', {
      method: 'POST',
      token: adminToken,
      body: { qr_code_id: code, items: [{ name: 'Laptop', quantity: 1 }] },
    });

    const exit = await api('/api/scans/exit', {
      method: 'POST',
      token: adminToken,
      body: { qr_code_id: code, items_state: [{ name: 'Laptop', quantity: 1, confirmed: true }] },
    });
    assert.equal(exit.status, 201);
    assert.equal(exit.body.auto_approved, false, 'exit must await owner approval by default');
    assert.equal(exit.body.billing.amount, 500);
    const token = exit.body.exit_request.approval_token;
    assert.ok(token, 'an approval token must be issued');

    // Vehicle stays inside until the owner responds.
    const during = await api(`/api/entities/Vehicle/${vehicle.id}`, { token: adminToken });
    assert.equal(during.body.is_inside, true);

    const approve = await api('/api/exit/approve-by-token', {
      method: 'POST',
      body: { token, action: 'approve' },
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.request.status, 'approved');

    const after = await api(`/api/entities/Vehicle/${vehicle.id}`, { token: adminToken });
    assert.equal(after.body.is_inside, false);
    assert.ok(after.body.last_exit);

    const payments = await api(`/api/entities/Payment?vehicle_id=${vehicle.id}`, { token: adminToken });
    assert.equal(payments.body.length, 1);
    assert.equal(payments.body[0].amount, 500);
    assert.equal(payments.body[0].status, 'pending');
  });

  test('rejecting an exit keeps the vehicle inside', async () => {
    const { code, vehicle } = await createScannableVehicle({ billing_mode: 'free' });
    await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    const exit = await api('/api/scans/exit', { method: 'POST', token: adminToken, body: { qr_code_id: code } });

    const reject = await api('/api/exit/approve-by-token', {
      method: 'POST',
      body: { token: exit.body.exit_request.approval_token, action: 'reject' },
    });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.request.status, 'rejected');

    const after = await api(`/api/entities/Vehicle/${vehicle.id}`, { token: adminToken });
    assert.equal(after.body.is_inside, true, 'a rejected exit must not release the vehicle');
  });

  test('an invalid approval token is rejected', async () => {
    const res = await api('/api/exit/approve-by-token', {
      method: 'POST',
      body: { token: `bogus-${TAG}`, action: 'approve' },
    });
    assert.ok(res.status === 404 || res.status === 400, `expected 4xx, got ${res.status}`);
  });

  test('an approval token cannot be replayed', async () => {
    const { code } = await createScannableVehicle({ billing_mode: 'free' });
    await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    const exit = await api('/api/scans/exit', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    const token = exit.body.exit_request.approval_token;

    const first = await api('/api/exit/approve-by-token', { method: 'POST', body: { token, action: 'approve' } });
    assert.equal(first.status, 200);

    const second = await api('/api/exit/approve-by-token', { method: 'POST', body: { token, action: 'reject' } });
    assert.notEqual(second.body?.request?.status, 'rejected', 'a settled request must not flip state');
  });

  test('the owner sees only their own pending exit requests', async () => {
    const ownerEmail = `scoped-${TAG}@test.local`;
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { email: ownerEmail, password: 'OwnerPass123!', full_name: 'Scoped Owner' },
    });
    const { code } = await createScannableVehicle({ billing_mode: 'free' }, { owner_email: ownerEmail });
    await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });
    await api('/api/scans/exit', { method: 'POST', token: adminToken, body: { qr_code_id: code } });

    const mine = await api('/api/entities/ExitRequest?status=pending', { token: reg.body.token });
    assert.equal(mine.status, 200);
    assert.ok(mine.body.length >= 1);
    assert.ok(
      mine.body.every((r) => r.owner_email === ownerEmail),
      'an owner must not see other owners requests'
    );
  });
});

describe('dashboard statistics', () => {
  test('dashboard reflects a vehicle currently inside', async () => {
    const { code, facility } = await createScannableVehicle();
    await api('/api/scans/entry', { method: 'POST', token: adminToken, body: { qr_code_id: code } });

    const res = await api(`/api/stats/dashboard?facility_id=${facility.id}`, { token: adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.vehicles_total, 1);
    assert.equal(res.body.vehicles_inside, 1);
    assert.equal(res.body.entries_today, 1);
    assert.equal(res.body.weekly_traffic.length, 7);
  });

  test('owners cannot read staff dashboard stats', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { email: `nostats-${TAG}@test.local`, password: 'OwnerPass123!', full_name: 'Owner' },
    });
    const res = await api('/api/stats/dashboard', { token: reg.body.token });
    assert.equal(res.status, 403);
  });
});
