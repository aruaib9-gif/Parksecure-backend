const express = require('express');
const prisma = require('../db');
const config = require('../config');
const { authenticate, requireRole, HttpError } = require('../middleware/auth');
const { facilityPrefix, normalizePrefix } = require('../services/qrcodes');
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
    const { facility_id, batch_name, count, code_type = 'permanent', guest_duration_hours } = req.body || {};
    if (!facility_id) throw new HttpError(400, 'facility_id is required');
    const n = parseInt(count, 10);
    if (!n || n < 1 || n > 500) throw new HttpError(400, 'count must be between 1 and 500');

    const facility = await prisma.facility.findUnique({ where: { id: facility_id } });
    if (!facility) throw new HttpError(404, 'Facility not found');
    // An explicit prefix wins; otherwise abbreviate the facility name so a
    // printed sticker identifies its site (Dominion City Church Ikeja -> DCCI).
    const prefix = req.body?.prefix
      ? normalizePrefix(req.body.prefix)
      : facilityPrefix(facility.name);

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

// Check a scanned QR code before assigning it: does it exist, and is it already
// on a vehicle? Staff scan a physical sticker and need to know immediately
// whether it is free, so this is a read-only precursor to assignQRCode.
// GET /api/functions/qrCodeStatus?code_id=DCCI-0001
router.get('/qrCodeStatus', requireRole(...STAFF), async (req, res, next) => {
  try {
    const codeId = String(req.query.code_id || '').trim();
    if (!codeId) throw new HttpError(400, 'code_id is required');

    const qr = await prisma.qRCode.findUnique({ where: { code_id: codeId } });
    if (!qr) {
      return res.json({
        code_id: codeId,
        exists: false,
        assignable: false,
        result: 'unknown_code',
        message: 'This code is not in the system. Generate a batch that includes it first.',
      });
    }

    // A code can be marked assigned, and separately a vehicle can point at it;
    // report the vehicle whenever one exists so stale state is still visible.
    const vehicle = await prisma.vehicle.findFirst({ where: { qr_code_id: codeId } });
    const facility = qr.facility_id
      ? await prisma.facility.findUnique({ where: { id: qr.facility_id } })
      : null;

    let result = 'available';
    let message = 'This code is available to assign.';
    let assignable = true;

    if (qr.status === 'deactivated') {
      result = 'deactivated';
      assignable = false;
      message = 'This code has been deactivated and cannot be assigned.';
    } else if (vehicle) {
      result = 'already_assigned';
      assignable = false;
      message = `Already assigned to ${vehicle.plate_number}${vehicle.owner_name ? ` (${vehicle.owner_name})` : ''}.`;
    } else if (qr.status === 'assigned') {
      // Marked assigned with no vehicle pointing at it — the vehicle was deleted.
      result = 'assigned_orphaned';
      assignable = true;
      message = 'Marked assigned but no vehicle holds it; it can be reassigned.';
    }

    res.json({
      code_id: codeId,
      exists: true,
      assignable,
      result,
      message,
      status: qr.status,
      code_type: qr.code_type,
      batch_name: qr.batch_name,
      facility: facility ? { id: facility.id, name: facility.name } : null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            plate_number: vehicle.plate_number,
            owner_name: vehicle.owner_name,
            owner_email: vehicle.owner_email,
          }
        : null,
    });
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
    if (qr.status === 'deactivated') throw new HttpError(409, 'This QR code has been deactivated and cannot be assigned.');

    // Name the holder rather than saying "assigned": staff scanning a sticker
    // need to know which vehicle already has it.
    const holder = await prisma.vehicle.findFirst({ where: { qr_code_id: code_id } });
    if (holder && holder.id !== vehicle_id) {
      throw new HttpError(
        409,
        `This QR code is already assigned to ${holder.plate_number}${holder.owner_name ? ` (${holder.owner_name})` : ''}.`
      );
    }
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
    // sent is a device count: zero means the user has no registered device.
    res.json({
      success: result.sent > 0,
      ...result,
      ...(result.sent === 0 ? { reason: 'no_registered_devices' } : {}),
    });
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
    if (!result.sent) {
      // Reporting "sent" when nothing left the server hides a misconfiguration
      // from the operator and misleads the person expecting the invite.
      return res.status(503).json({
        success: false,
        sent: false,
        reason: result.reason,
        error:
          result.reason === 'email_not_configured'
            ? 'Email is not configured on this server. Set RESEND_API_KEY (or SMTP_HOST/USER/PASS), then redeploy.'
            : result.error || 'The invite email could not be sent.',
      });
    }
    // messageId lets a delivery be traced in the provider dashboard.
    res.json({ success: true, sent: true, provider: result.provider, messageId: result.messageId });
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
