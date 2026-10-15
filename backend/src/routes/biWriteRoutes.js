const router = require('express').Router();
const apiKey = require('../middleware/apiKeyMiddleware');
const svc = require('../services/biWriteService');
const { success, failure } = require('../utils/response');

// Audited write-back for dashboards (Power Apps / Power Automate).
// Auth: header  x-api-key: <REPORTING_WRITE_KEY>   (NOT the read key)
// Every body needs `actor` (who is doing it) and may carry `requestId` (retry-safe).
router.use(apiKey.write);

const wrap = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req.body || {});
    return success(res, 200, out.message, out);
  } catch (err) {
    if (err instanceof svc.WriteError) return failure(res, err.statusCode, err.message);
    return next(err);
  }
};

router.post('/penalty', wrap(svc.penalty));         // { employeeId, date | attendanceId, action: waive|restore, reason, actor }
router.post('/adjustment', wrap(svc.adjustment));   // { employeeId, month, type: bonus|deduction, amount, reason, actor }
router.post('/hourly-rate', wrap(svc.hourlyRate));  // { employeeId, hourlyRate, reason, actor }

router.get('/changes', async (req, res, next) => {
  try {
    const rows = await svc.recentChanges(req.query.limit);
    if (req.query.format === 'csv') {
      const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
      const cols = ['time', 'actor', 'action', 'entity', 'entityId', 'detail'];
      res.type('text/csv').send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
      return;
    }
    return res.json({ success: true, count: rows.length, value: rows });
  } catch (err) { next(err); }
});

module.exports = router;
