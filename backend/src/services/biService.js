const dayjs = require('dayjs');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const payrollService = require('./payrollService');
const settingsService = require('./settingsService');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const { minutesWorked, todayKey, currentMonthKey, minutesOfDay } = require('../utils/date');

// Read-only, flat, BI-friendly tables. One row per record, simple column
// types, NO secrets (no passwords, face embeddings, 2FA secrets, tokens).
// Everything is read live from the same collections the app writes to, so a
// change in the app shows up on the next refresh of the report.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');

function dateRange({ from, to }, defaultDays = 90, maxDays = 800) {
  const end = isDate(to) ? to : todayKey();
  let start = isDate(from) ? from : dayjs(end).subtract(defaultDays, 'day').format('YYYY-MM-DD');
  // Cap very wide ranges so a typo can't pull years of rows.
  const earliest = dayjs(end).subtract(maxDays, 'day').format('YYYY-MM-DD');
  if (start < earliest) start = earliest;
  return { from: start, to: end };
}

async function employeeLookup() {
  const emps = await Employee.find({}).select('employeeId name department designation employmentType payType');
  const map = {};
  emps.forEach((e) => { map[e.employeeId] = e; });
  return map;
}

async function employees() {
  const emps = await Employee.find({}).sort({ employeeId: 1 });
  return emps.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    department: e.department || '',
    designation: e.designation || '',
    employmentType: e.employmentType || 'onsite',
    hybridOfficeDays: (e.hybridOfficeDays || []).join(','),
    payType: e.payType || 'monthly',
    hourlyRate: e.hourlyRate || 0,
    monthlySalary: e.monthlySalary || 0,
    paidLeavesPerMonth: e.paidLeavesPerMonth || 0,
    status: e.status,
    joiningDate: e.joiningDate ? dayjs(e.joiningDate).format('YYYY-MM-DD') : '',
    faceRegistered: !!e.faceRegistered,
    twoFactorEnabled: !!e.twoFactorEnabled,
  }));
}

async function attendanceDaily(q) {
  const { from, to } = q._range || dateRange(q);
  const [records, emps, settings] = await Promise.all([
    Attendance.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 }),
    employeeLookup(),
    settingsService.getSettings(),
  ]);
  const stdMinutes = (settings.standardDailyHours || 8) * 60;
  return records.map((r) => {
    const e = emps[r.employeeId] || {};
    const mins = r.workedMinutes || minutesWorked(r);
    const late = r.late || {};
    return {
      date: r.date,
      weekday: dayjs(r.date).format('ddd'),
      employeeId: r.employeeId,
      name: e.name || '',
      department: e.department || '',
      employmentType: e.employmentType || 'onsite',
      workMode: r.workMode || 'office',
      status: r.status,
      leaveType: r.leaveType || 'auto',
      checkIn: r.checkIn?.timestamp ? new Date(r.checkIn.timestamp).toISOString() : '',
      checkOut: r.checkOut?.timestamp ? new Date(r.checkOut.timestamp).toISOString() : '',
      workedMinutes: mins,
      workedHours: round2(mins / 60),
      overtimeHours: round2(Math.max(0, mins - stdMinutes) / 60),
      missingCheckout: !!(r.checkIn?.timestamp && !r.checkOut?.timestamp),
      isLate: !!late.isLate,
      minutesLate: late.minutesLate || 0,
      penaltyAmount: late.isLate ? late.penaltyAmount || 0 : 0,
      penaltyWaived: !!(late.isLate && late.waived),
      penaltyWaivedBy: late.waivedByName || '',
      penaltyCharged: late.isLate && !late.waived ? late.penaltyAmount || 0 : 0,
    };
  });
}

// Payroll for every month in [from, to] (YYYY-MM). Defaults to the last 6
// months; capped at 24 so a typo can't trigger a huge calculation.
function monthRange({ from, to }, defaultMonths = 6, cap = 24) {
  const end = isMonth(to) ? to : currentMonthKey();
  const start = isMonth(from) ? from : dayjs(`${end}-01`).subtract(defaultMonths - 1, 'month').format('YYYY-MM');
  const months = [];
  for (let m = dayjs(`${start}-01`); !m.isAfter(dayjs(`${end}-01`)) && months.length < cap; m = m.add(1, 'month')) {
    months.push(m.format('YYYY-MM'));
  }
  return months;
}

