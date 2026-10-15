const mongoose = require('mongoose');

// An employee applies here; an admin/super_admin approves or rejects.
// On approval, every date in [fromDate, toDate] gets an Attendance record
// set to the chosen status (see leaveService.decide) — the same mechanism
// already used by the admin "Mark leave" form, so it flows straight into
// the payroll salary-deduction calculation with no extra wiring.
const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String }, // snapshot, so the list still reads fine if the employee is later renamed/deactivated

    fromDate: { type: String, required: true }, // 'YYYY-MM-DD'
    toDate: { type: String, required: true }, // 'YYYY-MM-DD', >= fromDate
    type: { type: String, enum: ['leave', 'half_day'], default: 'leave' },
    reason: { type: String, trim: true, required: true },

    // Set by the admin when approving; drives payroll (see payrollService).
    leaveType: { type: String, enum: ['auto', 'paid', 'unpaid'], default: 'auto' },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    decidedByName: { type: String },
    decidedAt: { type: Date },
    adminRemarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employeeId: 1, createdAt: -1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
