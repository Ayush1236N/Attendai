const dayjs = require('dayjs');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const AuditLog = require('../models/AuditLog');
const settingsService = require('./settingsService');
const { minutesWorked, currentMonthKey } = require('../utils/date');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Counts Mon-Fri days in a given YYYY-MM month. Kept simple on purpose
// (no public-holiday calendar); adjust here if your organization needs one.
function workingDaysInMonth(monthKey) {
  const start = dayjs(`${monthKey}-01`);
  const daysInMonth = start.daysInMonth();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const day = start.date(d).day(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

// Pure calculation for ONE employee-month. Kept free of database access so it
// can be unit-tested (see backend/test/payroll.test.js).
//
//   Hours      Total worked hours = sum of (check-out - check-in) for the month.
//
//   Leave      Each 'leave' day counts 1, each 'half_day' counts 0.5.
//                - leaveType 'paid'   -> always paid
//                - leaveType 'unpaid' -> always unpaid
//                - leaveType 'auto'   -> paid while within the employee's
//                  monthly paidLeavesPerMonth allowance, unpaid beyond it
//              'absent' days are always unpaid (they never use up the paid
//              allowance — that is what leave requests are for).
//
//   Monthly    gross = monthlySalary
//   employees  leaveDeduction = unpaidLeaveDays x (monthlySalary / workingDays)
//
//   Hourly     gross = workedHours x hourlyRate
//   employees         + paidLeaveDays x standardDailyHours x hourlyRate
//              Unpaid days simply earn nothing, so there is no separate
//              leave deduction line.
//
//   Penalties  Sum of late-arrival penalties that have NOT been waived.
//
//   net = gross - leaveDeduction - latePenaltyTotal + bonus - manualDeduction
function calculateEmployeeMonth({ employee, records, adjustments, workingDays, settings, monthKey }) {
  const stdHours = settings.standardDailyHours || 8;

  let presentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let absentDays = 0;
  let workedMinutes = 0;
  let overtimeMinutes = 0;
  let missingCheckouts = 0;
  let lateCount = 0;
  let latePenaltyTotal = 0;
  let waivedCount = 0;
  let waivedTotal = 0;

  let autoLeave = 0;
  let explicitPaid = 0;
  let explicitUnpaid = 0;

  for (const r of records) {
    if (r.status === 'present' || r.status === 'checked_out') presentDays += 1;
    else if (r.status === 'half_day') halfDays += 1;
    else if (r.status === 'leave') leaveDays += 1;
    else if (r.status === 'absent') absentDays += 1;

    const dayMinutes = r.workedMinutes || minutesWorked(r);
    workedMinutes += dayMinutes;
    // Overtime is measured per day: anything beyond the standard working day.
    overtimeMinutes += Math.max(0, dayMinutes - stdHours * 60);
    if (r.checkIn?.timestamp && !r.checkOut?.timestamp && r.status === 'present') missingCheckouts += 1;

    if (r.late && r.late.isLate) {
      if (r.late.waived) {
        waivedCount += 1;
        waivedTotal += r.late.penaltyAmount || 0;
      } else {
        lateCount += 1;
        latePenaltyTotal += r.late.penaltyAmount || 0;
      }
    }

    if (r.status === 'leave' || r.status === 'half_day') {
      const value = r.status === 'leave' ? 1 : 0.5;
      if (r.leaveType === 'paid') explicitPaid += value;
      else if (r.leaveType === 'unpaid') explicitUnpaid += value;
      else autoLeave += value;
    }
  }

  const allowance = employee.paidLeavesPerMonth || 0;
  const autoPaid = Math.min(autoLeave, allowance);
  const paidLeaveDays = explicitPaid + autoPaid;
  const unpaidLeaveDays = explicitUnpaid + (autoLeave - autoPaid) + absentDays;

  const workedHours = round2(workedMinutes / 60);
  const overtimeHours = round2(overtimeMinutes / 60);
  const otMultiplier = settings.overtimeMultiplier || 0;
  const isHourly = employee.payType === 'hourly';

  const baseMonthly = employee.monthlySalary || 0;
  const perDaySalary = workingDays > 0 ? baseMonthly / workingDays : 0;
  // Hourly equivalent of a monthly salary — informational for monthly staff.
  const effectiveHourlyRate = isHourly
    ? employee.hourlyRate || 0
    : workingDays > 0 && stdHours > 0 ? baseMonthly / (workingDays * stdHours) : 0;

  let hourlyPay = 0;
  let paidLeavePay = 0;
  let grossPay;
  let leaveDeduction = 0;

  if (isHourly) {
    hourlyPay = round2(workedHours * (employee.hourlyRate || 0));
    paidLeavePay = round2(paidLeaveDays * stdHours * (employee.hourlyRate || 0));
    grossPay = round2(hourlyPay + paidLeavePay);
  } else {
    grossPay = round2(baseMonthly);
    leaveDeduction = round2(unpaidLeaveDays * perDaySalary);
  }

  // Overtime pay (0 unless a multiplier is configured in the rules).
  // Monthly staff: OT hours x hourly equivalent x multiplier.
  // Hourly staff: base pay for those hours is already in hourlyPay, so only the premium (multiplier - 1) is added.
  let overtimePay = 0;
  if (otMultiplier > 0 && overtimeHours > 0) {
    overtimePay = isHourly
      ? overtimeHours * (employee.hourlyRate || 0) * Math.max(otMultiplier - 1, 0)
      : overtimeHours * effectiveHourlyRate * otMultiplier;
  }
  overtimePay = round2(overtimePay);
  const basicSalary = isHourly ? round2(hourlyPay + paidLeavePay) : round2(baseMonthly);
  grossPay = round2(grossPay + overtimePay);

  const bonusTotal = round2(adjustments.filter((a) => a.type === 'bonus').reduce((n, a) => n + a.amount, 0));
  const manualDeductionTotal = round2(
    adjustments.filter((a) => a.type === 'deduction').reduce((n, a) => n + a.amount, 0)
  );
  latePenaltyTotal = round2(latePenaltyTotal);

  const netSalary = round2(grossPay - leaveDeduction - latePenaltyTotal + bonusTotal - manualDeductionTotal);

  return {
    employeeId: employee.employeeId,
    name: employee.name,
    department: employee.department,
    employmentType: employee.employmentType || 'onsite',
    payType: employee.payType || 'monthly',
    month: monthKey,
    monthlySalary: baseMonthly,
    hourlyRate: employee.hourlyRate || 0,
    effectiveHourlyRate: round2(effectiveHourlyRate),
    workingDays,
    presentDays,
    halfDays,
    leaveDays,
    absentDays,
    leaveTotalDays: autoLeave + explicitPaid + explicitUnpaid,
    paidLeaveAllowance: allowance,
    paidLeaveDays,
    unpaidLeaveDays,
    totalWorkedHours: workedHours,
    overtimeHours,
    overtimePay,
    basicSalary,
    expectedHours: round2(workingDays * stdHours),
    missingCheckouts,
    perDaySalary: round2(perDaySalary),
    hourlyPay,
    paidLeavePay,
    grossPay,
    leaveDeduction,
    lateCount,
    latePenaltyTotal,
    waivedPenaltyCount: waivedCount,
    waivedPenaltyTotal: round2(waivedTotal),
    bonusTotal,
    manualDeductionTotal,
    netSalary,
    adjustments: adjustments.map((a) => ({
      id: a._id,
      type: a.type,
      amount: a.amount,
      reason: a.reason,
      addedByName: a.addedByName,
      createdAt: a.createdAt,
    })),
  };
}

// One payroll row per active employee for the month. Two queries total
// (employees + the month's attendance) regardless of headcount.
async function buildSalaryReport({ month, employeeId } = {}) {
  const monthKey = month || currentMonthKey();
  const workingDays = workingDaysInMonth(monthKey);
  const settings = await settingsService.getSettings();

  const employeeQuery = { status: 'active' };
  if (employeeId) employeeQuery.employeeId = employeeId;
  const employees = await Employee.find(employeeQuery).sort({ name: 1 });

  const adjustments = await PayrollAdjustment.find({
    month: monthKey,
    ...(employeeId ? { employeeId } : {}),
  });
  const adjustmentsByEmployee = {};
  for (const a of adjustments) (adjustmentsByEmployee[a.employeeId] = adjustmentsByEmployee[a.employeeId] || []).push(a);

  const attendance = await Attendance.find({
    date: { $regex: `^${monthKey}` },
    ...(employeeId ? { employeeId } : {}),
  });
  const attendanceByEmployee = {};
  for (const r of attendance) (attendanceByEmployee[r.employeeId] = attendanceByEmployee[r.employeeId] || []).push(r);

  return employees.map((emp) =>
    calculateEmployeeMonth({
      employee: emp,
      records: attendanceByEmployee[emp.employeeId] || [],
      adjustments: adjustmentsByEmployee[emp.employeeId] || [],
      workingDays,
      settings,
      monthKey,
    })
  );
}

// A single employee's own payslip for the month, including the day-by-day
// breakdown (hours per day, late penalties) so they can see exactly how
// the figure was reached.
async function buildMyPayslip(employeeId, month) {
  const [row] = await buildSalaryReport({ month, employeeId });
  if (!row) return null;
  const monthKey = row.month;
  const records = await Attendance.find({ employeeId, date: { $regex: `^${monthKey}` } }).sort({ date: 1 });
  const days = records.map((r) => ({
    date: r.date,
    status: r.status,
    workMode: r.workMode || 'office',
    leaveType: r.leaveType || 'auto',
    workedHours: round2((r.workedMinutes || minutesWorked(r)) / 60),
    late: {
      isLate: !!r.late?.isLate,
      minutesLate: r.late?.minutesLate || 0,
      penaltyAmount: r.late?.penaltyAmount || 0,
      waived: !!r.late?.waived,
    },
  }));
  return { ...row, days };
}

function toCsv(rows) {
  const header = [
    'employeeId', 'name', 'department', 'employmentType', 'payType', 'month',
    'monthlySalary', 'hourlyRate', 'workingDays', 'presentDays', 'halfDays', 'leaveDays',
    'absentDays', 'paidLeaveDays', 'unpaidLeaveDays', 'totalWorkedHours', 'hourlyPay',
    'paidLeavePay', 'grossPay', 'leaveDeduction', 'lateCount', 'latePenaltyTotal',
    'waivedPenaltyCount', 'bonusTotal', 'manualDeductionTotal', 'netSalary',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => header.map((h) => (['name', 'department'].includes(h) ? esc(r[h]) : r[h])).join(','));
  return [header.join(','), ...lines].join('\n');
}

// --- Manual adjustments (bonus / extra deduction) --------------------------

async function listAdjustments({ month, employeeId }) {
  const query = {};
  if (month) query.month = month;
  if (employeeId) query.employeeId = employeeId;
  return PayrollAdjustment.find(query).sort({ createdAt: -1 });
}

async function createAdjustment({ employeeId, month, type, amount, reason }, admin) {
  const employee = await Employee.findOne({ employeeId });
  if (!employee) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  const adjustment = await PayrollAdjustment.create({
    employeeId,
    month,
    type,
    amount,
    reason,
    addedBy: admin.id,
    addedByName: admin.name,
  });

  await AuditLog.create({
    adminId: admin.id,
    action: 'PAYROLL_ADJUSTMENT_CREATE',
    entity: 'PayrollAdjustment',
    entityId: adjustment._id,
    previousValue: null,
    newValue: adjustment.toObject(),
  });

  return adjustment;
}

async function deleteAdjustment(id, admin) {
  const adjustment = await PayrollAdjustment.findById(id);
  if (!adjustment) {
    const err = new Error('Adjustment not found');
    err.statusCode = 404;
    throw err;
  }

  await adjustment.deleteOne();

  await AuditLog.create({
    adminId: admin.id,
    action: 'PAYROLL_ADJUSTMENT_DELETE',
    entity: 'PayrollAdjustment',
    entityId: id,
    previousValue: adjustment.toObject(),
    newValue: null,
  });

  return adjustment;
}

// Lets the data-analyst / admin role update an employee's base salary and
// paid-leave allowance directly, without going through the full employee
// profile edit form. Writes straight to the live Employee record.
async function updateEmployeeSalary(employeeId, { monthlySalary, paidLeavesPerMonth, payType, hourlyRate }, admin) {
  const employee = await Employee.findOne({ employeeId });
  if (!employee) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  const previousValue = employee.toObject();
  if (monthlySalary !== undefined) employee.monthlySalary = monthlySalary;
  if (paidLeavesPerMonth !== undefined) employee.paidLeavesPerMonth = paidLeavesPerMonth;
  if (payType !== undefined) employee.payType = payType;
  if (hourlyRate !== undefined) employee.hourlyRate = hourlyRate;
  await employee.save();

  await AuditLog.create({
    adminId: admin.id,
    action: 'UPDATE_SALARY',
    entity: 'Employee',
    entityId: employee._id,
    previousValue,
    newValue: employee.toObject(),
  });

  return employee;
}

module.exports = {
  buildSalaryReport,
  buildMyPayslip,
  calculateEmployeeMonth,
  toCsv,
  workingDaysInMonth,
  listAdjustments,
  createAdjustment,
  deleteAdjustment,
  updateEmployeeSalary,
};
