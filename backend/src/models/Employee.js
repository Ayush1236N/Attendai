const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true }, // Rule 10: must be unique
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    joiningDate: { type: Date },

    profileImage: { type: String }, // path/URL to optional profile photo

    // --- Biometric fields (Section 3 / 15) ---
    faceRegistered: { type: Boolean, default: false },
    // Embeddings only — raw face images are NOT stored permanently (Section 15).
    faceEmbeddings: [
      {
        vector: { type: [Number], required: true },
        label: { type: String, default: 'primary' }, // e.g. front / left / right
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Rule 9: deletion is modeled as deactivation, not destructive delete,
    // so historical attendance records remain valid and queryable.
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    // Optional employee self-service portal login (separate from face
    // check-in/out, which remains password-free). Hashed with bcrypt, never
    // returned by default queries.
    password: { type: String, select: false },

    // --- Forgot-password flow (employee can trigger this themselves once
    // they have an email on file — see PUT /employees/me/email) ---
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // --- Two-factor authentication (TOTP), same mechanism as admin ---
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorTempSecret: { type: String, select: false },

    // --- Work arrangement ---
    // onsite: works from the office every working day (late rules apply).
    // hybrid: office on hybridOfficeDays, remote on the other days.
    // remote: always remote (no late penalty, no fixed arrival time).
    employmentType: { type: String, enum: ['onsite', 'hybrid', 'remote'], default: 'onsite' },
    // Days of the week (0 = Sunday ... 6 = Saturday) a hybrid employee is
    // expected in the office. Default Mon/Tue/Wed.
    hybridOfficeDays: { type: [Number], default: [1, 2, 3] },

    // --- Payroll ---
    // monthly: fixed monthlySalary, with deductions for unpaid leave/penalties.
    // hourly: paid for hours actually worked (check-out minus check-in) x
    //         hourlyRate, plus pay for approved paid-leave days.
    payType: { type: String, enum: ['monthly', 'hourly'], default: 'monthly' },
    hourlyRate: { type: Number, default: 0, min: 0 },
    monthlySalary: { type: Number, default: 0, min: 0 },
    // Paid ("free") leave days allowed per calendar month before deductions
    // start kicking in. Anything beyond this, taken as 'leave' or 'absent',
    // is deducted pro-rata from that month's salary.
    paidLeavesPerMonth: { type: Number, default: 1, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Employee', employeeSchema);
