const test = require('node:test');
const assert = require('node:assert');
const { DATASETS } = require('../src/services/biService');

test('analyst sheet has exactly the notebook columns and reconciles', async () => {
  // Stub payroll rows through the module's dependency by calling the mapper with a fake payrollMonthly via require cache.
  const svc = require('../src/services/payrollService');
  svc.buildSalaryReport = async () => [{
    month: '2026-10', employeeId: 'E1', name: 'Asha', department: 'Ops', employmentType: 'onsite', payType: 'monthly',
    monthlySalary: 20000, hourlyRate: 0, workingDays: 22, presentDays: 18, halfDays: 2, paidLeaveDays: 1, unpaidLeaveDays: 1,
    absentDays: 1, leaveTotalDays: 2, totalWorkedHours: 150, overtimeHours: 4, overtimePay: 500, basicSalary: 20000,
    expectedHours: 176, missingCheckouts: 0, hourlyPay: 0, paidLeavePay: 0, grossPay: 20500, leaveDeduction: 900,
    lateCount: 2, latePenaltyTotal: 200, waivedPenaltyCount: 0, waivedPenaltyTotal: 0, bonusTotal: 1000, manualDeductionTotal: 100,
    netSalary: 20300,
  }];
  const [row] = await DATASETS.payroll_sheet({ from: '2026-10', to: '2026-10' });
  assert.deepStrictEqual(Object.keys(row), ['Employee ID', 'Employee Name', 'Department', 'Month', 'Working Days', 'Present Days',
    'Absent Days', 'Leave Days', 'Overtime Hours', 'Basic Salary', 'Overtime Pay', 'Gross Salary', 'Total Deduction', 'Net Salary']);
  assert.strictEqual(row['Present Days'], 19);            // 18 + 2 half days x 0.5
  assert.strictEqual(row['Gross Salary'], 21500);         // 20000 + 500 + 1000 bonus
  assert.strictEqual(row['Total Deduction'], 1200);       // 900 + 200 + 100
  assert.strictEqual(row['Net Salary'], 20300);           // gross - deduction == payroll net
  assert.strictEqual(row['Net Salary'], 20300);
});
