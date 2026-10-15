const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/environment');
const Session = require('../models/Session');

// --- Full access tokens (post 2FA, if applicable) -------------------------

// Every issued access token gets a unique `jti` recorded in a Session row.
// authMiddleware / employeeAuthMiddleware look the session up on every
// request so that logging out (or an admin force-revoking a session) really
// invalidates the token, not just removes it client-side.
async function issueAccessToken({ userType, id, role, name, twoFactorUsed, ip, userAgent }) {
  const jti = crypto.randomUUID();

  const token = jwt.sign({ id, role, jti }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

  await Session.create({
    userType,
    userId: String(id),
    name,
    tokenId: jti,
    twoFactorUsed: !!twoFactorUsed,
    ip,
    userAgent,
  });

  return token;
}

async function endSession(jti) {
  if (!jti) return;
  await Session.findOneAndUpdate(
    { tokenId: jti, active: true },
    { active: false, logoutAt: new Date() }
  );
}

async function isSessionActive(jti) {
  if (!jti) return false;
  const session = await Session.findOne({ tokenId: jti });
  // Tokens issued before this feature existed have no Session row at all;
  // treat those as active so existing tokens don't get logged out mid-flight.
  if (!session) return true;
  return session.active;
}

// --- Short-lived 2FA "challenge" tokens ------------------------------------
// Issued right after a correct password, before the TOTP code is verified.
// Deliberately NOT accepted by authMiddleware/employeeAuthMiddleware
// (purpose !== undefined), so it can't be used to access anything else.

function issueChallengeToken({ userType, id }) {
  return jwt.sign({ id, userType, purpose: '2fa_challenge' }, env.jwtSecret, { expiresIn: '5m' });
}

function verifyChallengeToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== '2fa_challenge') {
    throw new Error('Not a valid 2FA challenge token');
  }
  return payload; // { id, userType }
}

// --- Forgot / reset password -----------------------------------------------
// We only ever store a SHA-256 hash of the token; the raw token only ever
// exists in the email we send and briefly in memory here.

function createResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + env.passwordResetExpiryMinutes * 60 * 1000);
  return { rawToken, tokenHash, expires };
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
  issueAccessToken,
  endSession,
  isSessionActive,
  issueChallengeToken,
  verifyChallengeToken,
  createResetToken,
  hashToken,
};