async function payrollMonthly(q, opts = {}) {
  const months = opts.months || monthRange(q);
  const rows = [];
  for (const month of months) {
    const report = await payrollService.buildSalaryReport({ month });
    for (const r of report) {
      rows.push({
        month: r.month,
        employeeId: r.employeeId,
        name: r.name,
        department: r.department || '',
        employmentType: r.employmentType,
        payType: r.payType,
        monthlySalary: r.monthlySalary,
        hourlyRate: r.hourlyRate,
        workingDays: r.workingDays,
        presentDays: r.presentDays,
        halfDays: r.halfDays,
        paidLeaveDays: r.paidLeaveDays,
        unpaidLeaveDays: r.unpaidLeaveDays,
        absentDays: r.absentDays,
        totalWorkedHours: r.totalWorkedHours,
        overtimeHours: r.overtimeHours,
        overtimePay: r.overtimePay,
        basicSalary: r.basicSalary,
        leaveTotalDays: r.leaveTotalDays,
        expectedHours: r.expectedHours,
        missingCheckouts: r.missingCheckouts,
        hourlyPay: r.hourlyPay,
        paidLeavePay: r.paidLeavePay,
        grossPay: r.grossPay,
        leaveDeduction: r.leaveDeduction,
        lateCount: r.lateCount,
        latePenaltyTotal: r.latePenaltyTotal,
        waivedPenaltyCount: r.waivedPenaltyCount,
        waivedPenaltyTotal: r.waivedPenaltyTotal,
        bonusTotal: r.bonusTotal,
        manualDeductionTotal: r.manualDeductionTotal,
        netSalary: r.netSalary,
      });
    }
  }
  return rows;
}

// The analyst's payroll sheet, in the exact column layout his notebook
// (df_payroll) uses. One row per employee per month, no empty columns:
//   Gross Salary    = Basic Salary + Overtime Pay + Bonus
//   Total Deduction = unpaid-leave deduction + late penalties + other deductions
//   Net Salary      = Gross Salary - Total Deduction
//   Present Days    = full present days + 0.5 per half day
//   Leave Days      = all leave days taken (paid + unpaid), absent days are separate
// `extended=1` appends the building blocks (hours, bonus, penalty counts…).
async function payrollSheet(q) {
  const rows = await payrollMonthly(q);
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  return rows.map((r) => {
    const gross = r2(r.basicSalary + r.overtimePay + r.bonusTotal);
    const deduction = r2(r.leaveDeduction + r.latePenaltyTotal + r.manualDeductionTotal);
    const base = {
      'Employee ID': r.employeeId,
      'Employee Name': r.name,
      Department: r.department,
      Month: r.month,
      'Working Days': r.workingDays,
      'Present Days': r.presentDays + r.halfDays * 0.5,
      'Absent Days': r.absentDays,
      'Leave Days': r.leaveTotalDays,
      'Overtime Hours': r.overtimeHours,
      'Basic Salary': r.basicSalary,
      'Overtime Pay': r.overtimePay,
      'Gross Salary': gross,
      'Total Deduction': deduction,
      'Net Salary': r2(gross - deduction),
    };
    if (String(q.extended) !== '1') return base;
    return {
      ...base,
      'Employment Type': r.employmentType,
      'Pay Type': r.payType,
      'Total Worked Hours': r.totalWorkedHours,
      'Expected Hours': r.expectedHours,
      'Paid Leave Days': r.paidLeaveDays,
      'Unpaid Leave Days': r.unpaidLeaveDays,
      'Late Count': r.lateCount,
      'Late Penalty': r.latePenaltyTotal,
      'Leave Deduction': r.leaveDeduction,
      'Other Deduction': r.manualDeductionTotal,
      Bonus: r.bonusTotal,
    };
  });
}

async function leave(q) {
  const { from, to } = dateRange(q, 365);
  const [reqs, emps] = await Promise.all([
    LeaveRequest.find({ fromDate: { $lte: to }, toDate: { $gte: from } }).sort({ fromDate: 1 }),
    employeeLookup(),
  ]);
  return reqs.map((r) => ({
    requestId: String(r._id),
    employeeId: r.employeeId,
    name: r.employeeName || emps[r.employeeId]?.name || '',
    department: emps[r.employeeId]?.department || '',
    fromDate: r.fromDate,
    toDate: r.toDate,
    days: dayjs(r.toDate).diff(dayjs(r.fromDate), 'day') + 1,
    type: r.type,
    status: r.status,
    payTreatment: r.status === 'approved' ? r.leaveType || 'auto' : '',
    reason: r.reason,
    decidedBy: r.decidedByName || '',
    decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : '',
    requestedAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  }));
}

// ---- Aggregated datasets (pure functions over attendance_daily rows) --------
const pct = (a, b) => (b ? round2((a / b) * 100) : 0);
const isPresentRow = (r) => !!r.checkIn;

