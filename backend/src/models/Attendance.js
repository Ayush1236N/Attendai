const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
  {
    timestamp: { type: Date },
    verificationScore: { type: Number }, // similarity/confidence returned by AI service
    verificationMethod: { type: String, default: 'face_embedding' },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true }, // references Employee.employeeId
    date: { type: String, required: true }, // YYYY-MM-DD calendar key (see utils/date.js)

    checkIn: { type: verificationSchema, default: null },
    checkOut: { type: verificationSchema, default: null },

    // 'leave' / 'half_day' are admin-marked corrections (e.g. approved leave,
    // half-day) used by the payroll service when calculating salary
    // deductions; they're never set automatically by the check-in flow.
    status: {
      type: String,
      enum: ['present', 'checked_out', 'absent', 'leave', 'half_day'],
      default: 'present',
    },

    // Where the day was worked. Derived at check-in from the employee's type
    // (onsite / hybrid schedule / remote); an admin can correct it.
    workMode: { type: String, enum: ['office', 'remote'], default: 'office' },

    // Total minutes between check-in and check-out (kept in sync by the
    // pre-save hook below). 0 until the employee checks out.
    workedMinutes: { type: Number, default: 0 },

    // For status 'leave' / 'half_day': 'paid' and 'unpaid' are explicit
    // decisions by an admin; 'auto' means "paid while within the employee's
    // monthly paid-leave allowance, unpaid beyond it".
    leaveType: { type: String, enum: ['auto', 'paid', 'unpaid'], default: 'auto' },

    // Late-arrival penalty. Created automatically at check-in; ONLY an admin
    // or super admin can waive it (see PUT /attendance/:id/penalty).
    late: {
      isLate: { type: Boolean, default: false },
      minutesLate: { type: Number, default: 0 },
      penaltyAmount: { type: Number, default: 0 },
      waived: { type: Boolean, default: false },
      waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      waivedByName: { type: String },
      waivedAt: { type: Date },
      waiveReason: { type: String, default: '' },
    },

    // Optional free-text note for admin-marked days (e.g. "approved sick leave").
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

// Keep workedMinutes correct whenever a record is saved — including admin
// corrections to check-in/check-out times.
attendanceSchema.pre('save', function computeWorkedMinutes(next) {
  const { minutesWorked } = require('../utils/date');
  this.workedMinutes = minutesWorked(this);
  next();
});

// Section 14 / Rule 5: exactly one attendance record per employee per day.
// This unique compound index is the authoritative, database-level guarantee;
// the application-level "already checked in?" check is the first line of
// defense, this index is the second line that can never be bypassed by a
// race condition or a bug in the controller logic.
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
