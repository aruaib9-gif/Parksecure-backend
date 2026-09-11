const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const config = require('../config');
const { authenticate, requireRole, HttpError } = require('../middleware/auth');
const { computeBilling, durationText } = require('../services/billing');
const { sendEmail, exitApprovalEmail } = require('../services/email');
const { sendPushToEmails } = require('../services/push');

const router = express.Router();
const STAFF = ['security', 'facility_admin', 'park_admin', 'super_admin'];

// Look up a vehicle by scanned QR code (staff scanner flow).
// GET /api/scans/lookup?code=PSK-0001
router.get('/lookup', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) throw new HttpError(400, 'code query param is required');
    const qr = await prisma.qRCode.findUnique({ where: { code_id: code } });
    const vehicle = await prisma.vehicle.findFirst({ where: { qr_code_id: code } });
    const facilityId = vehicle?.facility_id || qr?.facility_id || null;
    const facility = facilityId ? await prisma.facility.findUnique({ where: { id: facilityId } }) : null;

    let result = 'ok';
    if (!qr && !vehicle) result = 'unknown_code';
    else if (!vehicle) result = 'unregistered';
    else if (vehicle.status === 'blacklisted') result = 'blacklisted';
    else if (
      vehicle.registration_type === 'guest' &&
      vehicle.guest_pass_expires &&
      new Date(vehicle.guest_pass_expires) < new Date()
    )
      result = 'guest_expired';

    res.json({ result, qr_code: qr, vehicle, facility });
  } catch (err) {
    next(err);
  }
});

// Record a vehicle ENTRY.
router.post('/entry', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const { qr_code_id, vehicle_id, driver_name, driver_phone, items, booth_photo_urls, notes } = req.body || {};
    if (!qr_code_id && !vehicle_id) throw new HttpError(400, 'qr_code_id or vehicle_id is required');

    const vehicle = vehicle_id
      ? await prisma.vehicle.findUnique({ where: { id: vehicle_id } })
      : await prisma.vehicle.findFirst({ where: { qr_code_id } });
    if (!vehicle) throw new HttpError(404, 'Vehicle not found for this code');

    if (vehicle.status === 'blacklisted') {
      const scan = await denyScan(vehicle, 'entry', req.user, 'Blacklisted vehicle attempted entry');
      return res.status(403).json({ error: 'Vehicle is blacklisted', denied: true, scan_log: scan });
    }
    if (
      vehicle.registration_type === 'guest' &&
      vehicle.guest_pass_expires &&
      new Date(vehicle.guest_pass_expires) < new Date()
    ) {
      throw new HttpError(403, 'Guest pass has expired');
    }
    if (vehicle.is_inside) throw new HttpError(409, 'Vehicle is already inside the facility');

    const now = new Date();
    const [scanLog] = await prisma.$transaction([
      prisma.scanLog.create({
        data: {
          vehicle_id: vehicle.id,
          qr_code_id: vehicle.qr_code_id || qr_code_id || 'manual',
          facility_id: vehicle.facility_id,
          scan_type: 'entry',
          scanned_by: req.user.email,
          scanned_by_name: req.user.full_name,
          plate_number: vehicle.plate_number,
          owner_name: vehicle.owner_name,
          driver_name: driver_name || vehicle.driver_name,
          driver_phone: driver_phone || vehicle.driver_phone,
          timestamp: now,
          status: 'completed',
          items_declared: items || [],
          booth_photo_urls: booth_photo_urls || [],
          notes: notes || null,
        },
      }),
      prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          is_inside: true,
          last_entry: now,
          driver_name: driver_name || vehicle.driver_name,
          driver_phone: driver_phone || vehicle.driver_phone,
        },
      }),
    ]);

    if (Array.isArray(items) && items.length > 0) {
      await prisma.itemLog.createMany({
        data: items.map((item) => ({
          scan_log_id: scanLog.id,
          vehicle_id: vehicle.id,
          facility_id: vehicle.facility_id,
          plate_number: vehicle.plate_number,
          owner_name: vehicle.owner_name,
          driver_name: driver_name || vehicle.driver_name,
          scan_type: 'entry',
          item_name: item.name || item.item_name || 'Item',
          quantity: item.quantity != null ? Number(item.quantity) : 1,
          description: item.description || null,
          photo_urls: item.photo_urls || [],
          logged_by: req.user.email,
        })),
      });
    }

    if (vehicle.owner_email) {
      sendPushToEmails([vehicle.owner_email], {
        title: 'Vehicle Entry',
        body: `${vehicle.plate_number} entered the facility`,
        data: { type: 'entry', vehicle_id: vehicle.id },
      }).catch(() => {});
    }

    res.status(201).json({ scan_log: scanLog, vehicle: { ...vehicle, is_inside: true, last_entry: now } });
  } catch (err) {
    next(err);
  }
});

