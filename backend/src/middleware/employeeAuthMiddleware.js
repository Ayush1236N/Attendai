const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const { failure } = require('../utils/response');
const Employee = require('../models/Employee');
const authService = require('../services/authService');

// Guards the employee self-service portal routes (attendance history,
// profile/email, 2FA setup, today's present list). Completely separate from
// the admin authMiddleware and from the face-based check-in/out flow.
async function employeeAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return failure(res, 401, 'Authentication token missing');
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    if (payload.purpose === '2fa_challenge') {
      return failure(res, 401, 'Invalid or expired token');
    }
    if (payload.role !== 'employee') {
      return failure(res, 401, 'Invalid token for this resource');
    }

    const active = await authService.isSessionActive(payload.jti);
    if (!active) {
      return failure(res, 401, 'This session has been logged out. Please log in again.');
    }

    const employee = await Employee.findOne({ employeeId: payload.id });
    if (!employee || employee.status !== 'active') {
      return failure(res, 401, 'Account is not authorized');
    }

    req.employee = { employeeId: employee.employeeId, name: employee.name };
    req.tokenId = payload.jti;
    next();
  } catch (err) {
    return failure(res, 401, 'Invalid or expired token');
  }
}

module.exports = employeeAuthMiddleware;