function summarizeDaily(rows) {
  const byDate = {};
  rows.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  return Object.keys(byDate).sort().map((date) => {
    const rs = byDate[date];
    const present = rs.filter(isPresentRow);
    const hours = rs.reduce((a, r) => a + r.workedHours, 0);
    const withHours = rs.filter((r) => r.workedHours > 0);
    return {
      date,
      weekday: rs[0].weekday,
      employeesPresent: present.length,
      office: present.filter((r) => r.workMode === 'office').length,
      remote: present.filter((r) => r.workMode === 'remote').length,
      late: rs.filter((r) => r.isLate).length,
      latePct: pct(rs.filter((r) => r.isLate).length, present.length),
      onLeave: rs.filter((r) => r.status === 'leave' || r.status === 'half_day').length,
      absent: rs.filter((r) => r.status === 'absent').length,
      totalHours: round2(hours),
      avgHours: withHours.length ? round2(hours / withHours.length) : 0,
      overtimeHours: round2(rs.reduce((a, r) => a + r.overtimeHours, 0)),
      missingCheckouts: rs.filter((r) => r.missingCheckout && r.date !== todayKey()).length,
      penaltyCharged: round2(rs.reduce((a, r) => a + r.penaltyCharged, 0)),
      penaltyWaived: round2(rs.filter((r) => r.penaltyWaived).reduce((a, r) => a + r.penaltyAmount, 0)),
    };
  });
}

function summarizeEmployees(rows, empById = {}) {
  const by = {};
  rows.forEach((r) => { (by[r.employeeId] = by[r.employeeId] || []).push(r); });
  return Object.keys(by).sort().map((id) => {
    const rs = by[id];
    const present = rs.filter(isPresentRow);
    const hours = rs.reduce((a, r) => a + r.workedHours, 0);
    const withHours = rs.filter((r) => r.workedHours > 0);
    const arrivals = present.map((r) => minutesOfDay(new Date(r.checkIn)));
    const avgArrival = arrivals.length ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : null;
    const e = empById[id] || {};
    return {
      employeeId: id,
      name: rs[0].name,
      department: rs[0].department,
      employmentType: rs[0].employmentType,
      payType: e.payType || '',
      daysPresent: present.length,
      officeDays: present.filter((r) => r.workMode === 'office').length,
      remoteDays: present.filter((r) => r.workMode === 'remote').length,
      daysOnLeave: rs.filter((r) => r.status === 'leave' || r.status === 'half_day').length,
      daysAbsent: rs.filter((r) => r.status === 'absent').length,
      totalHours: round2(hours),
      avgHoursPerDay: withHours.length ? round2(hours / withHours.length) : 0,
      overtimeHours: round2(rs.reduce((a, r) => a + r.overtimeHours, 0)),
      lateCount: rs.filter((r) => r.isLate).length,
      latePct: pct(rs.filter((r) => r.isLate).length, present.length),
      avgMinutesLate: rs.filter((r) => r.isLate).length ? round2(rs.filter((r) => r.isLate).reduce((a, r) => a + r.minutesLate, 0) / rs.filter((r) => r.isLate).length) : 0,
      penaltyCharged: round2(rs.reduce((a, r) => a + r.penaltyCharged, 0)),
      penaltyWaived: round2(rs.filter((r) => r.penaltyWaived).reduce((a, r) => a + r.penaltyAmount, 0)),
      missingCheckouts: rs.filter((r) => r.missingCheckout && r.date !== todayKey()).length,
      avgArrival: avgArrival === null ? '' : `${String(Math.floor(avgArrival / 60)).padStart(2, '0')}:${String(avgArrival % 60).padStart(2, '0')}`,
    };
  });
}

async function dailySummary(q) { return summarizeDaily(await attendanceDaily(q)); }
async function employeeScorecard(q) {
  const [rows, emps] = await Promise.all([attendanceDaily(q), employeeLookup()]);
  return summarizeEmployees(rows, emps);
}

async function adjustments(q) {
  const months = monthRange(q, 6);
  const [rows, emps] = await Promise.all([PayrollAdjustment.find({ month: { $in: months } }).sort({ month: 1 }), employeeLookup()]);
  return rows.map((a) => ({
    month: a.month,
    employeeId: a.employeeId,
    name: emps[a.employeeId]?.name || '',
    department: emps[a.employeeId]?.department || '',
    type: a.type,
    amount: a.amount,
    reason: a.reason || '',
    addedBy: a.addedByName || '',
    addedAt: a.createdAt ? new Date(a.createdAt).toISOString() : '',
  }));
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

const DATASETS = {
  payroll_sheet: payrollSheet,
  daily_summary: dailySummary,
  employee_scorecard: employeeScorecard,
  adjustments,
  employees,
  attendance_daily: attendanceDaily,
  payroll_monthly: payrollMonthly,
  leave,
};

module.exports = { DATASETS, toCsv, dateRange, monthRange, attendanceDaily, payrollMonthly, summarizeDaily, summarizeEmployees };
