// Centralized environment configuration.
// Every other module reads config from here instead of process.env directly,
// so defaults and validation live in exactly one place.
require('dotenv').config();

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Timezone used for "today", late-arrival checks and hybrid office days.
  timezone: process.env.TIMEZONE || process.env.TZ || 'Asia/Kolkata',

  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/attendance_system'),

  jwtSecret: required('JWT_SECRET', 'dev_secret_change_me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  faceServiceUrl: process.env.FACE_SERVICE_URL || 'http://127.0.0.1:8000',
  faceMatchThreshold: parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.80'),

  uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5', 10),

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim()),

  // Used to build links inside emails (password reset, etc). Should point at
  // the admin dashboard / employee portal, e.g. https://app.example.com
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Attendai <no-reply@attendai.app>',
  },

  // --- Business-intelligence feed (Power BI etc.) ---
  // Secret key a BI tool sends in the `x-api-key` header to read /api/bi/*.
  // Leave empty to keep the feed switched off.
  reportingApiKey: process.env.REPORTING_API_KEY || '',
  // Separate secret that allows the few audited WRITE actions under /api/bi-write
  // (waive a late penalty, add a bonus/deduction, change an hourly rate).
  // Different from the read key on purpose. Empty = write-back switched off.
  reportingWriteKey: process.env.REPORTING_WRITE_KEY || '',
  writeback: {
    maxAmount: Number(process.env.WRITEBACK_MAX_AMOUNT || 50000),       // largest single bonus/deduction (₹)
    maxHourlyRate: Number(process.env.WRITEBACK_MAX_HOURLY_RATE || 5000), // largest hourly rate (₹)
    monthsBack: Number(process.env.WRITEBACK_MONTHS_BACK || 1),          // how many past months stay editable
  },
  // Optional: a Power BI "streaming dataset" push URL. When set, every
  // check-in / check-out is pushed to it the moment it happens.
  powerBiPushUrl: process.env.POWERBI_PUSH_URL || '',

  passwordResetExpiryMinutes: parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '30', 10),

  // If true, every employee is required to finish 2FA setup before their
  // portal login is considered complete (login response flags setupRequired).
  employeeTwoFactorRequired: (process.env.EMPLOYEE_2FA_REQUIRED || 'false') === 'true',
};
