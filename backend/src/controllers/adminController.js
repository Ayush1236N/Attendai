const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const authService = require('../services/authService');
const emailUtil = require('../utils/email');
const env = require('../config/environment');
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const { success, failure } = require('../utils/response');

async function list(req, res, next) {
  try {
    const admins = await Admin.find().sort({ createdAt: -1 });
    return success(res, 200, 'Admin accounts retrieved', {
      admins: admins.map((a) => ({
        id: a._id,
        name: a.name,
        email: a.email,
        role: a.role,
        status: a.status,
        twoFactorEnabled: a.twoFactorEnabled,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) { next(err); }
}

// Creates an 'admin' or 'data_analyst' account. Deliberately does not allow
// creating another 'super_admin' from here — that's a one-time bootstrap
// action (POST /auth/setup-first-admin) or a direct database change, to
// avoid privilege escalation through a compromised super_admin session.
async function create(req, res, next) {
  try {
    const { name, email, password, role } = req.body;

    const existing = await Admin.findOne({ email });
    if (existing) return failure(res, 409, 'An account with that email already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Admin.create({ name, email, passwordHash, role });

    return success(res, 201, 'Account created', {
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, status: admin.status },
    });
  } catch (err) { next(err); }
}

// Role/status changes — a super_admin can promote/demote between 'admin'
// and 'data_analyst' and enable/disable an account, but can't touch their
// own row here (use the self-service /auth/me endpoints for that) to avoid
// accidentally locking themselves out.
async function update(req, res, next) {
  try {
    if (req.params.id === req.admin.id) {
      return failure(res, 400, 'Use your profile settings to change your own account');
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) return failure(res, 404, 'Account not found');
    if (admin.role === 'super_admin') {
      return failure(res, 403, 'The super admin account cannot be modified here');
    }

    const { name, role, status } = req.body;
    if (name !== undefined) admin.name = name;
    if (role !== undefined) admin.role = role;
    if (status !== undefined) admin.status = status;
    await admin.save();

    return success(res, 200, 'Account updated', {
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, status: admin.status },
    });
  } catch (err) { next(err); }
}


// Helper: load a non-super-admin team member (super admins can't be reset from here).
async function loadMember(req, res) {
  const admin = await Admin.findById(req.params.id).select('+twoFactorSecret');
  if (!admin) { failure(res, 404, 'Account not found'); return null; }
  if (admin.role === 'super_admin') { failure(res, 403, 'The super admin account cannot be changed here'); return null; }
  return admin;
}

// Works even when email isn't set up: returns a one-time reset LINK the super
// admin can send over WhatsApp/chat (and also emails it when SMTP is configured).
async function createResetLink(req, res, next) {
  try {
    const admin = await loadMember(req, res); if (!admin) return;
    const { rawToken, tokenHash, expires } = authService.createResetToken();
    admin.resetPasswordTokenHash = tokenHash;
    admin.resetPasswordExpires = expires;
    await admin.save();
    const resetUrl = `${env.frontendUrl}/reset-password?token=${rawToken}&role=admin`;
    let emailed = false;
    if (emailUtil.isConfigured()) {
      const r = await emailUtil.sendPasswordResetEmail({ to: admin.email, name: admin.name, resetUrl, expiresInMinutes: env.passwordResetExpiryMinutes });
      emailed = r && r.delivered !== false;
    }
    await AuditLog.create({ adminId: req.admin.id, action: 'ADMIN_RESET_LINK_CREATED', entity: 'Admin', entityId: String(admin._id), newValue: { target: admin.email, emailed } });
    return success(res, 200, emailed ? 'Reset link emailed and shown below' : 'Reset link created — send it to the user', {
      resetUrl, emailed, expiresInMinutes: env.passwordResetExpiryMinutes,
    });
  } catch (err) { next(err); }
}

// Super admin sets a temporary password directly (no email needed).
async function setPassword(req, res, next) {
  try {
    const admin = await loadMember(req, res); if (!admin) return;
    admin.passwordHash = await bcrypt.hash(req.body.password, 12);
    admin.resetPasswordTokenHash = undefined;
    admin.resetPasswordExpires = undefined;
    admin.status = 'active';
    await admin.save();
    await Session.updateMany({ userType: 'admin', userId: String(admin._id), active: true }, { active: false, logoutAt: new Date() });
    await AuditLog.create({ adminId: req.admin.id, action: 'ADMIN_PASSWORD_SET', entity: 'Admin', entityId: String(admin._id), newValue: { target: admin.email } });
    return success(res, 200, `Password set for ${admin.name}. They were signed out everywhere; ask them to change it after logging in.`, {});
  } catch (err) { next(err); }
}

// Lost authenticator? Super admin turns the member's 2FA off so they can log in and re-enrol.
async function resetTwoFactor(req, res, next) {
  try {
    const admin = await loadMember(req, res); if (!admin) return;
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = undefined;
    admin.twoFactorTempSecret = undefined;
    await admin.save();
    await AuditLog.create({ adminId: req.admin.id, action: 'ADMIN_2FA_RESET', entity: 'Admin', entityId: String(admin._id), newValue: { target: admin.email } });
    return success(res, 200, `Two-factor authentication turned off for ${admin.name}.`, {});
  } catch (err) { next(err); }
}

module.exports = { list, create, update, createResetLink, setPassword, resetTwoFactor };
