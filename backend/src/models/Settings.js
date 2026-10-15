const mongoose = require('mongoose');

// Organisation-wide attendance/payroll rules. Exactly one document exists
// (key: 'org'); see services/settingsService.js. Only a super admin can change
// these, because they directly drive salary calculations.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'org', unique: true },

    // Office start time (24h "HH:mm", in the org timezone). Anyone who checks
    // in after officeStartTime + lateGraceMinutes on an OFFICE day is late.
    officeStartTime: { type: String, default: '09:30' },
    lateGraceMinutes: { type: Number, default: 10, min: 0 },

    // Flat penalty (in ₹) charged per late arrival. 0 disables penalties.
    latePenaltyAmount: { type: Number, default: 100, min: 0 },

    // Hours in a standard working day. Used to price paid-leave days for
    // hourly employees and to derive an hourly equivalent for monthly staff.
    // Overtime = hours worked beyond standardDailyHours on a day. Multiplier 0 (default)
    // means overtime is TRACKED but not paid extra, so existing pay doesn't change.
    // e.g. 1.5 pays overtime hours at 1.5x the hourly rate (for hourly staff only the
    // extra 0.5x premium is added, because the base hour is already in their hours pay).
    overtimeMultiplier: { type: Number, default: 0, min: 0, max: 5 },
    standardDailyHours: { type: Number, default: 8, min: 1, max: 24 },

    // Lets data analysts apply CSV clean-up imports to live data (admins always can). A super admin can switch it off.
    analystImportsEnabled: { type: Boolean, default: true },

    // Reporting warehouse sync bookkeeping (see services/warehouseService.js).
    lastWarehouseSync: { type: Date },
    warehouseLockUntil: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
