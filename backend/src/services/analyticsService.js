const dayjs = require('dayjs');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const dashboardService = require('./dashboardService');
const payrollService = require('./payrollService');

// Everything in this file reads Attendance/Employee/PayrollAdjustment
// directly — the same collections the rest of the app uses — and does so
// with exactly ONE query for employees and ONE query for the month's
// attendance records, no matter how many employees there are. Earlier this
// ran one Attendance query PER employee (an N+1 query pattern) and the
// department breakdown was silently hardcoded to "today" regardless of
// which month was selected. Both are fixed here.
async function computeMonthStats(monthKey, { department } = {}) {
  const employeeQuery = { status: 'active' };
  if (department) employeeQuery.department = department;
  const employees = await Employee.find(employeeQuery);

  const records = await Attendance.find({ date: { $regex: `^${monthKey}` } });

  const byEmployee = {};
  for (const r of records) {
    (byEmployee[r.employeeId] = byEmployee[r.employeeId] || []).push(r);
  }

  const employeeStats = employees.map((emp) => {
    const recs = byEmployee[emp.employeeId] || [];
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let halfDays = 0;

    for (const r of recs) {
      if (r.status === 'present' || r.status === 'checked_out') presentDays += 1;
      else if (r.status === 'absent') absentDays += 1;
      else if (r.status === 'leave') leaveDays += 1;
      else if (r.status === 'half_day') halfDays += 1;
    }

    const score = presentDays - absentDays - 0.5 * (leaveDays + halfDays);

    return {
      employeeId: emp.employeeId,
      name: emp.name,
      department: emp.department || 'Unassigned',
      presentDays,
      absentDays,
      leaveDays,
      halfDays,
      score,
    };
  });

  // Company-wide (or department-filtered) daily trend, built from the same
  // records — this is what was previously miscounting every status as
  // "present"; now only present/checked_out days count toward `present`.
  const employeeIdsInScope = new Set(employees.map((e) => e.employeeId));
  const byDate = {};
  for (const r of records) {
    if (!employeeIdsInScope.has(r.employeeId)) continue;
    byDate[r.date] = byDate[r.date] || { present: 0, checkedOut: 0, absent: 0, leave: 0, halfDay: 0 };
    if (r.status === 'present' || r.status === 'checked_out') byDate[r.date].present += 1;
    if (r.status === 'checked_out') byDate[r.date].checkedOut += 1;
    if (r.status === 'absent') byDate[r.date].absent += 1;
    if (r.status === 'leave') byDate[r.date].leave += 1;
    if (r.status === 'half_day') byDate[r.date].halfDay += 1;
  }

  const totalEmployees = employees.length;
  const dailyTrend = Object.entries(byDate)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, s]) => ({
      date,
      present: s.present,
      checkedOut: s.checkedOut,
      absent: s.absent,
      leave: s.leave,
      halfDay: s.halfDay,
      attendanceRate: totalEmployees ? Math.round((s.present / totalEmployees) * 1000) / 10 : 0,
    }));

  // Department breakdown — now genuinely for the selected month, not "today".
  const workingDays = payrollService.workingDaysInMonth(monthKey);
  const deptMap = {};
  for (const es of employeeStats) {
    const d = es.department;
    deptMap[d] = deptMap[d] || { department: d, headcount: 0, presentDays: 0, absentDays: 0, leaveDays: 0 };
    deptMap[d].headcount += 1;
    deptMap[d].presentDays += es.presentDays;
    deptMap[d].absentDays += es.absentDays;
    deptMap[d].leaveDays += es.leaveDays;
  }
  const departmentBreakdown = Object.values(deptMap).map((d) => ({
    ...d,
    attendanceRate: d.headcount && workingDays ? Math.round((d.presentDays / (d.headcount * workingDays)) * 1000) / 10 : 0,
  }));

  const totals = employeeStats.reduce(
    (acc, e) => ({
      totalPresentDays: acc.totalPresentDays + e.presentDays,
      totalAbsentDays: acc.totalAbsentDays + e.absentDays,
      totalLeaveDays: acc.totalLeaveDays + e.leaveDays,
      totalHalfDays: acc.totalHalfDays + e.halfDays,
    }),
    { totalPresentDays: 0, totalAbsentDays: 0, totalLeaveDays: 0, totalHalfDays: 0 }
  );
  const monthlyAttendanceRate =
    totalEmployees && workingDays
      ? Math.round((totals.totalPresentDays / (totalEmployees * workingDays)) * 1000) / 10
      : 0;

  return {
    employeeStats,
    dailyTrend,
    departmentBreakdown,
    workingDays,
    totalEmployees,
    ...totals,
    monthlyAttendanceRate,
  };
}

