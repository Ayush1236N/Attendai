const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const ISSUER = 'Attendai';

// Generates a new TOTP secret + a scannable QR code (as a data URL) for an
// authenticator app (Google Authenticator, Authy, 1Password, etc).
async function generateSecret(accountLabel) {
  const secret = speakeasy.generateSecret({
    name: `${ISSUER} (${accountLabel})`,
    issuer: ISSUER,
    length: 20,
  });

  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrDataUrl,
  };
}

// Verifies a 6-digit code against a base32 secret, allowing clock drift of
// up to 60s either side (window 2 x 30s steps). Phones that haven't synced
// their clock recently are the #1 cause of "my 2FA code is always wrong".
function verifyToken(base32Secret, token) {
  if (!base32Secret || !token) return false;
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: String(token).trim(),
    window: 2,
  });
}

module.exports = { generateSecret, verifyToken };
