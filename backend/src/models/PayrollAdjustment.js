const mongoose = require('mongoose');

// A manual line-item on top of the automatic leave-based salary calculation
// (see services/payrollService.js). Lets an admin or data analyst give a
// bonus or apply an extra deduction for a specific month, with a reason on
// record. These feed directly into the live salary report — there's no
// separate "analytics copy" of the data, it's the same Attendance/Employee
// collections everything else reads from.
const payrollAdjustmentSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true }, // 'YYYY-MM'
    type: { type: String, enum: ['bonus', 'deduction'], required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, default: '' },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // absent when added via Power BI
    addedByName: { type: String },
  },
  { timestamps: true }
);

payrollAdjustmentSchema.index({ employeeId: 1, month: 1 });

module.exports = mongoose.model('PayrollAdjustment', payrollAdjustmentSchema);
