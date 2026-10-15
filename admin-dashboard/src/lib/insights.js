import { outliers, aggregate } from './analytics.js';

// Automatic findings from one period of data. Each insight:
//   { id, level: 'warn'|'info'|'good', title, text, columns, rows }
// Thresholds are deliberately simple and visible so an analyst can sanity-check them.
export function buildInsights({ daily, scorecard, attendance, payroll }) {
  const out = [];
  const top = (arr, n = 8) => arr.slice(0, n);

  // 1. Repeat late-comers
  const late = scorecard.filter((e) => e.lateCount >= 3 || (e.daysPresent >= 5 && e.latePct >= 25))
    .sort((a, b) => b.lateCount - a.lateCount);
  if (late.length) out.push({ id: 'late', level: 'warn', title: `${late.length} repeat late-comer${late.length > 1 ? 's' : ''}`,
    text: 'Late 3+ times, or late on at least a quarter of their present days.',
    columns: ['name', 'department', 'lateCount', 'latePct', 'avgMinutesLate', 'penaltyCharged'], rows: top(late) });

  // 2. Missing check-outs (hours are lost for payroll until corrected)
  const missing = scorecard.filter((e) => e.missingCheckouts > 0).sort((a, b) => b.missingCheckouts - a.missingCheckouts);
  if (missing.length) out.push({ id: 'missing', level: 'warn', title: `${missing.reduce((a, e) => a + e.missingCheckouts, 0)} day(s) with no check-out`,
    text: 'These days count as 0 hours in payroll until an admin corrects them.',
    columns: ['name', 'department', 'missingCheckouts'], rows: top(missing) });

  // 3. Worst weekday for lateness
  const byDay = {};
  daily.forEach((d) => { (byDay[d.weekday] = byDay[d.weekday] || []).push(d); });
  const dayStats = Object.entries(byDay).map(([weekday, ds]) => ({ weekday, days: ds.length, late: ds.reduce((a, d) => a + d.late, 0), avgLatePct: aggregate(ds.map((d) => d.latePct), 'mean') }))
    .sort((a, b) => b.avgLatePct - a.avgLatePct);
  if (dayStats.length > 1 && dayStats[0].avgLatePct > 0) out.push({ id: 'weekday', level: 'info', title: `${dayStats[0].weekday} is the latest day`,
    text: `Average ${dayStats[0].avgLatePct}% of people arrive late on ${dayStats[0].weekday}s.`,
    columns: ['weekday', 'days', 'late', 'avgLatePct'], rows: dayStats });

  // 4. Departments: absence & lateness
  const deps = {};
  scorecard.forEach((e) => { const d = e.department || '—'; (deps[d] = deps[d] || []).push(e); });
  const depStats = Object.entries(deps).map(([department, es]) => ({
    department, people: es.length,
    absentDays: es.reduce((a, e) => a + e.daysAbsent, 0),
    lateCount: es.reduce((a, e) => a + e.lateCount, 0),
    avgHoursPerDay: aggregate(es.map((e) => e.avgHoursPerDay), 'mean'),
  })).sort((a, b) => b.absentDays - a.absentDays);
  if (depStats.length > 1) out.push({ id: 'dept', level: 'info', title: `${depStats[0].department} has the most absent days`,
    text: 'Department comparison for the period.', columns: ['department', 'people', 'absentDays', 'lateCount', 'avgHoursPerDay'], rows: depStats });

  // 5. Under-hours and heavy overtime
  const under = scorecard.filter((e) => e.daysPresent >= 5 && e.avgHoursPerDay > 0 && e.avgHoursPerDay < 6.5).sort((a, b) => a.avgHoursPerDay - b.avgHoursPerDay);
  if (under.length) out.push({ id: 'under', level: 'warn', title: `${under.length} employee(s) averaging under 6.5 hours a day`,
    text: 'Present at least 5 days but short on hours.', columns: ['name', 'department', 'daysPresent', 'avgHoursPerDay', 'totalHours'], rows: top(under) });
  const ot = scorecard.filter((e) => e.overtimeHours >= 10).sort((a, b) => b.overtimeHours - a.overtimeHours);
  if (ot.length) out.push({ id: 'ot', level: 'info', title: `${ot.length} employee(s) with 10+ overtime hours`,
    text: 'Possible burnout or understaffing; also a cost if overtime is paid.', columns: ['name', 'department', 'overtimeHours', 'avgHoursPerDay'], rows: top(ot) });

  // 6. Penalty waivers
  const waived = attendance.filter((a) => a.penaltyWaived);
  if (waived.length) {
    const by = {};
    waived.forEach((a) => { const k = a.penaltyWaivedBy || 'unknown'; by[k] = by[k] || { waivedBy: k, count: 0, amount: 0 }; by[k].count += 1; by[k].amount += a.penaltyAmount; });
    const charged = attendance.filter((a) => a.isLate && !a.penaltyWaived).length;
    out.push({ id: 'waive', level: 'info', title: `${waived.length} of ${waived.length + charged} late penalties were waived`,
      text: 'Who waived them — useful for consistency checks.', columns: ['waivedBy', 'count', 'amount'], rows: Object.values(by).sort((a, b) => b.count - a.count) });
  }

  // 7. Remote vs office hours
  const office = attendance.filter((a) => a.workMode === 'office' && a.workedHours > 0);
  const remote = attendance.filter((a) => a.workMode === 'remote' && a.workedHours > 0);
  if (office.length && remote.length) {
    const o = aggregate(office.map((a) => a.workedHours), 'mean'); const r = aggregate(remote.map((a) => a.workedHours), 'mean');
    out.push({ id: 'mode', level: 'good', title: `Remote days average ${r} h vs ${o} h in the office`,
      text: `${remote.length} remote vs ${office.length} office days with recorded hours.`, columns: ['workMode', 'days', 'avgHours'],
      rows: [{ workMode: 'office', days: office.length, avgHours: o }, { workMode: 'remote', days: remote.length, avgHours: r }] });
  }

  // 8. Pay outliers
  const pay = outliers(payroll, 'Net Salary', 'Employee Name');
  if (pay.length) out.push({ id: 'pay', level: 'info', title: `${pay.length} unusual net salar${pay.length > 1 ? 'ies' : 'y'}`,
    text: 'More than 2.5 standard deviations from the average (z-score).', columns: ['label', 'value', 'z'],
    rows: pay.map((p) => ({ label: p.label, value: p.value, z: Math.round(p.z * 100) / 100 })) });

  // 9. Data quality
  const noFace = 0; // placeholder for future face coverage metric
  const zeroHours = scorecard.filter((e) => e.daysPresent > 0 && e.totalHours === 0);
  if (zeroHours.length || noFace) out.push({ id: 'dq', level: 'warn', title: `${zeroHours.length} employee(s) present but with 0 recorded hours`,
    text: 'Likely always forgetting to check out — their pay will be understated.', columns: ['name', 'department', 'daysPresent', 'missingCheckouts'], rows: top(zeroHours) });

  if (!out.length) out.push({ id: 'none', level: 'good', title: 'Nothing unusual in this period', text: 'No repeat late-comers, missing check-outs or outliers were found.', columns: [], rows: [] });
  return out;
}