// Ranks employees by the same transparent score used throughout: +1 per
// present/checked-out day, -1 per absent day, -0.5 per leave or half-day.
async function bestPerformers({ month, limit, department } = {}) {
  const monthKey = month || require('../utils/date').currentMonthKey();
  const topN = limit || 10;

  const { employeeStats } = await computeMonthStats(monthKey, { department });
  const sorted = [...employeeStats].sort((a, b) => b.score - a.score);
  return sorted.slice(0, topN).map((r, i) => ({ rank: i + 1, ...r }));
}

// The flip side of bestPerformers — employees with the most absences/leave
// this month, so admins/analysts know who might need a conversation, not
// just who's doing well. Employees with zero attendance records at all are
// excluded so a brand-new hire isn't flagged on their first day.
async function needsAttention({ month, limit, department } = {}) {
  const monthKey = month || require('../utils/date').currentMonthKey();
  const topN = limit || 5;

  const { employeeStats } = await computeMonthStats(monthKey, { department });
  const withActivity = employeeStats.filter(
    (e) => e.presentDays + e.absentDays + e.leaveDays + e.halfDays > 0
  );
  const sorted = withActivity.sort((a, b) => a.score - b.score);
  return sorted.slice(0, topN).map((r, i) => ({ rank: i + 1, ...r }));
}

function toCsv(rows) {
  const header = ['rank', 'employeeId', 'name', 'department', 'presentDays', 'absentDays', 'leaveDays', 'halfDays', 'score'].join(',');
  const lines = rows.map((r) =>
    [r.rank, r.employeeId, `"${r.name}"`, `"${r.department}"`, r.presentDays, r.absentDays, r.leaveDays, r.halfDays, r.score].join(',')
  );
  return [header, ...lines].join('\n');
}

// One call that gives the Analytics page everything it needs: today's live
// snapshot, the month's daily trend and department breakdown, top/bottom
// performers, and a payroll summary for the same month — all read straight
// from Attendance/Employee/PayrollAdjustment, the same collections the rest
// of the app uses. Nothing here is a cached or separate "reporting" copy.
async function overview({ year, month, department } = {}) {
  const now = require('../utils/date').nowTz();
  const y = year || now.year();
  const m = month || now.month() + 1;
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;

  const [todaySummary, monthStats, salaryRows] = await Promise.all([
    dashboardService.summary(),
    computeMonthStats(monthKey, { department }),
    payrollService.buildSalaryReport({ month: monthKey }),
  ]);

  const sorted = [...monthStats.employeeStats].sort((a, b) => b.score - a.score);
  const topPerformers = sorted.slice(0, 5).map((r, i) => ({ rank: i + 1, ...r }));
  const bottomCandidates = monthStats.employeeStats.filter(
    (e) => e.presentDays + e.absentDays + e.leaveDays + e.halfDays > 0
  );
  const needsAttentionList = [...bottomCandidates]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r, i) => ({ rank: i + 1, ...r }));

  const payrollSummary = salaryRows.reduce(
    (acc, r) => ({
      totalGrossSalary: acc.totalGrossSalary + r.grossPay,
      totalWorkedHours: acc.totalWorkedHours + r.totalWorkedHours,
      totalLatePenalty: acc.totalLatePenalty + r.latePenaltyTotal,
      totalLeaveDeduction: acc.totalLeaveDeduction + r.leaveDeduction,
      totalBonus: acc.totalBonus + r.bonusTotal,
      totalManualDeduction: acc.totalManualDeduction + r.manualDeductionTotal,
      totalNetPayable: acc.totalNetPayable + r.netSalary,
    }),
    { totalGrossSalary: 0, totalWorkedHours: 0, totalLatePenalty: 0, totalLeaveDeduction: 0, totalBonus: 0, totalManualDeduction: 0, totalNetPayable: 0 }
  );

  return {
    month: monthKey,
    summary: {
      ...todaySummary,
      monthlyAttendanceRate: monthStats.monthlyAttendanceRate,
      totalLeaveDaysThisMonth: monthStats.totalLeaveDays,
      totalAbsentDaysThisMonth: monthStats.totalAbsentDays,
      totalHalfDaysThisMonth: monthStats.totalHalfDays,
      workingDaysThisMonth: monthStats.workingDays,
    },
    dailyTrend: monthStats.dailyTrend,
    departmentBreakdown: monthStats.departmentBreakdown,
    topPerformers,
    needsAttention: needsAttentionList,
    payrollSummary,
  };
}

module.exports = { bestPerformers, needsAttention, overview, toCsv, computeMonthStats };
