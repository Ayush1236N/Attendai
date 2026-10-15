const router = require('express').Router();
const leaveController = require('../controllers/leaveController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const { applyLeaveSchema, decideLeaveSchema } = require('../validators/leaveValidator');

// Employee-facing — apply for leave, see their own request history/status.
router.post('/', employeeAuth, validate(applyLeaveSchema), leaveController.apply);
router.get('/me', employeeAuth, leaveController.myRequests);

// Admin-facing — review and decide. Deliberately admin/super_admin only
// (not data_analyst): approving leave changes attendance records, which is
// an admin-level action, same as attendance corrections elsewhere.
router.get('/', auth, requireRole('admin', 'super_admin'), leaveController.list);
router.put('/:id/decision', auth, requireRole('admin', 'super_admin'), validate(decideLeaveSchema), leaveController.decide);

module.exports = router;