// Record a vehicle EXIT -> creates an ExitRequest needing owner approval
// (unless the owner enabled security override, which auto-approves).
router.post('/exit', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const { qr_code_id, vehicle_id, items_state, extra_items, booth_photo_urls, notes } = req.body || {};
    if (!qr_code_id && !vehicle_id) throw new HttpError(400, 'qr_code_id or vehicle_id is required');

    const vehicle = vehicle_id
      ? await prisma.vehicle.findUnique({ where: { id: vehicle_id } })
      : await prisma.vehicle.findFirst({ where: { qr_code_id } });
    if (!vehicle) throw new HttpError(404, 'Vehicle not found for this code');
    if (vehicle.status === 'blacklisted') {
      const scan = await denyScan(vehicle, 'exit', req.user, 'Blacklisted vehicle attempted exit');
      return res.status(403).json({ error: 'Vehicle is blacklisted', denied: true, scan_log: scan });
    }
    if (!vehicle.is_inside) throw new HttpError(409, 'Vehicle is not inside the facility');

    const facility = vehicle.facility_id
      ? await prisma.facility.findUnique({ where: { id: vehicle.facility_id } })
      : null;
    const now = new Date();
    const billing = computeBilling(facility, vehicle.last_entry, now);

    // Item discrepancy detection against entry declarations.
    const discrepancyParts = [];
    if (Array.isArray(items_state)) {
      for (const item of items_state) {
        if (item.confirmed === false || item.discrepancy) {
          discrepancyParts.push(`${item.name}: ${item.discrepancy || 'not confirmed on exit'}`);
        }
      }
    }
    const discrepancies = discrepancyParts.join('; ') || null;

    // Does the owner allow security to approve without them?
    const ownerSettings = vehicle.owner_email
      ? await prisma.notificationSettings.findFirst({ where: { user_email: vehicle.owner_email } })
      : null;
    const autoApprove = !vehicle.owner_email || !!ownerSettings?.security_override_enabled;

    const approvalToken = crypto.randomUUID();
    const exitRequest = await prisma.exitRequest.create({
      data: {
        vehicle_id: vehicle.id,
        qr_code_id: vehicle.qr_code_id,
        facility_id: vehicle.facility_id || facility?.id || 'unknown',
        owner_name: vehicle.owner_name,
        owner_phone: vehicle.owner_phone,
        owner_email: vehicle.owner_email,
        plate_number: vehicle.plate_number,
        requested_by: req.user.email,
        status: autoApprove ? 'approved' : 'pending',
        responded_at: autoApprove ? now : null,
        responded_by: autoApprove ? 'security_override' : null,
        approval_token: approvalToken,
        billing_amount: billing.amount,
        duration_minutes: billing.durationMinutes,
        notes: notes || null,
      },
    });

    const scanLog = await prisma.scanLog.create({
      data: {
        vehicle_id: vehicle.id,
        qr_code_id: vehicle.qr_code_id || 'manual',
        facility_id: vehicle.facility_id,
        scan_type: 'exit',
        scanned_by: req.user.email,
        scanned_by_name: req.user.full_name,
        plate_number: vehicle.plate_number,
        owner_name: vehicle.owner_name,
        driver_name: vehicle.driver_name,
        timestamp: now,
        status: autoApprove ? 'completed' : 'pending_approval',
        items_declared: items_state || [],
        booth_photo_urls: booth_photo_urls || [],
        security_confirmed: true,
        discrepancies,
        notes: notes || null,
      },
    });

    // Log exit item verifications and any undeclared extras.
    const itemLogs = [];
    for (const item of items_state || []) {
      itemLogs.push({
        scan_log_id: scanLog.id,
        vehicle_id: vehicle.id,
        facility_id: vehicle.facility_id,
        plate_number: vehicle.plate_number,
        owner_name: vehicle.owner_name,
        driver_name: vehicle.driver_name,
        scan_type: 'exit',
        item_name: item.name || 'Item',
        quantity: item.quantity != null ? Number(item.quantity) : 1,
        verified_on_exit: item.confirmed !== false,
        discrepancy_note: item.discrepancy || null,
        photo_urls: item.photo_urls || [],
        logged_by: req.user.email,
      });
    }
    for (const item of extra_items || []) {
      itemLogs.push({
        scan_log_id: scanLog.id,
        vehicle_id: vehicle.id,
        facility_id: vehicle.facility_id,
        plate_number: vehicle.plate_number,
        owner_name: vehicle.owner_name,
        driver_name: vehicle.driver_name,
        scan_type: 'exit',
        item_name: item.name || 'Item',
        quantity: item.quantity != null ? Number(item.quantity) : 1,
        description: item.description || 'Undeclared item found on exit',
        photo_urls: item.photo_urls || [],
        logged_by: req.user.email,
      });
    }
    if (itemLogs.length > 0) await prisma.itemLog.createMany({ data: itemLogs });

    if (discrepancies) {
      await prisma.securityAlert.create({
        data: {
          alert_type: 'item_discrepancy',
          severity: 'high',
          facility_id: vehicle.facility_id,
          facility_name: facility?.name,
          vehicle_id: vehicle.id,
          plate_number: vehicle.plate_number,
          owner_name: vehicle.owner_name,
          driver_name: vehicle.driver_name,
          scan_log_id: scanLog.id,
          title: `Item discrepancy on exit — ${vehicle.plate_number}`,
          description: 'Items declared at entry do not match items on exit',
          discrepancy_details: discrepancies,
        },
      });
    }

    let payment = null;
    if (autoApprove) {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { is_inside: false, last_exit: now },
      });
      if (billing.amount > 0) {
        payment = await createExitPayment(exitRequest, billing);
      }
    } else {
      // Notify the owner: push + email with one-tap approve/reject links.
      const approveUrl = `${config.appBaseUrl}/api/exit/respond/${approvalToken}?action=approve`;
      const rejectUrl = `${config.appBaseUrl}/api/exit/respond/${approvalToken}?action=reject`;
      if (vehicle.owner_email) {
        sendPushToEmails([vehicle.owner_email], {
          title: 'Exit Approval Needed',
          body: `${vehicle.plate_number} is requesting to exit${billing.amount > 0 ? ` — fee ₦${billing.amount.toLocaleString()}` : ''}`,
          data: { type: 'exit_request', exit_request_id: exitRequest.id, approval_token: approvalToken },
        }).catch(() => {});
        if (ownerSettings?.notify_email !== false) {
          sendEmail({
            to: vehicle.owner_email,
            subject: `Exit approval needed for ${vehicle.plate_number}`,
            html: exitApprovalEmail({
              ownerName: vehicle.owner_name,
              plateNumber: vehicle.plate_number,
              facilityName: facility?.name,
              durationText: durationText(billing.durationMinutes),
              billingAmount: billing.amount,
              currency: billing.currency,
              approveUrl,
              rejectUrl,
              discrepancyText: discrepancies,
            }),
          }).catch((e) => console.error('[email] exit approval failed:', e.message));
        }
      }
    }

    // WhatsApp deep link the scanner UI can open if the owner prefers WhatsApp.
    let whatsappUrl = null;
    if (ownerSettings?.notify_whatsapp && (ownerSettings.whatsapp_number || vehicle.owner_phone)) {
      const phone = (ownerSettings.whatsapp_number || vehicle.owner_phone).replace(/[^0-9]/g, '');
      const msg = encodeURIComponent(
        `ParkSecure: Your vehicle ${vehicle.plate_number} is requesting to exit. Approve: ${config.appBaseUrl}/api/exit/respond/${approvalToken}?action=approve`
      );
      whatsappUrl = `https://wa.me/${phone}?text=${msg}`;
    }

    res.status(201).json({
      exit_request: exitRequest,
      scan_log: scanLog,
      payment,
      auto_approved: autoApprove,
      billing,
      whatsapp_url: whatsappUrl,
      discrepancies,
    });
  } catch (err) {
    next(err);
  }
});

