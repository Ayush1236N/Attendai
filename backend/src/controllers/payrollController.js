const payrollService = require('../services/payrollService');
const { success, failure } = require('../utils/response');

async function listAdjustments(req, res, next) {
  try {
    const { month, employeeId } = req.query;
    const adjustments = await payrollService.listAdjustments({ month, employeeId });
    return success(res, 200, 'Adjustments retrieved', { adjustments });
  } catch (err) { next(err); }
}

async function createAdjustment(req, res, next) {
  try {
    const adjustment = await payrollService.createAdjustment(req.body, req.admin);
    return success(res, 201, 'Adjustment saved', { adjustment });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

async function deleteAdjustment(req, res, next) {
  try {
    await payrollService.deleteAdjustment(req.params.id, req.admin);
    return success(res, 200, 'Adjustment removed', {});
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

async function updateSalary(req, res, next) {
  try {
    const employee = await payrollService.updateEmployeeSalary(req.params.employeeId, req.body, req.admin);
    return success(res, 200, 'Salary updated', {
      employee: {
        employeeId: employee.employeeId,
        monthlySalary: employee.monthlySalary,
        paidLeavesPerMonth: employee.paidLeavesPerMonth,
        payType: employee.payType,
        hourlyRate: employee.hourlyRate,
      },
    });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

// Employee portal: the logged-in employee's own payslip for a month.
async function myPayslip(req, res, next) {
  try {
    const payslip = await payrollService.buildMyPayslip(req.employee.employeeId, req.query.month);
    if (!payslip) return failure(res, 404, 'No payroll record found for you');
    return success(res, 200, 'Payslip generated', { payslip });
  } catch (err) { next(err); }
}

module.exports = { myPayslip, listAdjustments, createAdjustment, deleteAdjustment, updateSalary };
