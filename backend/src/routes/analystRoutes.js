const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const biService = require('../services/biService');
const express = require('express');
const rateLimit = require('express-rate-limit');
const AnalystView = require('../models/AnalystView');
const importService = require('../services/importService');
const settingsService = require('../services/settingsService');
const { failure } = require('../utils/response');

// Data workspace for the analyst, using his normal login (no API key needed).
// Same tables as the Power BI feed (see biService), read-only.
//   GET /api/analyst/datasets
//   GET /api/analyst/data/:dataset?from=&to=&extended=1&format=csv
router.use(auth, requireRole('data_analyst', 'admin', 'super_admin'));

const LABELS = {
  payroll_sheet: 'Payroll sheet (analyst format)',
  daily_summary: 'Daily summary — one row per day',
  employee_scorecard: 'Employee scorecard — one row per employee',
  adjustments: 'Bonuses & deductions',
  employees: 'Employees',
  attendance_daily: 'Attendance — one row per employee per day',
  payroll_monthly: 'Payroll — detailed',
  leave: 'Leave requests',
};

router.get('/datasets', (req, res) => {
  res.json({
    success: true,
    datasets: Object.keys(biService.DATASETS).map((name) => ({
      name,
      label: LABELS[name] || name,
      // payroll tables filter by month (YYYY-MM); the others by date (YYYY-MM-DD)
      range: ['payroll_sheet', 'payroll_monthly', 'adjustments'].includes(name) ? 'month' : name === 'employees' ? 'none' : 'date',
    })),
  });
});

router.get('/data/:dataset', async (req, res, next) => {
  try {
    const fn = biService.DATASETS[req.params.dataset];
    if (!fn) return failure(res, 404, 'Unknown dataset');
    const rows = await fn(req.query);
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.dataset}.csv"`);
      return res.send(biService.toCsv(rows));
    }
    return res.json({ success: true, count: rows.length, rows });
  } catch (err) { next(err); }
});

// ---- CSV clean-up import ----------------------------------------------------
// The CSV travels as the raw request body (Content-Type: text/csv), target/mode in the query string.
//   GET  /import/template/:target         example file
//   POST /import/preview?target=&mode=    NOTHING is written; returns the cleaned plan + diff
//   POST /import/apply?target=&mode=&planHash=&skipInvalid=1&confirm=APPLY&filename=
//   GET  /import/history                  recent imports
//   POST /import/:id/undo                 restore the old values
const csvBody = express.text({ type: ['text/csv', 'text/plain'], limit: '6mb' });
const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { success: false, message: 'Too many imports this hour. Please wait.' } });

async function importAllowed(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    if (req.admin.role === 'data_analyst' && settings.analystImportsEnabled === false) {
      return failure(res, 403, 'CSV imports are switched off for data analysts. Ask a super admin (Payroll → rules → "Allow analyst CSV imports").');
    }
    next();
  } catch (err) { next(err); }
}

const handleImportError = (res, next, err) => (err instanceof importService.ImportError ? failure(res, err.statusCode, err.message) : next(err));
const shape = (p) => ({
  target: p.target, mode: p.mode, planHash: p.planHash, summary: p.summary, headers: p.headers, ignoredColumns: p.ignored,
  mapping: p.mapping,
  rows: p.rows.map((r) => ({ line: r.line, key: r.key, action: r.action, sensitive: r.sensitive, errors: r.errors, warnings: r.warnings, changes: r.changes })),
});

router.get('/import/template/:target', (req, res) => {
  try { res.type('text/csv').send(importService.templateCsv(req.params.target)); } catch (err) { failure(res, 404, err.message); }
});

router.post('/import/preview', importAllowed, csvBody, async (req, res, next) => {
  try {
    const plan = await importService.plan({ target: req.query.target, mode: req.query.mode || 'upsert', csv: req.body });
    res.json({ success: true, ...shape(plan) });
  } catch (err) { handleImportError(res, next, err); }
});

router.post('/import/apply', importAllowed, applyLimiter, csvBody, async (req, res, next) => {
  try {
    const result = await importService.apply({
      target: req.query.target, mode: req.query.mode || 'upsert', csv: req.body, filename: String(req.query.filename || '').slice(0, 120),
      planHash: req.query.planHash, skipInvalid: req.query.skipInvalid === '1', confirmText: req.query.confirm,
    }, req.admin);
    res.json({ success: true, message: 'Import applied', ...result });
  } catch (err) { handleImportError(res, next, err); }
});

router.get('/import/history', async (req, res, next) => {
  try { res.json({ success: true, imports: await importService.history(req.admin) }); } catch (err) { next(err); }
});

router.post('/import/:id/undo', importAllowed, async (req, res, next) => {
  try { res.json({ success: true, message: 'Import undone', report: await importService.undo(req.params.id, req.admin) }); } catch (err) { handleImportError(res, next, err); }
});

// ---- Saved views (own + ones teammates shared) ----------------------------
router.get('/views', async (req, res, next) => {
  try {
    const views = await AnalystView.find({ $or: [{ ownerId: req.admin.id }, { shared: true }] }).sort({ updatedAt: -1 }).limit(200);
    res.json({ success: true, views: views.map((v) => ({ id: v._id, name: v.name, shared: v.shared, owner: v.ownerName, mine: String(v.ownerId) === String(req.admin.id), config: v.config, updatedAt: v.updatedAt })) });
  } catch (err) { next(err); }
});

router.post('/views', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return failure(res, 400, 'Give the view a name');
    const view = await AnalystView.create({ ownerId: req.admin.id, ownerName: req.admin.name, name, shared: !!req.body.shared, config: req.body.config || {} });
    res.json({ success: true, view: { id: view._id, name: view.name } });
  } catch (err) { next(err); }
});

router.delete('/views/:id', async (req, res, next) => {
  try {
    const view = await AnalystView.findById(req.params.id);
    if (!view) return failure(res, 404, 'View not found');
    if (String(view.ownerId) !== String(req.admin.id) && req.admin.role !== 'super_admin') return failure(res, 403, 'Only the owner can delete this view');
    await view.deleteOne();
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
