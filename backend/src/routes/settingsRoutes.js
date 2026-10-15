const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const settingsService = require('../services/settingsService');
const { success } = require('../utils/response');
const { updateSettingsSchema } = require('../validators/settingsValidator');

router.use(auth);

// Any admin-model account can read the rules (the payroll/attendance screens show them).
router.get('/', async (req, res, next) => {
  try {
    return success(res, 200, 'Settings retrieved', { settings: await settingsService.getSettings() });
  } catch (err) { next(err); }
});

// Only a super admin can change them — they drive salary calculations.
router.put('/', requireRole('super_admin'), validate(updateSettingsSchema), async (req, res, next) => {
  try {
    const settings = await settingsService.updateSettings(req.body, req.admin.id);
    return success(res, 200, 'Settings saved', { settings });
  } catch (err) { next(err); }
});

// Super admin: send a test email to check SMTP is set up correctly.
router.post('/test-email', requireRole('super_admin'), async (req, res, next) => {
  try {
    const email = require('../utils/email');
    if (!email.isConfigured()) {
      return res.status(400).json({ success: false, message: 'SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS on the backend.' });
    }
    const to = String(req.body.to || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    const r = await email.sendTestEmail(to);
    if (!r.delivered) return res.status(502).json({ success: false, message: `Mail server rejected it: ${r.reason}` });
    return success(res, 200, `Test email sent to ${to}`, {});
  } catch (err) { next(err); }
});

// Super admin: run the reporting-warehouse sync now ({ "full": true } backfills ~13 months).
router.post('/warehouse-sync', requireRole('super_admin'), async (req, res, next) => {
  try {
    const warehouse = require('../services/warehouseService');
    const result = await warehouse.sync({ full: !!req.body.full });
    return success(res, 200, result.skipped ? result.reason : 'Warehouse sync complete', { result });
  } catch (err) { next(err); }
});
router.get('/warehouse-status', requireRole('super_admin'), async (req, res, next) => {
  try {
    return success(res, 200, 'Warehouse status', await require('../services/warehouseService').status());
  } catch (err) { next(err); }
});

module.exports = router;
