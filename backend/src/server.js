const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/environment');
const connectDatabase = require('./config/database');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const biRoutes = require('./routes/biRoutes');
const biWriteRoutes = require('./routes/biWriteRoutes');
const analystRoutes = require('./routes/analystRoutes');

const app = express();

// Behind Render / nginx / a load balancer the real client IP is in
// X-Forwarded-For; without this, rate limits and login-activity IPs are wrong.
app.set('trust proxy', 1);

// --- Security middleware (Section 7: Non-Functional Requirements) ---
app.use(helmet());
app.use(
  cors({
    origin: env.allowedOrigins.includes('*') ? true : env.allowedOrigins,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// Rate limiting: applied globally, and tighter on the face-capture endpoints
// which are the most sensitive / most expensive to process.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
const attendanceLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use('/api/attendance/check-in', attendanceLimiter);
app.use('/api/attendance/check-out', attendanceLimiter);
app.use('/api/attendance/verify', attendanceLimiter);
app.use('/api/attendance/me/check-in', attendanceLimiter);
app.use('/api/attendance/me/check-out', attendanceLimiter);

// Brute-force protection for passwords and 6-digit 2FA codes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/employee-login', authLimiter);
app.use('/api/auth/verify-2fa', authLimiter);

// --- Routes ---
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'attendance-backend' }));
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/settings', settingsRoutes);
// Read-only reporting feed for Power BI (API-key protected, rate limited).
app.use('/api/analyst', analystRoutes);
app.use('/api/bi', rateLimit({ windowMs: 60 * 1000, max: 60 }), biRoutes);
// Audited write-back from dashboards (separate WRITE key, tight rate limit).
app.use('/api/bi-write', rateLimit({ windowMs: 60 * 1000, max: 30 }), biWriteRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorMiddleware);

async function start() {
  await connectDatabase();
  app.listen(env.port, '0.0.0.0', () => {
    logger.info(`Backend listening on http://0.0.0.0:${env.port}`);
    logger.info(`AI face service expected at ${env.faceServiceUrl}`);
    require('./services/warehouseService').startScheduler();
    if (!require('./utils/email').isConfigured()) {
      logger.warn('SMTP is NOT configured — password-reset emails will only be printed here, never delivered. Set SMTP_HOST/SMTP_USER/SMTP_PASS.');
    }
  });
}

start();

module.exports = app;
