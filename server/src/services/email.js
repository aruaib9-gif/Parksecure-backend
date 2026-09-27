/**
 * email.js — one send function, three interchangeable transports.
 *
 *   EMAIL_PROVIDER=resend   → Resend HTTP API (recommended for production)
 *   EMAIL_PROVIDER=smtp     → nodemailer (any SMTP host)
 *   EMAIL_PROVIDER=console  → log only (default when nothing is configured)
 *
 * The provider is picked automatically: Resend if RESEND_API_KEY is set, else
 * SMTP if SMTP_HOST is set, else console. Resend goes over plain HTTPS, which
 * avoids the outbound SMTP port restrictions common on hosted platforms.
 *
 * sendEmail() never throws on a delivery failure — it returns { sent: false }
 * with a reason, so a failed notification can't break the request that
 * triggered it. Callers that care inspect `sent`.
 */
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function smtpTransport() {
  if (transporter) return transporter;
  if (!config.smtp.host) return null;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

/** Which transport will be used, given the current configuration. */
function activeProvider() {
  const forced = (config.emailProvider || '').toLowerCase();
  if (forced === 'resend') return config.resendApiKey ? 'resend' : 'console';
  if (forced === 'smtp') return config.smtp.host ? 'smtp' : 'console';
  if (forced === 'console') return 'console';
  if (config.resendApiKey) return 'resend';
  if (config.smtp.host) return 'smtp';
  return 'console';
}

const emailEnabled = () => activeProvider() !== 'console';

async function sendViaResend({ to, from, subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface Resend's own message — usually an unverified domain or bad key.
    const reason = data?.message || data?.error?.message || res.statusText;
    throw new Error(`Resend rejected the message (${res.status}): ${reason}`);
  }
  return data?.id;
}

async function sendEmail({ to, subject, html, text, from, replyTo }) {
  if (!to) throw new Error('sendEmail: "to" is required');
  const fromAddress = from || config.smtp.from;
  const provider = activeProvider();

  if (provider === 'console') {
    console.warn(`[email] no provider configured — skipping email to ${to}: ${subject}`);
    return { sent: false, provider, reason: 'email_not_configured' };
  }

  try {
    if (provider === 'resend') {
      const id = await sendViaResend({ to, from: fromAddress, subject, html, text, replyTo });
      return { sent: true, provider, messageId: id };
    }
    const info = await smtpTransport().sendMail({
      from: fromAddress, to, subject, html, text, replyTo,
    });
    return { sent: true, provider, messageId: info.messageId };
  } catch (err) {
    console.error(`[email:failed] provider=${provider} to=${to} subject="${subject}":`, err.message);
    return { sent: false, provider, reason: 'send_failed', error: err.message };
  }
}

function exitApprovalEmail({ ownerName, plateNumber, facilityName, durationText, billingAmount, currency, approveUrl, rejectUrl, discrepancyText }) {
  const amount = billingAmount > 0 ? `<p><b>Parking fee:</b> ${currency || 'NGN'} ${Number(billingAmount).toLocaleString()}</p>` : '';
  const discrepancy = discrepancyText ? `<p style="color:#b91c1c"><b>Item discrepancies:</b> ${discrepancyText}</p>` : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#0f766e">ParkSecure — Exit Approval Needed</h2>
    <p>Hello ${ownerName || 'Vehicle Owner'},</p>
    <p>Your vehicle <b>${plateNumber}</b> is requesting to exit <b>${facilityName || 'the facility'}</b>.</p>
    ${durationText ? `<p><b>Parked for:</b> ${durationText}</p>` : ''}
    ${amount}
    ${discrepancy}
    <div style="margin:24px 0">
      <a href="${approveUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin-right:12px">Approve Exit</a>
      <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Reject</a>
    </div>
    <p style="color:#6b7280;font-size:12px">If you did not expect this request, reject it and contact facility security immediately.</p>
  </div>`;
}

module.exports = { sendEmail, emailEnabled, activeProvider, exitApprovalEmail };
