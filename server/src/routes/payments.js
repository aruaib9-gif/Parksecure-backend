const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const { authenticate, requireRole, HttpError, isStaff } = require('../middleware/auth');
const paystack = require('../services/paystack');

const router = express.Router();
const STAFF = ['security', 'facility_admin', 'park_admin', 'super_admin'];

// Initialize a Paystack transaction for a Payment / UserBill / SubscriptionPayment.
router.post('/paystack/initialize', authenticate, async (req, res, next) => {
  try {
    const { record_type, record_id, email } = req.body || {};
    const models = { payment: 'payment', user_bill: 'userBill', subscription: 'subscriptionPayment' };
    const model = models[record_type];
    if (!model) throw new HttpError(400, `record_type must be one of: ${Object.keys(models).join(', ')}`);
    const record = await prisma[model].findUnique({ where: { id: record_id } });
    if (!record) throw new HttpError(404, 'Billing record not found');
    if (record.status === 'paid') throw new HttpError(409, 'This record is already paid');

    const payerEmail = email || record.owner_email || record.email || req.user.email;
    const reference = `PS-${record_type}-${record.id}-${crypto.randomBytes(4).toString('hex')}`;
    const data = await paystack.initializeTransaction({
      email: payerEmail,
      amount: record.amount,
      reference,
      metadata: { record_type, record_id: record.id },
    });

    const refField = model === 'payment' ? 'reference' : 'paystack_reference';
    await prisma[model].update({ where: { id: record.id }, data: { [refField]: reference } });
    res.json({ authorization_url: data.authorization_url, reference, access_code: data.access_code });
  } catch (err) {
    next(err);
  }
});

// Client-side verification callback after Paystack checkout completes.
router.post('/paystack/verify', authenticate, async (req, res, next) => {
  try {
    const { reference } = req.body || {};
    if (!reference) throw new HttpError(400, 'reference is required');
    const tx = await paystack.verifyTransaction(reference);
    if (tx.status !== 'success') return res.json({ verified: false, status: tx.status });
    const updated = await markPaidByReference(reference, 'paystack');
    res.json({ verified: true, updated });
  } catch (err) {
    next(err);
  }
});

// Manual settlement (cash) or waiver by staff.
router.post('/:id/mark-paid', authenticate, requireRole(...STAFF), async (req, res, next) => {
  try {
    const { method } = req.body || {};
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: { status: 'paid', payment_method: method || 'manual', paid_at: new Date() },
    });
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/waive', authenticate, requireRole('facility_admin', 'park_admin', 'super_admin'), async (req, res, next) => {
  try {
    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: { status: 'waived', paid_at: new Date() },
    });
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// A vehicle owner's outstanding balance across bills and parking payments.
router.get('/my-balance', authenticate, async (req, res, next) => {
  try {
    if (isStaff(req.user)) return res.json({ bills: [], payments: [], total_due: 0 });
    const bills = await prisma.userBill.findMany({
      where: { owner_email: req.user.email, status: { in: ['pending', 'overdue'] } },
    });
    const vehicles = await prisma.vehicle.findMany({ where: { owner_email: req.user.email }, select: { id: true } });
    const payments = await prisma.payment.findMany({
      where: { vehicle_id: { in: vehicles.map((v) => v.id) }, status: 'pending' },
    });
    const total = [...bills, ...payments].reduce((sum, r) => sum + (r.amount || 0), 0);
    res.json({ bills, payments, total_due: total });
  } catch (err) {
    next(err);
  }
});

async function markPaidByReference(reference, method) {
  const now = new Date();
  const updated = [];
  const payment = await prisma.payment.findFirst({ where: { reference } });
  if (payment) {
    updated.push(await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'paid', payment_method: method, paid_at: now },
    }));
  }
  const bill = await prisma.userBill.findFirst({ where: { paystack_reference: reference } });
  if (bill) {
    updated.push(await prisma.userBill.update({
      where: { id: bill.id },
      data: { status: 'paid', payment_method: method, paid_at: now },
    }));
  }
  const sub = await prisma.subscriptionPayment.findFirst({ where: { paystack_reference: reference } });
  if (sub) {
    updated.push(await prisma.subscriptionPayment.update({
      where: { id: sub.id },
      data: { status: 'paid', paid_at: now },
    }));
  }
  return updated;
}

// Paystack webhook (raw body needed for signature check — mounted with express.raw upstream).
async function paystackWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];
  const raw = req.body; // Buffer
  if (!paystack.verifyWebhookSignature(raw, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const event = JSON.parse(raw.toString('utf8'));
  if (event.event === 'charge.success') {
    await markPaidByReference(event.data.reference, 'paystack');
  }
  res.json({ received: true });
}

module.exports = { router, paystackWebhook };
