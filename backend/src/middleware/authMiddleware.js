const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const { failure } = require('../utils/response');
const Admin = require('../models/Admin');
const authService = require('../services/authService');

// FR-001: employees never authenticate via this middleware; only
// admin-facing routes use it.
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return failure(res, 401, 'Authentication token missing');
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    // Challenge tokens (issued mid-2FA, before the code is verified) must
    // never be usable as a real access token.
    if (payload.purpose === '2fa_challenge') {
      return failure(res, 401, 'Invalid or expired token');
    }

    // Session check — lets "log out" and admin-forced "revoke session"
    // actually invalidate a token instead of only removing it client-side.
    const active = await authService.isSessionActive(payload.jti);
    if (!active) {
      return failure(res, 401, 'This session has been logged out. Please log in again.');
    }

    const admin = await Admin.findById(payload.id);

    if (!admin || admin.status !== 'active') {
      return failure(res, 401, 'Account is not authorized');
    }

    req.admin = { id: admin._id.toString(), role: admin.role, name: admin.name };
    req.tokenId = payload.jti;
    next();
  } catch (err) {
    return failure(res, 401, 'Invalid or expired token');
  }
}

module.exports = authMiddleware;
