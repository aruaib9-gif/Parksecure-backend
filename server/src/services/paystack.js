const crypto = require('crypto');
const config = require('../config');

const PAYSTACK_BASE = 'https://api.paystack.co';

const paystackEnabled = () => !!config.paystackSecretKey;

async function initializeTransaction({ email, amount, reference, metadata, callback_url }) {
  if (!paystackEnabled()) {
    const err = new Error('Paystack is not configured (set PAYSTACK_SECRET_KEY)');
    err.status = 501;
    throw err;
  }
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100), // Paystack expects kobo
      reference,
      metadata,
      callback_url,
      currency: 'NGN',
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.status) {
    const err = new Error(json.message || 'Paystack initialization failed');
    err.status = 502;
    throw err;
  }
  return json.data; // { authorization_url, access_code, reference }
}

async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.paystackSecretKey}` },
  });
  const json = await res.json();
  if (!res.ok || !json.status) {
    const err = new Error(json.message || 'Paystack verification failed');
    err.status = 502;
    throw err;
  }
  return json.data;
}

function verifyWebhookSignature(rawBody, signature) {
  if (!paystackEnabled() || !signature) return false;
  const hash = crypto.createHmac('sha512', config.paystackSecretKey).update(rawBody).digest('hex');
  return hash === signature;
}

module.exports = { paystackEnabled, initializeTransaction, verifyTransaction, verifyWebhookSignature };
