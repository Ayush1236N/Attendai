const analyticsService = require('../services/analyticsService');
const { success } = require('../utils/response');

async function overview(req, res, next) {
  try {
    const { year, month, department } = req.query;
    const data = await analyticsService.overview({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      department: department || undefined,
    });
    return success(res, 200, 'Analytics overview retrieved', data);
  } catch (err) { next(err); }
}

async function bestPerformers(req, res, next) {
  try {
    const { month, limit, department, format } = req.query;
    const performers = await analyticsService.bestPerformers({
      month,
      limit: limit ? Number(limit) : undefined,
      department: department || undefined,
    });

    if (format === 'csv') {
      const csv = analyticsService.toCsv(performers);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="best_performers_${month || 'current'}.csv"`);
      return res.status(200).send(csv);
    }

    return success(res, 200, 'Best performers retrieved', { performers });
  } catch (err) { next(err); }
}

async function needsAttention(req, res, next) {
  try {
    const { month, limit, department } = req.query;
    const employees = await analyticsService.needsAttention({
      month,
      limit: limit ? Number(limit) : undefined,
      department: department || undefined,
    });
    return success(res, 200, 'Employees needing attention retrieved', { employees });
  } catch (err) { next(err); }
}

module.exports = { overview, bestPerformers, needsAttention };
