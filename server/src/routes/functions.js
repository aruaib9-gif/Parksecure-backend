const express = require('express');
const prisma = require('../db');
const config = require('../config');
const { authenticate, requireRole, HttpError } = require('../middleware/auth');
const { sendEmail } = require('../services/email');
const { sendPushToEmails } = require('../services/push');
const { runSecurityDetection } = require('../jobs/securityAlerts');

const router = express.Router();
const STAFF = ['security', 'facility_admin', 'park_admin', 'super_admin'];
const ADMIN = ['facility_admin', 'park_admin', 'super_admin'];

router.use(authenticate);

// Generate a batch of sequential QR codes (staff).
// POST /api/functions/generateQRBatch { facility_id, batch_name, count, prefix?, code_type?, guest_duration_hours? }
router.post('/generateQRBatch', requireRole(...STAFF), async (req, res, next) => {
  try {
    const { facility_id, batch_name, count, prefix = 'PSK', code_type = 'permanent', guest_duration_hours } = req.body || {};
    if (!facility_id) throw new HttpError(400, 'facility_id is required');
    const n = parseInt(count, 10);
    if (!n || n < 1 || n > 500) throw new HttpError(400, 'count must be between 1 and 500');

    // Continue sequence from the highest existing code with this prefix.
    const last = await prisma.qRCode.findFirst({
      where: { code_id: { startsWith: `${prefix}-` } },
      orderBy: { code_id: 'desc' },
    });
    let next = 1;
    if (last) {
      const m = last.code_id.match(/(\d+)$/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    const data = Array.from({ length: n }, (_, i) => ({
      code_id: `${prefix}-${String(next + i).padStart(4, '0')}`,
      facility_id,
      batch_name: batch_name || `Batch ${new Date().toISOString().slice(0, 10)}`,
      code_type,
      guest_duration_hours: code_type === 'guest' ? Number(guest_duration_hours) || 8 : null,
      generated_by: req.user.email,
    }));
    const created = await prisma.$transaction(data.map((d) => prisma.qRCode.create({ data: d })));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Assign an available QR code to a vehicle.
router.post('/assignQRCode', requireRole(...STAFF), async (req, res, next) => {
  try {
    const { vehicle_id, code_id } = req.body || {};
    if (!vehicle_id || !code_id) throw new HttpError(400, 'vehicle_id and code_id are required');
    const qr = await prisma.qRCode.findUnique({ where: { code_id } });
    if (!qr) throw new HttpError(404, 'QR code not found');
    if (qr.status !== 'available') throw new HttpError(409, `QR code is ${qr.status}`);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicle_id } });
    if (!vehicle) throw new HttpError(404, 'Vehicle not found');

    const guestExpiry =
      qr.code_type === 'guest' && qr.guest_duration_hours
        ? new Date(Date.now() + qr.guest_duration_hours * 3600 * 1000)
        : undefined;

    const [updatedQr, updatedVehicle] = await prisma.$transaction([
      prisma.qRCode.update({ where: { id: qr.id }, data: { status: 'assigned', vehicle_id } }),
      prisma.vehicle.update({
        where: { id: vehicle_id },
        data: {
          qr_code_id: code_id,
          registered: true,
          qr_requested: false,
          facility_id: vehicle.facility_id || qr.facility_id,
          registration_type: qr.code_type,
          ...(guestExpiry ? { guest_pass_expires: guestExpiry } : {}),
        },
      }),
    ]);
    res.json({ qr_code: updatedQr, vehicle: updatedVehicle });
  } catch (err) {
    next(err);
  }
});

// Run the security alert detection immediately (also runs hourly via cron).
router.post('/detectSecurityAlerts', requireRole(...ADMIN), async (req, res, next) => {
  try {
    const result = await runSecurityDetection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Send a push notification to a user (staff only).
router.post('/sendPushNotification', requireRole(...STAFF), async (req, res, next) => {
  try {
    const { email, ownerEmail, title, body, data } = req.body || {};
    const target = email || ownerEmail;
    if (!target || !title) throw new HttpError(400, 'email and title are required');
    const result = await sendPushToEmails([target], { title, body: body || '', data });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Invite a vehicle owner by email.
router.post('/sendInviteEmail', requireRole(...STAFF), async (req, res, next) => {
  try {
    const { email, full_name, plate_number } = req.body || {};
    if (!email) throw new HttpError(400, 'email is required');
    const result = await sendEmail({
      to: email,
      subject: 'You have been invited to ParkSecure',
      html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#0f766e">Welcome to ParkSecure</h2>
        <p>Hello ${full_name || ''},</p>
        <p>Your vehicle ${plate_number ? `<b>${plate_number}</b> ` : ''}has been registered with ParkSecure.
        Download the ParkSecure app and create an account with this email address (<b>${email}</b>) to manage
        your vehicle, approve exits and view your parking history.</p>
        <p style="color:#6b7280;font-size:12px">ParkSecure Vehicle Security</p>
      </div>`,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// AI license plate recognition — proxies to Plate Recognizer when configured.
router.post('/recognizePlate', requireRole(...STAFF), async (req, res, next) => {
  try {
    if (!config.plateRecognizerToken) {
      throw new HttpError(501, 'Plate recognition is not configured (set PLATE_RECOGNIZER_TOKEN)');
    }
    const { image_base64 } = req.body || {};
    if (!image_base64) throw new HttpError(400, 'image_base64 is required');
    const form = new FormData();
    form.append('upload', image_base64);
    const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: { Authorization: `Token ${config.plateRecognizerToken}` },
      body: form,
    });
    const json = await response.json();
    const plate = json.results?.[0]?.plate?.toUpperCase() || null;
    res.json({ plate, raw: json.results || [] });
  } catch (err) {
    next(err);
  }
});

// Gate control — POSTs to the webhook URL configured in AppConfig key "gate_control".
router.post('/openGate', requireRole(...STAFF), async (req, res, next) => {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'gate_control' } });
    const gate = cfg?.value_json;
    if (!gate?.enabled || !gate?.webhook_url) {
      throw new HttpError(501, 'Gate control is not configured (AppConfig key "gate_control")');
    }
    const allowedRoles = gate.allowed_roles || STAFF;
    if (!allowedRoles.includes(req.user.role)) throw new HttpError(403, 'Your role cannot open the gate');
    const { facilityId, gateId, plateNumber, scanType } = req.body || {};
    const response = await fetch(gate.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(gate.auth_header ? { Authorization: gate.auth_header } : {}) },
      body: JSON.stringify({ facility_id: facilityId, gate_id: gateId || gate.default_gate_id, plate_number: plateNumber, scan_type: scanType, opened_by: req.user.email }),
    });
    res.json({ success: response.ok, status: response.status });
  } catch (err) {
    next(err);
  }
});

// Email payment reminders for overdue/pending bills (admin).
router.post('/sendPaymentReminders', requireRole(...ADMIN), async (req, res, next) => {
  try {
    const bills = await prisma.userBill.findMany({
      where: { status: { in: ['pending', 'overdue'] }, owner_email: { not: null } },
      take: 200,
    });
    let sent = 0;
    for (const bill of bills) {
      const r = await sendEmail({
        to: bill.owner_email,
        subject: `Payment reminder: ${bill.title}`,
        html: `<p>Dear ${bill.owner_name || 'Customer'},</p>
          <p>This is a reminder that your bill <b>${bill.title}</b> of <b>${bill.currency} ${bill.amount.toLocaleString()}</b> is ${bill.status}.
          ${bill.due_date ? `Due date: ${new Date(bill.due_date).toDateString()}.` : ''}</p>
          <p>Please open the ParkSecure app to pay.</p>`,
      }).catch(() => ({ sent: false }));
      if (r.sent) sent++;
    }
    res.json({ success: true, reminders_sent: sent, bills_considered: bills.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