async function denyScan(vehicle, scanType, user, reason) {
  const facility = vehicle.facility_id
    ? await prisma.facility.findUnique({ where: { id: vehicle.facility_id } })
    : null;
  const scan = await prisma.scanLog.create({
    data: {
      vehicle_id: vehicle.id,
      qr_code_id: vehicle.qr_code_id || 'manual',
      facility_id: vehicle.facility_id,
      scan_type: scanType,
      scanned_by: user.email,
      scanned_by_name: user.full_name,
      plate_number: vehicle.plate_number,
      owner_name: vehicle.owner_name,
      status: 'denied',
      notes: reason,
    },
  });
  await prisma.securityAlert.create({
    data: {
      alert_type: 'blacklist_attempt',
      severity: 'critical',
      facility_id: vehicle.facility_id,
      facility_name: facility?.name,
      vehicle_id: vehicle.id,
      plate_number: vehicle.plate_number,
      owner_name: vehicle.owner_name,
      scan_log_id: scan.id,
      title: `Blacklisted vehicle ${scanType} attempt — ${vehicle.plate_number}`,
      description: reason,
    },
  });
  return scan;
}

async function createExitPayment(exitRequest, billing) {
  return prisma.payment.create({
    data: {
      vehicle_id: exitRequest.vehicle_id,
      facility_id: exitRequest.facility_id,
      exit_request_id: exitRequest.id,
      amount: billing.amount,
      currency: billing.currency,
      billing_mode: billing.mode,
      duration_minutes: billing.durationMinutes,
      status: 'pending',
      plate_number: exitRequest.plate_number,
      owner_name: exitRequest.owner_name,
    },
  });
}

module.exports = { router, createExitPayment };
