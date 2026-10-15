const router = require('express').Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const {
  loginSchema,
  employeeLoginSchema,
  verify2FASchema,
  twoFACodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  employeeForgotPasswordSchema,
  employeeResetPasswordSchema,
  updateMyEmailSchema,
  updateMyPasswordSchema,
  employeeChangePasswordSchema,
} = require('../validators/authValidator');

// --- Login (step 1) ---
router.post('/login', validate(loginSchema), authController.login);
router.post('/employee-login', validate(employeeLoginSchema), authController.employeeLogin);

// --- Login (step 2, only reached if the account has 2FA enabled) ---
router.post('/verify-2fa', validate(verify2FASchema), authController.verify2FA);

// --- Logout (invalidates the session server-side) ---
router.post('/logout', auth, authController.logout);
router.post('/employee-logout', employeeAuth, authController.logout);

// --- Self-service: change your own email/password (admin, super_admin, or
// data_analyst — whichever account is logged in) ---
router.get('/me', auth, authController.adminMe);
router.put('/employee-me/password', employeeAuth, validate(employeeChangePasswordSchema), authController.employeeUpdateMyPassword);
router.put('/me/email', auth, validate(updateMyEmailSchema), authController.updateMyEmail);
router.put('/me/password', auth, validate(updateMyPasswordSchema), authController.updateMyPassword);

// --- Forgot / reset password ---
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
router.post('/employee-forgot-password', validate(employeeForgotPasswordSchema), authController.employeeForgotPassword);
router.post('/employee-reset-password', validate(employeeResetPasswordSchema), authController.employeeResetPassword);

// --- Two-factor authentication setup ---
router.post('/2fa/setup', auth, authController.adminSetup2FA);
router.post('/2fa/enable', auth, validate(twoFACodeSchema), authController.adminEnable2FA);
router.post('/2fa/disable', auth, validate(twoFACodeSchema), authController.adminDisable2FA);

router.post('/employee-2fa/setup', employeeAuth, authController.employeeSetup2FA);
router.post('/employee-2fa/enable', employeeAuth, validate(twoFACodeSchema), authController.employeeEnable2FA);
router.post('/employee-2fa/disable', employeeAuth, validate(twoFACodeSchema), authController.employeeDisable2FA);

// --- Login Activity (admin dashboard): every login/logout, admin + employee ---
router.get('/sessions', auth, requireRole('admin', 'super_admin'), authController.listSessions);
router.post('/sessions/:id/revoke', auth, requireRole('admin', 'super_admin'), authController.revokeSession);

// One-time bootstrap.
router.post('/setup-first-admin', authController.registerFirstAdmin);

module.exports = router;
