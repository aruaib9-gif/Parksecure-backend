const express = require('express');
const prisma = require('../db');
const { authenticate, requireRole, HttpError } = require('../middleware/auth');
const { createExitPayment } = require('./scans');
const { sendPushToEmails } = require('../services/push');

const router = express.Router();
const STAFF = ['security', 'facility_admin', 'park_admin', 'super_admin'];

async function resolveRequest(request, action, respondedBy) {
  if (!request) throw new HttpError(404, 'Exit request not found');
  if (request.status !== 'pending') {
    return { request, already_resolved: true };
  }
  const now = new Date();
  const updated = await prisma.exitRequest.update({
    where: { id: request.id },
    data: { status: action === 'approve' ? 'approved' : 'rejected', responded_at: now, responded_by: respondedBy },
  });

  if (action === 'approve') {
    await prisma.vehicle.updateMany({
      where: { id: request.vehicle_id },
      data: { is_inside: false, last_exit: now },
    });
    await prisma.scanLog.updateMany({
      where: { vehicle_id: request.vehicle_id, scan_type: 'exit', status: 'pending_approval' },
      data: { status: 'completed' },
    });
    if (updated.billing_amount > 0) {
      const existing = await prisma.payment.findFirst({ where: { exit_request_id: updated.id } });
      if (!existing) {
        const facility = await prisma.facility.findUnique({ where: { id: updated.facility_id } }).catch(() => null);
        await createExitPayment(updated, {
          amount: updated.billing_amount,
          durationMinutes: updated.duration_minutes,
          mode: facility?.billing_mode || 'standard',
          currency: facility?.currency || 'NGN',
        });
      }
    }
  } else {
    await prisma.scanLog.updateMany({
      where: { vehicle_id: request.vehicle_id, scan_type: 'exit', status: 'pending_approval' },
      data: { status: 'denied' },
    });
  }

  // Tell the security officer who requested it.
  if (request.requested_by) {
    sendPushToEmails([request.requested_by], {
      title: `Exit ${action === 'approve' ? 'approved' : 'rejected'}`,
      body: `${request.plate_number || 'Vehicle'} exit was ${action === 'approve' ? 'approved' : 'rejected'} by the owner`,
      data: { type: 'exit_response', exit_request_id: request.id },
    }).catch(() => {});
  }
  return { request: updated, already_resolved: false };
}

// Public one-tap approval links (from email / WhatsApp). Returns a tiny HTML page.
router.get('/respond/:token', async (req, res, next) => {
  try {
    const action = req.query.action === 'reject' ? 'reject' : 'approve';
    const request = await prisma.exitRequest.findUnique({ where: { approval_token: req.params.token } });
    if (!request) return res.status(404).send(page('Link not found', 'This approval link is invalid or has expired.'));
    const { already_resolved } = await resolveRequest(request, action, 'owner_link');
    const title = already_resolved
      ? `Already ${request.status}`
      : action === 'approve'
        ? 'Exit Approved ✓'
        : 'Exit Rejected';
    const msg = already_resolved
      ? `This exit request was already ${request.status}.`
      : action === 'approve'
        ? `Vehicle ${request.plate_number || ''} has been cleared to exit.`
        : `Vehicle ${request.plate_number || ''} was denied exit. Contact security if this was a mistake.`;
    res.send(page(title, msg));
  } catch (err) {
    next(err);
  }
});

// JSON token endpoint (mirror of the old approveExitByToken function).
router.post('/approve-by-token', async (req, res, next) => {
  try {
    const { token, action } = req.body || {};
    if (!token) throw new HttpError(400, 'token is required');
    const request = await prisma.exitRequest.findUnique({ where: { approval_token: token } });
    const result = await resolveRequest(request, action === 'reject' ? 'reject' : 'approve', 'owner_token');
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Staff approval from the Exit Approvals screen.
router.post('/:id/approve', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const request = await prisma.exitRequest.findUnique({ where: { id: req.params.id } });
    const result = await resolveRequest(request, 'approve', req.user.email);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const request = await prisma.exitRequest.findUnique({ where: { id: req.params.id } });
    const result = await resolveRequest(request, 'reject', req.user.email);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// Owner responds from the mobile app (must own the request).
router.post('/:id/respond', authenticate, async (req, res, next) => {
  try {
    const request = await prisma.exitRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw new HttpError(404, 'Exit request not found');
    const isOwner = request.owner_email && request.owner_email === req.user.email;
    const isStaff = STAFF.includes(req.user.role);
    if (!isOwner && !isStaff) throw new HttpError(403, 'Not allowed to respond to this request');
    const action = req.body?.action === 'reject' ? 'reject' : 'approve';
    const result = await resolveRequest(request, action, req.user.email);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

function page(title, message) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — ParkSecure</title></head>
  <body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;background:#f0fdf4">
  <div style="text-align:center;background:#fff;padding:40px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.08);max-width:420px">
  <h1 style="color:#0f766e;margin-top:0">${title}</h1><p style="color:#374151">${message}</p>
  <p style="color:#9ca3af;font-size:12px">ParkSecure Vehicle Security</p></div></body></html>`;
}

module.exports = router;
