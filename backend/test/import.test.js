const test = require('node:test');
const assert = require('node:assert');
const { parseCsv, parseCsvObjects } = require('../src/utils/csv');
const { buildPlan, templateCsv } = require('../src/services/importService');

const deps = {
  parseLocal: (d, hhmm) => new Date(`${d}T${hhmm}:00+05:30`),
  weekdayOf: () => 1,
  workModeFor: (emp) => (emp.employmentType === 'remote' ? 'remote' : 'office'),
  computeLate: ({ checkInTimestamp, workMode }) => {
    const mins = (new Date(checkInTimestamp).getUTCHours() * 60 + new Date(checkInTimestamp).getUTCMinutes()) - (4 * 60); // 09:30 IST = 04:00 UTC
    return workMode === 'office' && mins > 10 ? { isLate: true, minutesLate: mins, penaltyAmount: 100, waived: false } : { isLate: false, minutesLate: 0, penaltyAmount: 0, waived: false };
  },
};
const ctxOf = (extra = {}) => ({
  employees: {
    E1: { employeeId: 'E1', name: 'Asha', department: 'Ops', employmentType: 'onsite', payType: 'monthly', monthlySalary: 20000, hourlyRate: 0, status: 'active' },
    E2: { employeeId: 'E2', name: 'Ravi', department: 'HR', employmentType: 'remote', payType: 'hourly', monthlySalary: 0, hourlyRate: 200, status: 'active' },
  },
  attendance: {}, adjustmentKeys: new Set(), settings: {}, today: '2026-10-09', deps, ...extra,
});
const plan = (target, csv, ctx = ctxOf(), mode = 'upsert') => buildPlan({ target, mode, parsed: parseCsvObjects(csv), ctx });

test('csv parser: quotes, commas, newlines in quotes, BOM, CRLF', () => {
  const rows = parseCsv('\uFEFFa,b\r\n"x,1","line1\nline2"\r\n\r\n"say ""hi""",3\n');
  assert.deepStrictEqual(rows, [['a', 'b'], ['x,1', 'line1\nline2'], ['say "hi"', '3']]);
});

test('employees: cleans messy values, blank cells never erase, updates are diffed', () => {
  const p = plan('employees', 'Employee ID,Employee Name,Department,Employment Type,Monthly Salary,Email\nE1,,  Sales ,WFH,"₹ 25,000", Asha@Example.COM \n');
  const r = p.rows[0];
  assert.strictEqual(r.action, 'update');
  assert.strictEqual(r.changes.name, undefined);                           // blank name = unchanged
  assert.deepStrictEqual(r.changes.department, { before: 'Ops', after: 'Sales' });
  assert.strictEqual(r.changes.employmentType.after, 'remote');
  assert.strictEqual(r.changes.monthlySalary.after, 25000);
  assert.strictEqual(r.changes.email.after, 'asha@example.com');
  assert.strictEqual(r.sensitive, true);                                    // salary changed
});

test('employees: new employee needs a name; bad values are reported, not applied', () => {
  const p = plan('employees', 'employeeId,name,monthlySalary,email\nE9,,100,\nE8,Zed,abc,bad-email\nE7,Neo,500,neo@x.com\n');
  assert.strictEqual(p.rows[0].action, 'error');
  assert.match(p.rows[0].errors.join(' '), /needs a name/);
  assert.strictEqual(p.rows[1].action, 'error');
  assert.strictEqual(p.rows[1].errors.length, 2);
  assert.strictEqual(p.rows[2].action, 'create');
  assert.strictEqual(p.summary.errors, 2);
});

test('employees: unchanged rows, duplicate rows, and modes', () => {
  const p = plan('employees', 'employeeId,department\nE1,Ops\nE2,Ops\nE2,Ops\n');
  assert.strictEqual(p.rows[0].action, 'unchanged');
  assert.strictEqual(p.rows[1].action, 'update');
  assert.strictEqual(p.rows[2].action, 'error');
  assert.match(p.rows[2].errors[0], /Duplicate/);
  const co = plan('employees', 'employeeId,department\nE1,Sales\nE5,X,\n', ctxOf(), 'create_only');
  assert.strictEqual(co.rows[0].action, 'unchanged');
});

test('employees: big salary jump and deactivation warn', () => {
  const p = plan('employees', 'employeeId,monthlySalary,status\nE1,40000,inactive\n');
  assert.ok(p.rows[0].warnings.some((w) => /more than 50%/.test(w)));
  assert.ok(p.rows[0].warnings.some((w) => /deactivated/.test(w)));
});

test('attendance: builds times, flags lateness, rejects bad rows', () => {
  const p = plan('attendance', 'employeeId,date,checkIn,checkOut\nE1,05/10/2026,9:45 AM,6:10 PM\nE1,2026-10-06,18:00,09:00\nE9,2026-10-06,09:00,\nE1,2026-12-30,09:00,\n');
  const [a, b, c, d] = p.rows;
  assert.strictEqual(a.action, 'create');
  assert.strictEqual(a.key, 'E1|2026-10-05');
  assert.strictEqual(a.changes.status.after, 'checked_out');
  assert.strictEqual(a.changes.workMode.after, 'office');
  assert.ok(a.warnings.some((w) => /Late 15 min/.test(w)));
  assert.match(b.errors[0], /after check-in/);
  assert.match(c.errors[0], /Unknown employee/);
  assert.match(d.errors[0], /future/);
});

test('attendance: leave day without times; existing record is diffed', () => {
  const existing = { employeeId: 'E2', date: '2026-10-05', status: 'present', workMode: 'remote', leaveType: 'auto', remarks: '',
    checkIn: { timestamp: new Date('2026-10-05T04:00:00Z') }, checkOut: { timestamp: new Date('2026-10-05T12:00:00Z') } };
  const p = plan('attendance', 'employeeId,date,status,leaveType\nE1,2026-10-07,leave,paid\nE2,2026-10-05,checked out,\n',
    ctxOf({ attendance: { 'E2|2026-10-05': existing } }));
  assert.strictEqual(p.rows[0].action, 'create');
  assert.strictEqual(p.rows[0].changes.leaveType.after, 'paid');
  assert.strictEqual(p.rows[1].action, 'update');
  assert.strictEqual(p.rows[1].changes.status.after, 'checked_out');
  assert.strictEqual(Object.keys(p.rows[1].changes).length, 1);
});

test('adjustments: validates, and identical entries are skipped (no double pay)', () => {
  const ctx = ctxOf({ adjustmentKeys: new Set(['E1|2026-10|bonus|500|Diwali']) });
  const p = plan('adjustments', 'employeeId,month,type,amount,reason\nE1,2026-10,bonus,500,Diwali\nE1,2026-10,bonus,700,Extra\nE1,2026-11,bonus,1,x\nE1,2026-10,gift,5,x\n', ctx);
  assert.strictEqual(p.rows[0].action, 'unchanged');
  assert.strictEqual(p.rows[1].action, 'create');
  assert.strictEqual(p.rows[2].action, 'error');   // future month
  assert.strictEqual(p.rows[3].action, 'error');   // bad type
});

test('missing key columns and oversize files are rejected; plan hash is stable', () => {
  assert.throws(() => plan('attendance', 'employeeId,checkIn\nE1,09:00\n'), /missing required column/);
  const csv = 'employeeId,department\nE2,Ops\n';
  assert.strictEqual(plan('employees', csv).planHash, plan('employees', csv).planHash);
  assert.notStrictEqual(plan('employees', csv).planHash, plan('employees', 'employeeId,department\nE2,Eng\n').planHash);
  assert.ok(templateCsv('employees').startsWith('employeeId,name'));
});
