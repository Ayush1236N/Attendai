// End-to-end test of the CSV import write path (apply / undo / rollback) against
// small in-memory stand-ins for the Mongoose models, so no database is needed.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// ---- tiny in-memory "Mongoose" ------------------------------------------------
let nextId = 1;
class Query { constructor(fn) { this.fn = fn; } select() { return this; } lean() { return this; } sort() { return this; } limit() { return this; }
  then(res, rej) { return Promise.resolve().then(this.fn).then(res, rej); } }
const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => (v && typeof v === 'object' && v.$in ? v.$in.includes(doc[k]) : String(doc[k]) === String(v)));
function makeModel(opts = {}) {
  const store = [];
  class Model {
    constructor(data) { Object.assign(this, JSON.parse(JSON.stringify(data || {}))); if (!this._id) this._id = String(nextId++); }
    async save() { if (opts.beforeSave) opts.beforeSave(this); if (!store.includes(this)) store.push(this); return this; }
    toObject() { return JSON.parse(JSON.stringify(this)); }
    async deleteOne() { store.splice(store.indexOf(this), 1); }
    static async create(data) { const d = new Model(data); await d.save(); return d; }
    static find(f = {}) { return new Query(() => store.filter((d) => matches(d, f)).map((d) => (Model._lean ? d.toObject() : d))); }
    static findOne(f) { return new Query(() => store.find((d) => matches(d, f)) || null); }
    static findById(id) { return new Query(() => store.find((d) => d._id === String(id)) || null); }
    static async countDocuments(f) { return store.filter((d) => matches(d, f)).length; }
    static async deleteOne(f) { const i = store.findIndex((d) => matches(d, f)); if (i >= 0) store.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
    static async updateOne(f, u) {
      const d = store.find((x) => matches(x, f)); if (!d) return;
      const at = (obj, p) => p.split('.').reduce((o, k, i, a) => (i === a.length - 1 ? [o, k] : o[k]), obj);
      Object.entries(u.$push || {}).forEach(([p, v]) => { const [o, k] = at(d, p); o[k].push(v); });
      Object.entries(u.$inc || {}).forEach(([p, v]) => { const [o, k] = at(d, p); o[k] = (o[k] || 0) + v; });
      Object.entries(u).filter(([k]) => !k.startsWith('$')).forEach(([k, v]) => { d[k] = v; });
    }
  }
  Model.store = store;
  return Model;
}
const lean = (M) => { const f = M.find; M.find = (q) => { M._lean = true; const r = f(q); return { select: () => ({ lean: () => r }), lean: () => r, sort: () => ({ limit: () => r, select: () => ({ sort: () => ({ limit: () => r }) }) }), then: (a, b) => r.then(a, b) }; }; return M; };

const Employee = makeModel(); const Attendance = makeModel({ beforeSave: (d) => { const i = d.checkIn?.timestamp; const o = d.checkOut?.timestamp; d.workedMinutes = i && o ? Math.round((new Date(o) - new Date(i)) / 60000) : 0; } });
const PayrollAdjustment = makeModel(); const AuditLog = makeModel();
const ImportBatch = makeModel({ beforeSave: (d) => { d.changes = d.changes || []; d.counts = d.counts || {}; } }); // schema defaults
const find0 = ImportBatch.find;
// Employee/Attendance/PayrollAdjustment `.find().lean()` used by plan(); ImportBatch.find().select().sort().limit() by history()
[Employee, Attendance, PayrollAdjustment].forEach((M) => { const orig = M.find; M.find = (f) => { const q = orig.call(M, f); const lq = new Query(() => store(M, f)); return lq; }; });
function store(M, f) { return M.store.filter((d) => matches(d, f || {})).map((d) => d.toObject()); }
ImportBatch.find = (f) => { const q = new Query(() => ImportBatch.store.filter((d) => matches(d, f || {}))); return q; };

const inject = (rel, exports) => { const p = require.resolve(path.join('../src', rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
inject('models/Employee', Employee); inject('models/Attendance', Attendance); inject('models/PayrollAdjustment', PayrollAdjustment);
inject('models/ImportBatch', ImportBatch); inject('models/AuditLog', AuditLog);
inject('services/settingsService', { getSettings: async () => ({ analystImportsEnabled: true, toObject() { return {}; } }) });
inject('services/attendanceService', {
  workModeFor: (e) => (e.employmentType === 'remote' ? 'remote' : 'office'),
  computeLate: ({ checkInTimestamp, workMode }) => ({ isLate: workMode === 'office' && new Date(checkInTimestamp).getUTCHours() >= 5, minutesLate: 20, penaltyAmount: 100, waived: false }),
});
inject('utils/date', { todayKey: () => '2026-10-09', weekdayOf: () => 1, parseLocal: (d, t) => new Date(`${d}T${t}:00+05:30`) });
const svc = require('../src/services/importService');

const actor = { id: 'admin1', name: 'Analyst', role: 'data_analyst' };
const seedEmployees = async () => {
  Employee.store.length = Attendance.store.length = PayrollAdjustment.store.length = ImportBatch.store.length = AuditLog.store.length = 0;
  await Employee.create({ employeeId: 'E1', name: 'Asha', department: 'Ops', employmentType: 'onsite', payType: 'monthly', monthlySalary: 20000, status: 'active' });
  await Employee.create({ employeeId: 'E2', name: 'Ravi', department: 'HR', employmentType: 'remote', payType: 'hourly', hourlyRate: 200, status: 'active' });
};
const emp = (id) => Employee.store.find((e) => e.employeeId === id);

test('apply updates + creates employees, requires APPLY for pay changes, audits, and can be undone', async () => {
  await seedEmployees();
  const csv = 'Employee ID,Name,Department,Monthly Salary\nE1,,Sales,"₹ 25,000"\nE3,Neo,Tech,30000\n';
  const p = await svc.plan({ target: 'employees', csv });
  assert.deepStrictEqual([p.summary.create, p.summary.update, p.summary.errors], [1, 1, 0]);

  await assert.rejects(svc.apply({ target: 'employees', csv, planHash: p.planHash }, actor), /Type APPLY/);
  assert.strictEqual(emp('E1').department, 'Ops');                     // nothing written yet

  const r = await svc.apply({ target: 'employees', csv, planHash: p.planHash, confirmText: 'APPLY', filename: 'x.csv' }, actor);
  assert.deepStrictEqual([r.counts.created, r.counts.updated], [1, 1]);
  assert.strictEqual(emp('E1').department, 'Sales');
  assert.strictEqual(emp('E1').monthlySalary, 25000);
  assert.strictEqual(emp('E1').name, 'Asha');                          // blank cell kept the name
  assert.ok(emp('E3'));
  assert.ok(AuditLog.store.some((a) => a.action === 'IMPORT_APPLIED'));

  const report = await svc.undo(r.batchId, actor);
  assert.deepStrictEqual([report.restored, report.deleted, report.skipped.length], [1, 1, 0]);
  assert.strictEqual(emp('E1').department, 'Ops');
  assert.strictEqual(emp('E1').monthlySalary, 20000);
  assert.strictEqual(emp('E3'), undefined);
  await assert.rejects(svc.undo(r.batchId, actor), /already undone/);
});

test('stale preview is refused, and other people cannot undo your import', async () => {
  await seedEmployees();
  const csv = 'employeeId,department\nE1,Sales\n';
  const p = await svc.plan({ target: 'employees', csv });
  emp('E1').department = 'Edited meanwhile';                           // data changed after the preview
  await assert.rejects(svc.apply({ target: 'employees', csv, planHash: p.planHash }, actor), /changed since you previewed/);

  const p2 = await svc.plan({ target: 'employees', csv });
  const r = await svc.apply({ target: 'employees', csv, planHash: p2.planHash }, actor);
  await assert.rejects(svc.undo(r.batchId, { id: 'someone-else', name: 'Other', role: 'data_analyst' }), /Only the person/);
  const ok = await svc.undo(r.batchId, { id: 'boss', name: 'Boss', role: 'super_admin' });
  assert.strictEqual(ok.restored, 1);
});

test('undo never overwrites a record edited after the import', async () => {
  await seedEmployees();
  const csv = 'employeeId,department\nE1,Sales\n';
  const r = await svc.apply({ target: 'employees', csv }, actor);
  emp('E1').department = 'Finance';                                    // someone edits it later
  const report = await svc.undo(r.batchId, actor);
  assert.strictEqual(report.skipped.length, 1);
  assert.strictEqual(emp('E1').department, 'Finance');
});

test('errors block the import unless "valid rows only"; failure mid-way rolls everything back', async () => {
  await seedEmployees();
  const csv = 'employeeId,name,department\nE1,,Sales\nE9,,Oops\nE2,,Tech\n';   // E9 is new without a name -> error
  await assert.rejects(svc.apply({ target: 'employees', csv }, actor), /have errors/);
  const r = await svc.apply({ target: 'employees', csv, skipInvalid: true }, actor);
  assert.deepStrictEqual([r.counts.updated, r.counts.skipped], [2, 1]);

  await seedEmployees();
  const boom = Employee.create; let calls = 0;
  Employee.create = async (d) => { if (d.employeeId === 'E5') throw new Error('disk full'); calls += 1; return boom.call(Employee, d); };
  const bad = 'employeeId,name,department\nE1,,Sales\nE4,New,X\nE5,Fail,Y\n';
  await assert.rejects(svc.apply({ target: 'employees', csv: bad }, actor), /rolled back/);
  Employee.create = boom;
  assert.strictEqual(emp('E1').department, 'Ops');                     // earlier update was restored
  assert.strictEqual(emp('E4'), undefined);                            // earlier create was removed
  assert.ok(calls >= 1);
});

test('attendance import builds times, flags lateness, and undo removes it', async () => {
  await seedEmployees();
  const csv = 'employeeId,date,checkIn,checkOut\nE1,2026-10-05,10:45,18:00\nE2,2026-10-05,,,\n';
  const p = await svc.plan({ target: 'attendance', csv });
  assert.strictEqual(p.summary.create, 1);
  assert.strictEqual(p.summary.errors, 1);                              // E2 row has neither times nor a status
  const r = await svc.apply({ target: 'attendance', csv, skipInvalid: true, confirmText: 'APPLY' }, actor);
  const rec = Attendance.store[0];
  assert.strictEqual(rec.status, 'checked_out');
  assert.strictEqual(rec.workMode, 'office');
  assert.strictEqual(rec.late.isLate, true);
  assert.strictEqual(rec.workedMinutes, 435);                           // 10:45 -> 18:00
  const report = await svc.undo(r.batchId, actor);
  assert.strictEqual(report.deleted, 1);
  assert.strictEqual(Attendance.store.length, 0);
});

test('attendance import updates an existing record and undo restores the old times', async () => {
  await seedEmployees();
  await new Attendance({ employeeId: 'E2', date: '2026-10-05', status: 'present', workMode: 'remote', leaveType: 'auto',
    checkIn: { timestamp: '2026-10-05T04:00:00.000Z' } }).save();     // forgot to check out
  const csv = 'employeeId,date,checkOut\nE2,2026-10-05,18:00\n';
  const r = await svc.apply({ target: 'attendance', csv, confirmText: 'APPLY' }, actor);
  const rec = Attendance.store[0];
  assert.strictEqual(rec.status, 'checked_out');
  assert.ok(rec.workedMinutes > 0);
  await svc.undo(r.batchId, actor);
  assert.strictEqual(rec.status, 'present');
  assert.strictEqual(rec.checkOut, undefined);
});

test('bonuses: added once, a re-upload is a no-op, and undo deletes them', async () => {
  await seedEmployees();
  const csv = 'employeeId,month,type,amount,reason\nE1,2026-10,bonus,500,Diwali\n';
  const r = await svc.apply({ target: 'adjustments', csv, confirmText: 'APPLY' }, actor);
  assert.strictEqual(PayrollAdjustment.store.length, 1);
  assert.match(PayrollAdjustment.store[0].addedByName, /CSV import/);
  await assert.rejects(svc.apply({ target: 'adjustments', csv, confirmText: 'APPLY' }, actor), /nothing to change/);
  assert.strictEqual(PayrollAdjustment.store.length, 1);
  await svc.undo(r.batchId, actor);
  assert.strictEqual(PayrollAdjustment.store.length, 0);
});

test('bad uploads are rejected cleanly', async () => {
  await seedEmployees();
  await assert.rejects(svc.plan({ target: 'employees', csv: '' }), /No CSV/);
  await assert.rejects(svc.plan({ target: 'nope', csv: 'a\n1' }), /Unknown import target/);
  await assert.rejects(svc.plan({ target: 'employees', csv: 'employeeId,department\n' }), /no data rows/);
  await assert.rejects(svc.plan({ target: 'employees', csv: 'name,department\nA,B\n' }), /missing required column/);
});
