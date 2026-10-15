const dayjs = require('dayjs');
const Settings = require('../models/Settings');
const { ReportAttendance, ReportPayroll } = require('../models/ReportRows');
const biService = require('./biService');
const settingsService = require('./settingsService');
const { todayKey, currentMonthKey, nowTz } = require('../utils/date');
const logger = require('../utils/logger');

// Copies the BI tables into the reporting collections.
//   incremental (default): last 7 days of attendance + this & last month payroll
//   full:                  last 400 days of attendance + last 13 months payroll
// Safe to run repeatedly (upsert). Rows missing from the live data are kept.

const LOCK_MINUTES = 15;

async function acquireLock() {
  await settingsService.getSettings(); // make sure the doc exists
  const now = new Date();
  const doc = await Settings.findOneAndUpdate(
    { key: 'org', $or: [{ warehouseLockUntil: { $exists: false } }, { warehouseLockUntil: null }, { warehouseLockUntil: { $lt: now } }] },
    { warehouseLockUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) },
    { new: true }
  );
  return !!doc; // false => another instance is already syncing
}

async function upsertAll(Model, rows, keyFields) {
  if (!rows.length) return 0;
  const syncedAt = new Date();
  const ops = rows.map((r) => ({
    updateOne: {
      filter: Object.fromEntries(keyFields.map((k) => [k, r[k]])),
      update: { $set: { ...r, syncedAt } },
      upsert: true,
    },
  }));
  await Model.bulkWrite(ops, { ordered: false });
  return rows.length;
}

async function sync({ full = false } = {}) {
  if (!(await acquireLock())) return { skipped: true, reason: 'A sync is already running' };
  const started = Date.now();
  try {
    const to = todayKey();
    const from = dayjs(to).subtract(full ? 400 : 7, 'day').format('YYYY-MM-DD');
    const monthsBack = full ? 13 : 2;
    const months = biService.monthRange(
      { from: dayjs(`${currentMonthKey()}-01`).subtract(monthsBack - 1, 'month').format('YYYY-MM'), to: currentMonthKey() },
      monthsBack,
      24
    );

    const attendance = await biService.attendanceDaily({ _range: { from, to } });
    const payroll = await biService.payrollMonthly({}, { months });

    const a = await upsertAll(ReportAttendance, attendance, ['date', 'employeeId']);
    const p = await upsertAll(ReportPayroll, payroll, ['month', 'employeeId']);

    await Settings.updateOne({ key: 'org' }, { lastWarehouseSync: new Date(), warehouseLockUntil: null });
    const result = { full, attendanceRows: a, payrollRows: p, from, to, months: months.length, ms: Date.now() - started };
    logger.info(`Warehouse sync done: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    await Settings.updateOne({ key: 'org' }, { warehouseLockUntil: null });
    logger.error(`Warehouse sync FAILED: ${err.message}`);
    throw err;
  }
}

// Reads for the BI feed (?source=warehouse). Same filters as the live feed.
async function readAttendance(q) {
  const { from, to } = biService.dateRange(q);
  return ReportAttendance.find({ date: { $gte: from, $lte: to } }, { _id: 0, syncedAt: 0 }).sort({ date: 1, employeeId: 1 }).lean();
}
async function readPayroll(q) {
  const months = biService.monthRange(q);
  return ReportPayroll.find({ month: { $in: months } }, { _id: 0, syncedAt: 0 }).sort({ month: 1, employeeId: 1 }).lean();
}

async function status() {
  const s = await settingsService.getSettings();
  const [a, p] = await Promise.all([ReportAttendance.estimatedDocumentCount(), ReportPayroll.estimatedDocumentCount()]);
  return { lastSync: s.lastWarehouseSync || null, attendanceRows: a, payrollRows: p };
}

// Runs once a day at WAREHOUSE_SYNC_HOUR (org timezone, default 2 AM). Checks
// every 10 minutes; the DB lock + lastSync date stop duplicate runs across
// several backend instances. Set WAREHOUSE_SYNC_HOUR=off to disable.
function startScheduler() {
  const hourEnv = process.env.WAREHOUSE_SYNC_HOUR;
  if (hourEnv === 'off') return;
  const hour = Number.isFinite(Number(hourEnv)) && hourEnv !== undefined && hourEnv !== '' ? Number(hourEnv) : 2;

  const tick = async () => {
    try {
      if (nowTz().hour() < hour) return;
      const s = await settingsService.getSettings();
      const last = s.lastWarehouseSync ? nowTz(s.lastWarehouseSync).format('YYYY-MM-DD') : null;
      if (last === todayKey()) return;
      await sync({ full: !s.lastWarehouseSync }); // very first run backfills history
    } catch (err) {
      logger.error(`Warehouse scheduler error: ${err.message}`);
    }
  };
  setTimeout(tick, 30000).unref();
  setInterval(tick, 10 * 60 * 1000).unref();
  logger.info(`Warehouse sync scheduled daily after ${hour}:00 (${require('../config/environment').timezone}).`);
}

module.exports = { sync, readAttendance, readPayroll, status, startScheduler };
