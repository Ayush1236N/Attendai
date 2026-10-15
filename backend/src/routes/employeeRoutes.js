const router = require('express').Router();
const employeeController = require('../controllers/employeeController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');
const validate = require('../middleware/validationMiddleware');
const {
  createEmployeeSchema,
  updateEmployeeSchema,
  setCredentialsSchema,
  updateOwnEmailSchema,
} = require('../validators/employeeValidator');

// Employee self-service routes — require an EMPLOYEE login, not an admin
// one. Defined before `router.use(auth)` below so they don't get swept up
// by the admin-only guard.
router.get('/me', employeeAuth, employeeController.getMe);
router.put('/me/email', employeeAuth, validate(updateOwnEmailSchema), employeeController.updateMyEmail);

// Every employee-management route below requires an authenticated admin (FR-001).
router.use(auth);

// Read access: admin, super_admin, AND data_analyst (they need to see who
// employees are and reference their details for payroll/analytics work).
router.get('/', employeeController.list);
router.get('/:id', employeeController.getOne);

// Mutations (create/edit/delete/face registration/credentials): admin and
// super_admin only. The data_analyst role manages pay through /api/payroll,
// not through full employee-profile edits.
const manage = requireRole('admin', 'super_admin');
router.post('/', manage, validate(createEmployeeSchema), employeeController.create);
router.put('/:id', manage, validate(updateEmployeeSchema), employeeController.update);
router.delete('/:id', manage, employeeController.remove); // => deactivate (Rule 9)

// FR-003: Face Registration
router.post('/:id/register-face', manage, upload.single('image'), employeeController.registerFace);

// Employee self-service portal login credentials (separate from face auth).
router.put('/:id/credentials', manage, validate(setCredentialsSchema), employeeController.setCredentials);

module.exports = router;
