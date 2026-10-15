const router = require('express').Router();
const apiKey = require('../middleware/apiKeyMiddleware');
const biService = require('../services/biService');
const warehouse = require('../services/warehouseService');
const { failure } = require('../utils/response');

// Read-only feed for Power BI / Tableau / Looker Studio / Excel.
//   GET /api/bi                                -> list of datasets
//   GET /api/bi/employees
//   GET /api/bi/attendance_daily?from=YYYY-MM-DD&to=YYYY-MM-DD   (default: last 90 days)
//   GET /api/bi/payroll_monthly?from=YYYY-MM&to=YYYY-MM          (default: last 6 months)
//   GET /api/bi/_status                        -> warehouse sync status
//   Add `source=warehouse` to attendance_daily / payroll_monthly to read the synced history
//   (faster; keeps rows even if live data is later edited). Default source is live data.
//   GET /api/bi/leave?from=YYYY-MM-DD&to=YYYY-MM-DD              (default: last 365 days)
// Add `format=csv` for CSV (recommended for Power BI); default is JSON { value: [...] }.
// Auth: header  x-api-key: <REPORTING_API_KEY>
router.use(apiKey);

router.get('/', (req, res) => {
  res.json({
    success: true,
    datasets: Object.keys(biService.DATASETS).map((name) => ({ name, url: `/api/bi/${name}` })),
  });
});

router.get('/_status', async (req, res, next) => {
  try { res.json({ success: true, ...(await warehouse.status()) }); } catch (err) { next(err); }
});

router.get('/:dataset', async (req, res, next) => {
  try {
    const fn = biService.DATASETS[req.params.dataset];
    if (!fn) return failure(res, 404, `Unknown dataset. Available: ${Object.keys(biService.DATASETS).join(', ')}`);

    let rows;
    if (req.query.source === 'warehouse' && ['attendance_daily', 'payroll_monthly'].includes(req.params.dataset)) {
      rows = req.params.dataset === 'attendance_daily' ? await warehouse.readAttendance(req.query) : await warehouse.readPayroll(req.query);
    } else {
      rows = await fn(req.query);
    }
    res.setHeader('Cache-Control', 'no-store');

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.status(200).send(biService.toCsv(rows));
    }
    return res.json({ extractedAt: new Date().toISOString(), count: rows.length, value: rows });
  } catch (err) { next(err); }
});

module.exports = router;
