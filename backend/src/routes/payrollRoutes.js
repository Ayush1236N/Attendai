const router = require('express').Router();
const payrollController = require('../controllers/payrollController');
const auth = require('../middleware/authMiddleware');
const employeeAuth = require('../middleware/employeeAuthMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const { createAdjustmentSchema, updateSalarySchema } = require('../validators/payrollValidator');

// Employee self-service: own payslip (hours worked, leave, penalties, net pay).
router.get('/me', employeeAuth, payrollController.myPayslip);

router.use(auth);
// The data_analyst role's whole purpose is managing pay — bonuses,
// deductions, and base salary — so it's included here alongside admin/
// super_admin. Changes made through these routes write straight to the
// same Employee/PayrollAdjustment collections everything else reads from.
router.use(requireRole('admin', 'super_admin', 'data_analyst'));

router.get('/adjustments', payrollController.listAdjustments);
router.post('/adjustments', validate(createAdjustmentSchema), payrollController.createAdjustment);
router.delete('/adjustments/:id', payrollController.deleteAdjustment);

router.put('/salary/:employeeId', validate(updateSalarySchema), payrollController.updateSalary);

module.exports = router;
