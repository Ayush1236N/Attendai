const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'super_admin', 'data_analyst'], default: 'admin' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },

    // --- Forgot-password flow ---
    // We store a SHA-256 hash of the reset token, never the raw token, so a
    // database leak can't be used to reset accounts directly.
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // --- Two-factor authentication (TOTP) ---
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false }, // active secret once enabled
    twoFactorTempSecret: { type: String, select: false }, // pending, until confirmed
  },
  { timestamps: true } // createdAt / updatedAt
);

module.exports = mongoose.model('Admin', adminSchema);
