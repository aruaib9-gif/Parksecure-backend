const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

const emailEnabled = () => !!transporter;

async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.warn(`[email] SMTP not configured — skipping email to ${to}: ${subject}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, html, text });
  return { sent: true };
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

module.exports = { sendEmail, emailEnabled, exitApprovalEmail };
