const dayjs = require('dayjs');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const AuditLog = require('../models/AuditLog');
const attendanceService = require('./attendanceService');
const env = require('../config/environment');
const { currentMonthKey } = require('../utils/date');

// The ONLY things a dashboard may change. Everything is:
//   - authorised by the separate write key,
//   - attributed to a named person ("actor", e.g. their email from Power Apps),
//   - bounded (amount caps, editable-month window),
//   - recorded in the audit log with source = 'powerbi',
//   - idempotent via requestId (retries are applied once).
// Attendance times, approved leave, salaries and face data cannot be changed here.

class WriteError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

function actorOf(actor) {
  const a = String(actor || '').trim();
  if (a.length < 3) throw new WriteError('"actor" (who is making this change, e.g. their email) is required');
  return { name: `Power BI · ${a}`, source: 'powerbi' };
}

// Months that may still be edited: this month back to `monthsBack` earlier.
function assertMonthEditable(month, now = currentMonthKey()) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new WriteError('month must look like 2026-10');
  const oldest = dayjs(`${now}-01`).subtract(env.writeback.monthsBack, 'month').format('YYYY-MM');
  if (month > now) throw new WriteError('Cannot change a future month');
  if (month < oldest) throw new WriteError(`Payroll for ${month} is locked. Only ${oldest} to ${now} can be changed from a dashboard.`, 403);
}

async function alreadyDone(requestId) {
  if (!requestId) return null;
  return AuditLog.findOne({ requestId });
}

async function penalty({ attendanceId, employeeId, date, action, reason, actor, requestId }) {
  const who = actorOf(actor);
  if (!['waive', 'restore'].includes(action)) throw new WriteError('action must be "waive" or "restore"');
  if (action === 'waive' && !String(reason || '').trim()) throw new WriteError('A reason is required to waive a penalty');

  if (await alreadyDone(requestId)) return { duplicate: true, message: 'Already applied (duplicate request ignored)' };

  const record = attendanceId
    ? await Attendance.findById(attendanceId)
    : await Attendance.findOne({ employeeId, date });
  if (!record) throw new WriteError('Attendance record not found', 404);
  assertMonthEditable(record.date.slice(0, 7));

  const updated = await attendanceService.setPenaltyWaived(
    record._id, { action, reason }, { ...who, id: undefined, requestId }
  );
  return {
    message: action === 'waive' ? 'Late penalty waived' : 'Late penalty restored',
    employeeId: updated.employeeId,
    date: updated.date,
    waived: updated.late.waived,
  };
}

async function adjustment({ employeeId, month, type, amount, reason, actor, requestId }) {
  const who = actorOf(actor);
  if (!['bonus', 'deduction'].includes(type)) throw new WriteError('type must be "bonus" or "deduction"');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new WriteError('amount must be a number greater than 0');
  if (amt > env.writeback.maxAmount) {
    throw new WriteError(`Amount is above the dashboard limit of ₹${env.writeback.maxAmount}. Add it in the Attendai app instead.`, 403);
  }
  if (!String(reason || '').trim()) throw new WriteError('A reason is required');
  assertMonthEditable(month);

  if (await alreadyDone(requestId)) return { duplicate: true, message: 'Already applied (duplicate request ignored)' };

  const employee = await Employee.findOne({ employeeId, status: 'active' }).select('employeeId name');
  if (!employee) throw new WriteError('Active employee not found', 404);

  const doc = await PayrollAdjustment.create({
    employeeId, month, type, amount: amt, reason: String(reason).trim(), addedByName: who.name,
  });
  try {
    await AuditLog.create({
      actorName: who.name, source: 'powerbi', requestId,
      action: 'ADD_PAYROLL_ADJUSTMENT', entity: 'PayrollAdjustment', entityId: String(doc._id),
      newValue: { employeeId, month, type, amount: amt, reason },
    });
  } catch (err) {
    // Two identical retries raced: the other one won the requestId. Undo ours.
    if (err.code === 11000) {
      await PayrollAdjustment.deleteOne({ _id: doc._id });
      return { duplicate: true, message: 'Already applied (duplicate request ignored)' };
    }
    throw err;
  }
  return { message: `${type === 'bonus' ? 'Bonus' : 'Deduction'} of ₹${amt} added for ${employee.name} (${month})`, adjustmentId: String(doc._id) };
}

async function hourlyRate({ employeeId, hourlyRate: rate, reason, actor, requestId }) {
  const who = actorOf(actor);
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) throw new WriteError('hourlyRate must be a number greater than 0');
  if (r > env.writeback.maxHourlyRate) {
    throw new WriteError(`Rate is above the dashboard limit of ₹${env.writeback.maxHourlyRate}/hour. Change it in the Attendai app instead.`, 403);
  }
  if (!String(reason || '').trim()) throw new WriteError('A reason is required');

  if (await alreadyDone(requestId)) return { duplicate: true, message: 'Already applied (duplicate request ignored)' };

  const employee = await Employee.findOne({ employeeId, status: 'active' }).select('employeeId name payType hourlyRate');
  if (!employee) throw new WriteError('Active employee not found', 404);
  if (employee.payType !== 'hourly') {
    throw new WriteError(`${employee.name} is paid monthly, so an hourly rate has no effect. Change their pay type in the Attendai app first.`, 409);
  }

  const previous = employee.hourlyRate;
  employee.hourlyRate = r;
  await employee.save();
  await AuditLog.create({
    actorName: who.name, source: 'powerbi', requestId,
    action: 'UPDATE_HOURLY_RATE', entity: 'Employee', entityId: employee.employeeId,
    previousValue: { hourlyRate: previous }, newValue: { hourlyRate: r, reason },
  });
  return { message: `Hourly rate for ${employee.name} changed from ₹${previous} to ₹${r}`, employeeId, previousRate: previous, hourlyRate: r };
}

// What was changed from dashboards recently — handy as a Power BI table too.
async function recentChanges(limit = 100) {
  const logs = await AuditLog.find({ source: 'powerbi' }).sort({ timestamp: -1 }).limit(Math.min(Number(limit) || 100, 500));
  return logs.map((l) => ({
    time: l.timestamp, actor: l.actorName, action: l.action, entity: l.entity, entityId: l.entityId,
    detail: JSON.stringify(l.newValue || {}),
  }));
}

module.exports = { WriteError, assertMonthEditable, actorOf, penalty, adjustment, hourlyRate, recentChanges };
