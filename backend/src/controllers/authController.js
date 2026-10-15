const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const Session = require('../models/Session');
const env = require('../config/environment');
const { success, failure } = require('../utils/response');
const authService = require('../services/authService');
const twoFactor = require('../utils/twofactor');
const email = require('../utils/email');

function clientMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    userAgent: req.headers['user-agent'] || 'unknown',
  };
}

// ---------------------------------------------------------------------------
// FR-001: Admin Authentication (now 2FA-aware).
// ---------------------------------------------------------------------------
async function login(req, res, next) {
  try {
    const { email: adminEmail, password } = req.body;
    const admin = await Admin.findOne({ email: String(adminEmail).trim().toLowerCase() }).select('+passwordHash +twoFactorSecret');

    if (!admin || admin.status !== 'active') {
      return failure(res, 401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return failure(res, 401, 'Invalid credentials');
    }

    if (admin.twoFactorEnabled) {
      const challengeToken = authService.issueChallengeToken({ userType: 'admin', id: admin._id.toString() });
      return success(res, 200, 'Enter your 2FA code to continue', {
        requires2FA: true,
        challengeToken,
      });
    }

    const { ip, userAgent } = clientMeta(req);
    const token = await authService.issueAccessToken({
      userType: 'admin',
      id: admin._id.toString(),
      role: admin.role,
      name: admin.name,
      ip,
      userAgent,
    });

    return success(res, 200, 'Login successful', {
      token,
      admin: { id: admin._id, name: admin.name, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
}

// Employee self-service portal login (separate from the face-based
// check-in/out flow, which stays password-free on purpose). Also 2FA-aware,
// and can be made mandatory for all employees via EMPLOYEE_2FA_REQUIRED.
async function employeeLogin(req, res, next) {
  try {
    const { employeeId, password } = req.body;
    const employee = await Employee.findOne({ employeeId }).select('+password +twoFactorSecret');

    if (!employee || employee.status !== 'active' || !employee.password) {
      return failure(res, 401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) {
      return failure(res, 401, 'Invalid credentials');
    }

    if (employee.twoFactorEnabled) {
      const challengeToken = authService.issueChallengeToken({ userType: 'employee', id: employee.employeeId });
      return success(res, 200, 'Enter your 2FA code to continue', {
        requires2FA: true,
        challengeToken,
      });
    }

    const { ip, userAgent } = clientMeta(req);
    const token = await authService.issueAccessToken({
      userType: 'employee',
      id: employee.employeeId,
      role: 'employee',
      name: employee.name,
      ip,
      userAgent,
    });

    return success(res, 200, `Welcome, ${employee.name}!`, {
      token,
      // If the org requires 2FA for everyone and this employee hasn't set it
      // up yet, tell the app so it can prompt them right after login.
      twoFactorSetupRequired: env.employeeTwoFactorRequired && !employee.twoFactorEnabled,
      employee: {
        employeeId: employee.employeeId,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        email: employee.email || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Second step of login when the account has 2FA enabled. Works for both
// admin and employee accounts — `userType` comes from the challenge token.
async function verify2FA(req, res, next) {
  try {
    const { challengeToken, code } = req.body;
    let payload;
    try {
      payload = authService.verifyChallengeToken(challengeToken);
    } catch (e) {
      return failure(res, 401, 'This 2FA challenge has expired. Please log in again.');
    }

    const { ip, userAgent } = clientMeta(req);

    if (payload.userType === 'admin') {
      const admin = await Admin.findById(payload.id).select('+twoFactorSecret');
      if (!admin || !twoFactor.verifyToken(admin.twoFactorSecret, code)) {
        return failure(res, 401, 'Invalid 2FA code');
      }
      const token = await authService.issueAccessToken({
        userType: 'admin',
        id: admin._id.toString(),
        role: admin.role,
        name: admin.name,
        twoFactorUsed: true,
        ip,
        userAgent,
      });
      return success(res, 200, 'Login successful', {
        token,
        admin: { id: admin._id, name: admin.name, role: admin.role },
      });
    }

    // employee
    const employee = await Employee.findOne({ employeeId: payload.id }).select('+twoFactorSecret');
    if (!employee || !twoFactor.verifyToken(employee.twoFactorSecret, code)) {
      return failure(res, 401, 'Invalid 2FA code');
    }
    const token = await authService.issueAccessToken({
      userType: 'employee',
      id: employee.employeeId,
      role: 'employee',
      name: employee.name,
      twoFactorUsed: true,
      ip,
      userAgent,
    });
    return success(res, 200, `Welcome, ${employee.name}!`, {
      token,
      employee: {
        employeeId: employee.employeeId,
        name: employee.name,
        department: employee.department,
        designation: employee.designation,
        email: employee.email || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Logout — invalidates the session server-side (not just discarding the
// token client-side), and is what powers "log out" entries in Login Activity.
// ---------------------------------------------------------------------------
async function logout(req, res, next) {
  try {
    await authService.endSession(req.tokenId);
    return success(res, 200, 'Logged out successfully', {});
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Forgot / reset password — admin
// ---------------------------------------------------------------------------
async function forgotPassword(req, res, next) {
  try {
    const { email: adminEmail } = req.body;
    const admin = await Admin.findOne({ email: String(adminEmail).trim().toLowerCase() });

    // Always respond the same way whether or not the email exists, so this
    // endpoint can't be used to enumerate admin accounts.
    if (admin) {
      const { rawToken, tokenHash, expires } = authService.createResetToken();
      admin.resetPasswordTokenHash = tokenHash;
      admin.resetPasswordExpires = expires;
      await admin.save();

      const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}&role=admin`;
      await email.sendPasswordResetEmail({
        to: admin.email,
        name: admin.name,
        resetUrl,
        expiresInMinutes: env.passwordResetExpiryMinutes,
      });
    }

    return success(res, 200, 'If that email is registered, a reset link has been sent.', { emailConfigured: email.isConfigured() });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const tokenHash = authService.hashToken(token);

    const admin = await Admin.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!admin) {
      return failure(res, 400, 'This reset link is invalid or has expired.');
    }

    admin.passwordHash = await bcrypt.hash(password, 12);
    admin.resetPasswordTokenHash = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    // Any tokens issued before the reset are no longer trustworthy.
    await Session.updateMany({ userType: 'admin', userId: admin._id.toString(), active: true }, { active: false, logoutAt: new Date() });

    return success(res, 200, 'Password reset successfully. Please log in.', {});
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Forgot / reset password — employee (requires the employee to have an
// email on file; see PUT /employees/me/email for how they add their own).
// ---------------------------------------------------------------------------
async function employeeForgotPassword(req, res, next) {
  try {
    const { email: employeeEmail } = req.body;
    const employee = await Employee.findOne({ email: String(employeeEmail).trim().toLowerCase() });

    if (employee) {
      const { rawToken, tokenHash, expires } = authService.createResetToken();
      employee.resetPasswordTokenHash = tokenHash;
      employee.resetPasswordExpires = expires;
      await employee.save();

      const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}&role=employee`;
      await email.sendPasswordResetEmail({
        to: employee.email,
        name: employee.name,
        resetUrl,
        expiresInMinutes: env.passwordResetExpiryMinutes,
      });
    }

    return success(res, 200, 'If that email is registered, a reset link has been sent.', { emailConfigured: email.isConfigured() });
  } catch (err) {
    next(err);
  }
}

async function employeeResetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const tokenHash = authService.hashToken(token);

    const employee = await Employee.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!employee) {
      return failure(res, 400, 'This reset link is invalid or has expired.');
    }

    employee.password = await bcrypt.hash(password, 12);
    employee.resetPasswordTokenHash = undefined;
    employee.resetPasswordExpires = undefined;
    await employee.save();

    await Session.updateMany({ userType: 'employee', userId: employee.employeeId, active: true }, { active: false, logoutAt: new Date() });

    return success(res, 200, 'Password reset successfully. Please log in.', {});
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Two-factor authentication setup — one pair of routes for admin, one pair
// for employee, same underlying TOTP mechanism.
// ---------------------------------------------------------------------------
async function adminSetup2FA(req, res, next) {
  try {
    const admin = await Admin.findById(req.admin.id);
    const { otpauthUrl, qrDataUrl, base32 } = await twoFactor.generateSecret(admin.email);
    admin.twoFactorTempSecret = base32;
    await admin.save();
    return success(res, 200, 'Scan this QR code with your authenticator app', { otpauthUrl, qrDataUrl });
  } catch (err) { next(err); }
}

async function adminEnable2FA(req, res, next) {
  try {
    const admin = await Admin.findById(req.admin.id).select('+twoFactorTempSecret');
    if (!admin.twoFactorTempSecret) return failure(res, 400, 'Start setup first');
    if (!twoFactor.verifyToken(admin.twoFactorTempSecret, req.body.code)) {
      return failure(res, 400, 'Invalid code — please try again');
    }
    admin.twoFactorSecret = admin.twoFactorTempSecret;
    admin.twoFactorTempSecret = undefined;
    admin.twoFactorEnabled = true;
    await admin.save();
    await email.send2faEnabledEmail({ to: admin.email, name: admin.name });
    return success(res, 200, 'Two-factor authentication enabled', {});
  } catch (err) { next(err); }
}

async function adminDisable2FA(req, res, next) {
  try {
    const admin = await Admin.findById(req.admin.id).select('+twoFactorSecret');
    if (!twoFactor.verifyToken(admin.twoFactorSecret, req.body.code)) {
      return failure(res, 400, 'Invalid code');
    }
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = undefined;
    await admin.save();
    return success(res, 200, 'Two-factor authentication disabled', {});
  } catch (err) { next(err); }
}

async function employeeSetup2FA(req, res, next) {
  try {
    const employee = await Employee.findOne({ employeeId: req.employee.employeeId });
    const { otpauthUrl, qrDataUrl, base32 } = await twoFactor.generateSecret(employee.employeeId);
    employee.twoFactorTempSecret = base32;
    await employee.save();
    return success(res, 200, 'Scan this QR code with your authenticator app', { otpauthUrl, qrDataUrl });
  } catch (err) { next(err); }
}

async function employeeEnable2FA(req, res, next) {
  try {
    const employee = await Employee.findOne({ employeeId: req.employee.employeeId }).select('+twoFactorTempSecret');
    if (!employee.twoFactorTempSecret) return failure(res, 400, 'Start setup first');
    if (!twoFactor.verifyToken(employee.twoFactorTempSecret, req.body.code)) {
      return failure(res, 400, 'Invalid code — please try again');
    }
    employee.twoFactorSecret = employee.twoFactorTempSecret;
    employee.twoFactorTempSecret = undefined;
    employee.twoFactorEnabled = true;
    await employee.save();
    if (employee.email) await email.send2faEnabledEmail({ to: employee.email, name: employee.name });
    return success(res, 200, 'Two-factor authentication enabled', {});
  } catch (err) { next(err); }
}

async function employeeDisable2FA(req, res, next) {
  try {
    const employee = await Employee.findOne({ employeeId: req.employee.employeeId }).select('+twoFactorSecret');
    if (!twoFactor.verifyToken(employee.twoFactorSecret, req.body.code)) {
      return failure(res, 400, 'Invalid code');
    }
    employee.twoFactorEnabled = false;
    employee.twoFactorSecret = undefined;
    await employee.save();
    return success(res, 200, 'Two-factor authentication disabled', {});
  } catch (err) { next(err); }
}

// Who am I? Used by the Security page to show whether 2FA is already on.
async function adminMe(req, res, next) {
  try {
    const admin = await Admin.findById(req.admin.id);
    return success(res, 200, 'Account retrieved', {
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, twoFactorEnabled: !!admin.twoFactorEnabled },
    });
  } catch (err) { next(err); }
}

// Employee self-service: change own portal password.
async function employeeUpdateMyPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const employee = await Employee.findOne({ employeeId: req.employee.employeeId }).select('+password');
    const valid = employee && employee.password && (await bcrypt.compare(currentPassword, employee.password));
    if (!valid) return failure(res, 400, 'Current password is incorrect');

    employee.password = await bcrypt.hash(newPassword, 12);
    await employee.save();

    await Session.updateMany(
      { userType: 'employee', userId: employee.employeeId, active: true, tokenId: { $ne: req.tokenId } },
      { active: false, logoutAt: new Date() }
    );
    return success(res, 200, 'Password updated. Your other signed-in devices have been logged out.', {});
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Login Activity (admin dashboard) — every login/logout, for every admin AND
// every employee, with the ability to force-revoke ("log out") a session.
// ---------------------------------------------------------------------------
async function listSessions(req, res, next) {
  try {
    const { userType, userId, activeOnly } = req.query;
    const query = {};
    if (userType) query.userType = userType;
    if (userId) query.userId = userId;
    if (activeOnly === 'true') query.active = true;

    const sessions = await Session.find(query).sort({ createdAt: -1 }).limit(500);
    return success(res, 200, 'Sessions retrieved', { sessions });
  } catch (err) { next(err); }
}

async function revokeSession(req, res, next) {
  try {
    const session = await Session.findByIdAndUpdate(
      req.params.id,
      { active: false, logoutAt: new Date() },
      { new: true }
    );
    if (!session) return failure(res, 404, 'Session not found');
    return success(res, 200, 'Session revoked — that device is now logged out', { session });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Convenience endpoint used once during setup to create the first admin.
// In production this should be disabled or protected after initial setup.
// ---------------------------------------------------------------------------
async function registerFirstAdmin(req, res, next) {
  try {
    const { name, email: adminEmail, password } = req.body;
    const existing = await Admin.countDocuments();
    if (existing > 0) {
      return failure(res, 403, 'An admin already exists. Use the dashboard to add more admins.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ name, email: adminEmail, passwordHash, role: 'super_admin' });
    return success(res, 201, 'Initial admin created', { admin: { id: admin._id, email: admin.email } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Self-service: change your own email or password (any authenticated admin
// account — admin, super_admin, or data_analyst).
// ---------------------------------------------------------------------------
async function updateMyEmail(req, res, next) {
  try {
    const { newEmail, currentPassword } = req.body;
    const admin = await Admin.findById(req.admin.id).select('+passwordHash');

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) return failure(res, 401, 'Current password is incorrect');

    admin.email = newEmail;
    await admin.save();

    return success(res, 200, 'Email updated', { email: admin.email });
  } catch (err) {
    if (err.code === 11000) return failure(res, 409, 'That email is already in use');
    next(err);
  }
}

async function updateMyPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id).select('+passwordHash');

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) return failure(res, 401, 'Current password is incorrect');

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();

    // Log every OTHER device out, since the old password could have been
    // compromised — but keep the session making this request active so the
    // admin isn't immediately booted out themselves.
    await Session.updateMany(
      { userType: 'admin', userId: admin._id.toString(), active: true, tokenId: { $ne: req.tokenId } },
      { active: false, logoutAt: new Date() }
    );

    return success(res, 200, 'Password updated', {});
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  registerFirstAdmin,
  employeeLogin,
  verify2FA,
  logout,
  forgotPassword,
  resetPassword,
  employeeForgotPassword,
  employeeResetPassword,
  updateMyEmail,
  updateMyPassword,
  adminMe,
  employeeUpdateMyPassword,
  adminSetup2FA,
  adminEnable2FA,
  adminDisable2FA,
  employeeSetup2FA,
  employeeEnable2FA,
  employeeDisable2FA,
  listSessions,
  revokeSession,
};
