const reportService = require('../services/reportService');
const payrollService = require('../services/payrollService');
const { success } = require('../utils/response');

async function attendanceReport(req, res, next) {
  try {
    const { startDate, endDate, employeeId, format } = req.query;
    const rows = await reportService.buildAttendanceReport({ startDate, endDate, employeeId });

    if (format === 'csv') {
      const csv = reportService.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
      return res.status(200).send(csv);
    }

    return success(res, 200, 'Report generated', { rows });
  } catch (err) { next(err); }
}

// Salary report — per-employee monthly salary with leave-based deductions.
// GET /api/reports/salary?month=YYYY-MM&employeeId=E001&format=csv
async function salaryReport(req, res, next) {
  try {
    const { month, employeeId, format } = req.query;
    const rows = await payrollService.buildSalaryReport({ month, employeeId });

    if (format === 'csv') {
      const csv = payrollService.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="salary_report_${month || 'current'}.csv"`);
      return res.status(200).send(csv);
    }

    return success(res, 200, 'Salary report generated', { rows });
  } catch (err) { next(err); }
}

module.exports = { attendanceReport, salaryReport };
