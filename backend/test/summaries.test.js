const test = require('node:test');
const assert = require('node:assert');
const { summarizeDaily, summarizeEmployees } = require('../src/services/biService');

const row = (o) => ({ date: '2026-10-05', weekday: 'Mon', employeeId: 'E1', name: 'A', department: 'Ops', employmentType: 'onsite',
  workMode: 'office', status: 'checked_out', checkIn: '2026-10-05T04:00:00.000Z', workedHours: 8, overtimeHours: 0, missingCheckout: false,
  isLate: false, minutesLate: 0, penaltyAmount: 0, penaltyWaived: false, penaltyCharged: 0, ...o });

test('daily summary counts present, late, remote, hours and penalties', () => {
  const d = summarizeDaily([
    row({}),
    row({ employeeId: 'E2', isLate: true, minutesLate: 30, penaltyAmount: 100, penaltyCharged: 100, workedHours: 6 }),
    row({ employeeId: 'E3', workMode: 'remote', workedHours: 9, overtimeHours: 1 }),
    row({ employeeId: 'E4', checkIn: '', status: 'absent', workedHours: 0 }),
  ]);
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].employeesPresent, 3);
  assert.strictEqual(d[0].remote, 1);
  assert.strictEqual(d[0].late, 1);
  assert.strictEqual(d[0].latePct, 33.33);
  assert.strictEqual(d[0].absent, 1);
  assert.strictEqual(d[0].totalHours, 23);
  assert.strictEqual(d[0].avgHours, 7.67);
  assert.strictEqual(d[0].overtimeHours, 1);
  assert.strictEqual(d[0].penaltyCharged, 100);
});

test('employee scorecard aggregates per employee', () => {
  const s = summarizeEmployees([
    row({ date: '2026-10-05' }),
    row({ date: '2026-10-06', isLate: true, minutesLate: 20, penaltyAmount: 100, penaltyWaived: true }),
    row({ date: '2026-10-07', status: 'leave', checkIn: '', workedHours: 0 }),
  ]);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].daysPresent, 2);
  assert.strictEqual(s[0].daysOnLeave, 1);
  assert.strictEqual(s[0].lateCount, 1);
  assert.strictEqual(s[0].latePct, 50);
  assert.strictEqual(s[0].penaltyWaived, 100);
  assert.strictEqual(s[0].penaltyCharged, 0);
  assert.strictEqual(s[0].totalHours, 16);
});
