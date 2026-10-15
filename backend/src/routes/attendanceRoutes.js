const router = require('express').Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');
const validate = require('../middleware/validationMiddleware');
const { updateAttendanceSchema, markLeaveSchema, penaltySchema } = require('../validators/attendanceValidator');

// Employee-facing routes: NO authentication (employees have no accounts),
// but rate-limited at the app level and gated entirely by face verification.
router.post('/verify', upload.single('image'), attendanceController.verify);
router.post('/check-in', upload.single('image'), attendanceController.checkIn);
router.post('/check-out', upload.single('image'), attendanceController.checkOut);

// Employee portal routes: require an employee (not admin) login.
router.get('/me', employeeAuth, attendanceController.myHistory);
router.get('/me/today', employeeAuth, attendanceController.myToday);
router.get('/present-today', employeeAuth, attendanceController.presentToday);
// The "login, then scan your face" flow: face is checked ONLY against the
// logged-in employee's own registration (see checkInAsEmployee), not the
// whole roster like the open-kiosk routes above.
router.post('/me/check-in', employeeAuth, upload.single('image'), attendanceController.checkInMe);
router.post('/me/check-out', employeeAuth, upload.single('image'), attendanceController.checkOutMe);

// Admin-facing read routes: any authenticated admin-model account, including
// data_analyst (they need attendance data to inform payroll/analytics work).
router.get('/', auth, attendanceController.list);
router.get('/today', auth, attendanceController.today);
router.get('/employee/:employeeId', auth, attendanceController.byEmployee);

// Corrections: admin and super_admin only.
router.put('/:id', auth, requireRole('admin', 'super_admin'), validate(updateAttendanceSchema), attendanceController.update);
// Late penalties can ONLY be waived/restored by an admin or super admin.
router.put('/:id/penalty', auth, requireRole('admin', 'super_admin'), validate(penaltySchema), attendanceController.setPenalty);
router.post('/mark-leave', auth, requireRole('admin', 'super_admin'), validate(markLeaveSchema), attendanceController.markLeave);

module.exports = router;
