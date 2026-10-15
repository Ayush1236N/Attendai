const nodemailer = require('nodemailer');
const env = require('../config/environment');
const logger = require('./logger');

// Centralized email sending. If SMTP credentials aren't configured (typical
// during local development), we don't crash — we log the email to the
// console instead so the flow (password reset, 2FA notices, etc.) can still
// be exercised end-to-end without a real mail server.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    return null; // not configured -> caller falls back to console logging
  }
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();

  if (!t) {
    logger.warn(
      `SMTP not configured — printing email instead of sending it.\n` +
        `To: ${to}\nSubject: ${subject}\n${text || html}`
    );
    return { delivered: false, reason: 'smtp_not_configured' };
  }

  try {
    await t.sendMail({ from: env.smtp.from || 'no-reply@attendai.app', to, subject, html, text });
    return { delivered: true };
  } catch (err) {
    // Don't turn a mail-server problem into a 500 on the forgot-password
    // endpoint (that would also reveal which emails exist). Log it loudly.
    logger.error(`Email to ${to} FAILED: ${err.message}`);
    return { delivered: false, reason: err.message };
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function isConfigured() {
  return !!(env.smtp.host && env.smtp.user && env.smtp.pass);
}

// Used by the super-admin "send test email" button and the startup log.
async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: 'Attendai test email',
    text: 'If you can read this, password-reset emails will be delivered.',
    html: '<p>If you can read this, Attendai password-reset emails will be delivered.</p>',
  });
}

async function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes }) {
  return sendEmail({
    to,
    subject: 'Reset your Attendai password',
    text:
      `Hi ${name},\n\nWe received a request to reset your password. ` +
      `Click the link below to choose a new one (valid for ${expiresInMinutes} minutes):\n\n${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html: `
      <p>Hi ${esc(name)},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one.
      This link is valid for <strong>${expiresInMinutes} minutes</strong>.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;
        border-radius:6px;text-decoration:none;">Reset password</a></p>
      <p>Or copy this link into your browser:<br>${resetUrl}</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

async function send2faEnabledEmail({ to, name }) {
  return sendEmail({
    to,
    subject: 'Two-factor authentication enabled',
    text: `Hi ${name}, two-factor authentication was just enabled on your account. If this wasn't you, contact your administrator immediately.`,
    html: `<p>Hi ${name},</p><p>Two-factor authentication was just enabled on your account. If this wasn't you, contact your administrator immediately.</p>`,
  });
}

module.exports = { sendEmail, sendTestEmail, isConfigured, sendPasswordResetEmail, send2faEnabledEmail };
