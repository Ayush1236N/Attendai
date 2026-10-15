const mongoose = require('mongoose');

// One row per issued JWT. Login and logout are both recorded here so the
// admin dashboard can show "who logged in/out, from where, and when" and so
// a session can be force-revoked (e.g. a lost phone) even though JWTs are
// normally stateless. authMiddleware / employeeAuthMiddleware check
// `active` on every request using the token's `jti`.
const sessionSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ['admin', 'employee'], required: true },
    // Admin -> Admin._id as string; Employee -> employeeId. Kept as a plain
    // string so one schema covers both without a polymorphic ref.
    userId: { type: String, required: true },
    name: { type: String },

    tokenId: { type: String, required: true, unique: true }, // JWT "jti"
    twoFactorUsed: { type: Boolean, default: false },

    ip: { type: String },
    userAgent: { type: String },

    loginAt: { type: Date, default: Date.now },
    logoutAt: { type: Date, default: null },
    // false once the user logs out, the token expires past its logoutAt, or
    // an admin force-revokes it from the Login Activity screen.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

sessionSchema.index({ userType: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
