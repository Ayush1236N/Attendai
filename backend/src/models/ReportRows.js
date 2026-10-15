const mongoose = require('mongoose');

// Reporting warehouse tables. Rows are copies of what the BI feed produces,
// upserted by a sync job. They are NEVER deleted when the live record is
// edited or removed — so reports keep the history as it was last synced.
// strict:false because the column set is owned by services/biService.js.
const base = { strict: false, versionKey: false };

const attendanceSchema = new mongoose.Schema(
  { date: String, employeeId: String, syncedAt: Date },
  base
);
attendanceSchema.index({ date: 1, employeeId: 1 }, { unique: true });

const payrollSchema = new mongoose.Schema(
  { month: String, employeeId: String, syncedAt: Date },
  base
);
payrollSchema.index({ month: 1, employeeId: 1 }, { unique: true });

module.exports = {
  ReportAttendance: mongoose.model('ReportAttendance', attendanceSchema, 'report_attendance_daily'),
  ReportPayroll: mongoose.model('ReportPayroll', payrollSchema, 'report_payroll_monthly'),
};
