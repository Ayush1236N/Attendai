// Run with:  node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { calculateEmployeeMonth } = require('../src/services/payrollService');

const settings = { standardDailyHours: 8 };
const day = (date, inH, outH, extra = {}) => ({
  date,
  status: outH ? 'checked_out' : 'present',
  checkIn: { timestamp: new Date(`${date}T${String(inH).padStart(2, '0')}:00:00Z`) },
  checkOut: outH ? { timestamp: new Date(`${date}T${String(outH).padStart(2, '0')}:00:00Z`) } : undefined,
  ...extra,
});
const run = (employee, records, adjustments = []) =>
  calculateEmployeeMonth({ employee, records, adjustments, workingDays: 20, settings, monthKey: '2026-10' });

test('hourly employee is paid for hours worked', () => {
  const r = run({ employeeId: 'E1', name: 'A', payType: 'hourly', hourlyRate: 200, paidLeavesPerMonth: 1 }, [
    day('2026-10-01', 9, 17), // 8h
    day('2026-10-02', 9, 14), // 5h
  ]);
  assert.strictEqual(r.totalWorkedHours, 13);
  assert.strictEqual(r.hourlyPay, 2600);
  assert.strictEqual(r.grossPay, 2600);
  assert.strictEqual(r.netSalary, 2600);
});

test('hourly employee gets paid-leave pay, not unpaid leave', () => {
  const r = run({ employeeId: 'E1', name: 'A', payType: 'hourly', hourlyRate: 100, paidLeavesPerMonth: 1 }, [
    { date: '2026-10-05', status: 'leave', leaveType: 'auto' }, // within allowance -> paid 8h
    { date: '2026-10-06', status: 'leave', leaveType: 'auto' }, // beyond allowance -> unpaid
  ]);
  assert.strictEqual(r.paidLeaveDays, 1);
  assert.strictEqual(r.unpaidLeaveDays, 1);
  assert.strictEqual(r.paidLeavePay, 800);
  assert.strictEqual(r.netSalary, 800);
});

test('monthly employee: unpaid leave beyond allowance is deducted per day', () => {
  const r = run({ employeeId: 'E2', name: 'B', payType: 'monthly', monthlySalary: 40000, paidLeavesPerMonth: 1 }, [
    { date: '2026-10-05', status: 'leave', leaveType: 'auto' },
    { date: '2026-10-06', status: 'leave', leaveType: 'auto' },
    { date: '2026-10-07', status: 'leave', leaveType: 'unpaid' },
  ]);
  assert.strictEqual(r.paidLeaveDays, 1);
  assert.strictEqual(r.unpaidLeaveDays, 2);
  assert.strictEqual(r.perDaySalary, 2000);
  assert.strictEqual(r.leaveDeduction, 4000);
  assert.strictEqual(r.netSalary, 36000);
});

test('explicit paid leave never deducts, and absent is always unpaid', () => {
  const r = run({ employeeId: 'E2', name: 'B', payType: 'monthly', monthlySalary: 20000, paidLeavesPerMonth: 0 }, [
    { date: '2026-10-05', status: 'leave', leaveType: 'paid' },
    { date: '2026-10-06', status: 'absent' },
  ]);
  assert.strictEqual(r.paidLeaveDays, 1);
  assert.strictEqual(r.unpaidLeaveDays, 1);
  assert.strictEqual(r.leaveDeduction, 1000);
});

test('half day counts as 0.5 leave', () => {
  const r = run({ employeeId: 'E2', name: 'B', payType: 'monthly', monthlySalary: 20000, paidLeavesPerMonth: 0 }, [
    { date: '2026-10-05', status: 'half_day', leaveType: 'auto' },
  ]);
  assert.strictEqual(r.unpaidLeaveDays, 0.5);
  assert.strictEqual(r.leaveDeduction, 500);
});

test('late penalties are deducted unless waived', () => {
  const r = run({ employeeId: 'E3', name: 'C', payType: 'monthly', monthlySalary: 20000, paidLeavesPerMonth: 1 }, [
    day('2026-10-01', 10, 18, { late: { isLate: true, minutesLate: 30, penaltyAmount: 100, waived: false } }),
    day('2026-10-02', 10, 18, { late: { isLate: true, minutesLate: 45, penaltyAmount: 100, waived: true } }),
    day('2026-10-03', 10, 18, { late: { isLate: true, minutesLate: 20, penaltyAmount: 100, waived: false } }),
  ]);
  assert.strictEqual(r.lateCount, 2);
  assert.strictEqual(r.latePenaltyTotal, 200);
  assert.strictEqual(r.waivedPenaltyCount, 1);
  assert.strictEqual(r.netSalary, 19800);
});

test('bonus and manual deduction are applied on top', () => {
  const r = run({ employeeId: 'E4', name: 'D', payType: 'monthly', monthlySalary: 10000, paidLeavesPerMonth: 1 }, [], [
    { type: 'bonus', amount: 500 },
    { type: 'deduction', amount: 200 },
  ]);
  assert.strictEqual(r.netSalary, 10300);
});

test('overtime is tracked per day but paid only when a multiplier is set', () => {
  const emp = { employeeId: 'E5', name: 'E', payType: 'monthly', monthlySalary: 20000, paidLeavesPerMonth: 1 };
  const recs = [day('2026-10-01', 9, 19), day('2026-10-02', 9, 17)]; // 10h + 8h => 2h OT
  const off = calculateEmployeeMonth({ employee: emp, records: recs, adjustments: [], workingDays: 20, settings: { standardDailyHours: 8 }, monthKey: '2026-10' });
  assert.strictEqual(off.overtimeHours, 2);
  assert.strictEqual(off.overtimePay, 0);
  assert.strictEqual(off.netSalary, 20000);
  // monthly: 20000 / (20 x 8) = 125 per hour; 2h x 125 x 1.5 = 375
  const on = calculateEmployeeMonth({ employee: emp, records: recs, adjustments: [], workingDays: 20, settings: { standardDailyHours: 8, overtimeMultiplier: 1.5 }, monthKey: '2026-10' });
  assert.strictEqual(on.overtimePay, 375);
  assert.strictEqual(on.grossPay, 20375);
  assert.strictEqual(on.basicSalary, 20000);
});

test('hourly staff get only the overtime premium on top of hours pay', () => {
  const emp = { employeeId: 'E6', name: 'F', payType: 'hourly', hourlyRate: 100, paidLeavesPerMonth: 0 };
  const r = calculateEmployeeMonth({ employee: emp, records: [day('2026-10-01', 9, 19)], adjustments: [], workingDays: 20, settings: { standardDailyHours: 8, overtimeMultiplier: 1.5 }, monthKey: '2026-10' });
  assert.strictEqual(r.hourlyPay, 1000);
  assert.strictEqual(r.overtimeHours, 2);
  assert.strictEqual(r.overtimePay, 100); // 2h x 100 x 0.5
  assert.strictEqual(r.grossPay, 1100);
  assert.strictEqual(r.basicSalary, 1000);
});
