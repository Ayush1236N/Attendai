const crypto = require('crypto');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const PayrollAdjustment = require('../models/PayrollAdjustment');
const ImportBatch = require('../models/ImportBatch');
const AuditLog = require('../models/AuditLog');
const settingsService = require('./settingsService');
const attendanceService = require('./attendanceService');
const { parseCsvObjects } = require('../utils/csv');
const dateUtil = require('../utils/date');

// CSV clean-up imports for the data analyst.
//
//   1. preview  -> parse + clean + validate + diff against live data. NOTHING is written.
//   2. apply    -> re-plans from the same CSV (never trusts the browser), refuses if the
//                  plan changed since the preview, writes, and stores a BEFORE image of
//                  every touched record in an ImportBatch.
//   3. undo     -> restores the batch (skips any record someone edited afterwards).
//
// Cleaning rules: headers are matched loosely ("Employee ID", employee_id, id…); a BLANK
// cell means "leave unchanged" (it never erases data); money has ₹ , and spaces stripped;
// enums accept friendly spellings (On-site, WFH, half day…); dates accept YYYY-MM-DD or
// DD/MM/YYYY (day first); emails are lower-cased; unknown columns are ignored and listed.

const MAX_ROWS = 3000;
const SENSITIVE_EMPLOYEE_FIELDS = ['payType', 'hourlyRate', 'monthlySalary', 'paidLeavesPerMonth', 'status'];

class ImportError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- normalizers
// Each returns { value } or { error }.
const ok = (value) => ({ value });
const bad = (error) => ({ error });
const text = (v) => ok(String(v).trim());
const email = (v) => {
  const e = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? ok(e) : bad(`"${v}" is not a valid email`);
};
const number = (min, max) => (v) => {
  const cleaned = String(v).replace(/(₹|rs\.?|inr)/gi, '').replace(/[,\s]/g, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return bad(`"${v}" is not a number`);
  const n = Number(cleaned);
  if (n < min || n > max) return bad(`${n} is outside the allowed range ${min}–${max}`);
  return ok(Math.round(n * 100) / 100);
};
const enumOf = (label, map) => (v) => {
  const key = String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  return map[key] !== undefined ? ok(map[key]) : bad(`"${v}" is not a valid ${label} (use ${[...new Set(Object.values(map))].join(' / ')})`);
};
const employmentType = enumOf('employment type', { onsite: 'onsite', office: 'onsite', wfo: 'onsite', hybrid: 'hybrid', remote: 'remote', wfh: 'remote', workfromhome: 'remote' });
const payType = enumOf('pay type', { monthly: 'monthly', salary: 'monthly', salaried: 'monthly', hourly: 'hourly', perhour: 'hourly' });
const empStatus = enumOf('status', { active: 'active', enabled: 'active', inactive: 'inactive', disabled: 'inactive' });
const attStatus = enumOf('status', { present: 'present', checkedout: 'checked_out', absent: 'absent', leave: 'leave', halfday: 'half_day' });
const workMode = enumOf('work mode', { office: 'office', onsite: 'office', remote: 'remote', wfh: 'remote' });
const leaveType = enumOf('leave type', { auto: 'auto', paid: 'paid', unpaid: 'unpaid' });
const adjType = enumOf('type', { bonus: 'bonus', deduction: 'deduction', penalty: 'deduction' });

function date(v) {
  const s = String(v).trim().slice(0, 10);
  let y; let m; let d;
  let mt = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (mt) [, y, m, d] = mt; else {
    mt = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(String(v).trim());
    if (mt) [, d, m, y] = mt; // day first (DD/MM/YYYY)
  }
  if (!y) return bad(`"${v}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`);
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return bad(`"${v}" is not a real date`);
  return ok(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
}
function month(v) {
  const s = String(v).trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return ok(s);
  const dt = date(s);
  return dt.error ? bad(`"${v}" is not a month (use YYYY-MM)`) : ok(dt.value.slice(0, 7));
}
// Time of day, or a full ISO timestamp. -> { hhmm } | { iso }
function timeOrIso(v) {
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? bad(`"${v}" is not a valid timestamp`) : ok({ iso: d.toISOString() }); }
  const mt = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s);
  if (!mt) return bad(`"${v}" is not a time (use 09:30 or 9:30 AM)`);
  let h = Number(mt[1]); const min = Number(mt[2]);
  if (mt[3]) { if (h < 1 || h > 12) return bad(`"${v}" is not a valid time`); h = (h % 12) + (mt[3].toLowerCase() === 'pm' ? 12 : 0); }
  if (h > 23 || min > 59) return bad(`"${v}" is not a valid time`);
  return ok({ hhmm: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
}
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function weekdays(v) {
  const parts = String(v).split(/[,;/|\s]+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const n = /^[0-6]$/.test(p) ? Number(p) : DAY_INDEX[p.toLowerCase().slice(0, 3)];
    if (n === undefined) return bad(`"${p}" is not a weekday (use Mon,Tue,Wed…)`);
    if (!out.includes(n)) out.push(n);
  }
  return out.length ? ok(out.sort()) : bad('no weekdays given');
}

// ---------------------------------------------------------------- targets
const TARGETS = {
  employees: {
    label: 'Employees',
    keys: ['employeeId'],
    fields: {
      employeeId: { aliases: ['employeeid', 'id', 'empid', 'employeecode'], parse: text, required: true },
      name: { aliases: ['name', 'employeename', 'fullname'], parse: text },
      email: { aliases: ['email', 'emailaddress'], parse: email },
      phone: { aliases: ['phone', 'mobile', 'phonenumber'], parse: text },
      department: { aliases: ['department', 'dept'], parse: text },
      designation: { aliases: ['designation', 'jobtitle', 'role'], parse: text },
      joiningDate: { aliases: ['joiningdate', 'dateofjoining', 'doj'], parse: date },
      employmentType: { aliases: ['employmenttype', 'worktype', 'type'], parse: employmentType },
      hybridOfficeDays: { aliases: ['hybridofficedays', 'officedays'], parse: weekdays },
      payType: { aliases: ['paytype'], parse: payType },
      hourlyRate: { aliases: ['hourlyrate', 'ratehour', 'rateperhour'], parse: number(0, 100000) },
      monthlySalary: { aliases: ['monthlysalary', 'salary'], parse: number(0, 10000000) },
      paidLeavesPerMonth: { aliases: ['paidleavespermonth', 'paidleaves'], parse: number(0, 31) },
      status: { aliases: ['status'], parse: empStatus },
    },
  },
  attendance: {
    label: 'Attendance',
    keys: ['employeeId', 'date'],
    fields: {
      employeeId: { aliases: ['employeeid', 'id', 'empid'], parse: text, required: true },
      date: { aliases: ['date', 'day'], parse: date, required: true },
      checkIn: { aliases: ['checkin', 'intime', 'in'], parse: timeOrIso },
      checkOut: { aliases: ['checkout', 'outtime', 'out'], parse: timeOrIso },
      status: { aliases: ['status'], parse: attStatus },
      workMode: { aliases: ['workmode', 'where'], parse: workMode },
      leaveType: { aliases: ['leavetype'], parse: leaveType },
      remarks: { aliases: ['remarks', 'note', 'notes'], parse: text },
    },
  },
  adjustments: {
    label: 'Bonuses & deductions',
    keys: ['employeeId', 'month', 'type', 'amount', 'reason'],
    fields: {
      employeeId: { aliases: ['employeeid', 'id', 'empid'], parse: text, required: true },
      month: { aliases: ['month', 'payrollmonth', 'date'], parse: month, required: true },
      type: { aliases: ['type', 'kind'], parse: adjType, required: true },
      amount: { aliases: ['amount', 'value'], parse: number(0.01, 1000000), required: true },
      reason: { aliases: ['reason', 'note', 'description'], parse: text, required: true },
    },
  },
};

function templateCsv(target) {
  const t = TARGETS[target];
  if (!t) throw new ImportError('Unknown import target', 404);
  const examples = {
    employees: ['employeeId,name,email,phone,department,designation,employmentType,hybridOfficeDays,payType,hourlyRate,monthlySalary,paidLeavesPerMonth,status', 'EMP001,Asha Rao,asha@example.com,9876543210,Operations,Executive,hybrid,"Mon,Tue,Wed",monthly,,32000,1,active'],
    attendance: ['employeeId,date,checkIn,checkOut,status,workMode,leaveType,remarks', 'EMP001,2026-10-05,09:25,18:10,checked_out,office,,', 'EMP002,2026-10-05,,,leave,,paid,Fever'],
    adjustments: ['employeeId,month,type,amount,reason', 'EMP001,2026-10,bonus,1500,Festival bonus'],
  };
  return examples[target].join('\n');
}

// ---------------------------------------------------------------- planning (pure)
function mapHeaders(headers, target) {
  const t = TARGETS[target];
  const byAlias = {};
  Object.entries(t.fields).forEach(([field, def]) => def.aliases.forEach((a) => { byAlias[a] = field; }));
  const mapping = {}; const ignored = [];
  headers.forEach((h) => {
    const f = byAlias[norm(h)];
    if (f && !Object.values(mapping).includes(f)) mapping[h] = f; else ignored.push(h);
  });
  return { mapping, ignored };
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/**
 * Pure planner. `ctx` carries everything read from the database so this can be unit-tested:
 *   ctx.employees      { [employeeId]: plain employee }
 *   ctx.attendance     { 'employeeId|date': plain attendance record }
 *   ctx.adjustmentKeys Set of 'employeeId|month|type|amount|reason'
 *   ctx.settings, ctx.today ('YYYY-MM-DD')
 *   ctx.deps           { parseLocal, workModeFor, weekdayOf, computeLate }
 */
function buildPlan({ target, mode, parsed, ctx }) {
  const t = TARGETS[target];
  const { mapping, ignored } = mapHeaders(parsed.headers, target);
  const mappedFields = Object.values(mapping);
  const missingKeys = t.keys.filter((k) => !mappedFields.includes(k));
  if (missingKeys.length) {
    throw new ImportError(`Your file is missing required column(s): ${missingKeys.join(', ')}. Download the template to see the expected headers.`);
  }
  if (parsed.records.length === 0) throw new ImportError('The file has a header but no data rows.');
  if (parsed.records.length > MAX_ROWS) throw new ImportError(`Too many rows (${parsed.records.length}). Import at most ${MAX_ROWS} rows at a time.`);

  const seen = new Map();
  const rows = parsed.records.map((rec, idx) => {
    const line = parsed.lines[idx];
    const errors = []; const warnings = []; const data = {}; const failed = new Set();
    // parse every mapped, non-blank cell
    Object.entries(mapping).forEach(([header, field]) => {
      const raw = rec[header];
      if (raw === undefined || String(raw).trim() === '') return;      // blank = no change
      const r = t.fields[field].parse(raw);
      if (r.error) { errors.push(`${header}: ${r.error}`); failed.add(field); } else data[field] = r.value;
    });
    t.keys.forEach((k) => { if (data[k] === undefined && !failed.has(k)) errors.push(`${k} is required`); });

    const row = { line, key: '', action: 'error', changes: {}, errors, warnings, sensitive: false, data };
    if (errors.length) return row;

    if (target === 'employees') planEmployee(row, ctx, mode);
    else if (target === 'attendance') planAttendance(row, ctx, mode);
    else planAdjustment(row, ctx, mode);

    if (row.action !== 'error') {
      const dupKey = `${row.key}`;
      if (seen.has(dupKey)) { row.action = 'error'; row.errors.push(`Duplicate of line ${seen.get(dupKey)} in this file`); row.changes = {}; } else seen.set(dupKey, line);
    }
    return row;
  });

  const count = (a) => rows.filter((r) => r.action === a).length;
  const summary = {
    total: rows.length, create: count('create'), update: count('update'), unchanged: count('unchanged'), errors: count('error'),
    sensitive: rows.filter((r) => r.sensitive && (r.action === 'create' || r.action === 'update')).length,
    warnings: rows.reduce((a, r) => a + r.warnings.length, 0),
  };
  const planHash = crypto.createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.key, r.action, r.changes]))).digest('hex').slice(0, 24);
  return { target, mode, headers: parsed.headers, mapping, ignored, rows, summary, planHash };
}

function modeBlocks(row, existing, mode) {
  if (mode === 'create_only' && existing) { row.action = 'unchanged'; row.warnings.push('Already exists — skipped (mode: add new only)'); return true; }
  if (mode === 'update_only' && !existing) { row.action = 'unchanged'; row.warnings.push('Not found — skipped (mode: update existing only)'); return true; }
  return false;
}

function planEmployee(row, ctx, mode) {
  const { data } = row;
  const id = data.employeeId; row.key = id;
  const existing = ctx.employees[id];
  if (modeBlocks(row, existing, mode)) return;
  const fields = Object.keys(data).filter((f) => f !== 'employeeId');

  if (!existing) {
    if (!data.name) { row.action = 'error'; row.errors.push('A new employee needs a name'); return; }
    row.action = 'create';
    fields.forEach((f) => { row.changes[f] = { before: null, after: data[f] }; });
    row.sensitive = fields.some((f) => SENSITIVE_EMPLOYEE_FIELDS.includes(f));
    row.warnings.push('New employee (no portal password and no face registered yet)');
  } else {
    fields.forEach((f) => {
      let before = existing[f];
      if (f === 'joiningDate') before = existing.joiningDate ? new Date(existing.joiningDate).toISOString().slice(0, 10) : null;
      if (!same(before === undefined ? null : before, data[f])) row.changes[f] = { before: before === undefined ? null : before, after: data[f] };
    });
    row.action = Object.keys(row.changes).length ? 'update' : 'unchanged';
    row.sensitive = Object.keys(row.changes).some((f) => SENSITIVE_EMPLOYEE_FIELDS.includes(f));
    ['monthlySalary', 'hourlyRate'].forEach((f) => {
      const c = row.changes[f];
      if (c && c.before > 0 && Math.abs(c.after - c.before) / c.before > 0.5) row.warnings.push(`${f} changes by more than 50% (${c.before} → ${c.after})`);
    });
    if (row.changes.status && row.changes.status.after === 'inactive') row.warnings.push('Employee will be deactivated (cannot check in or log in)');
  }
  const finalType = data.payType || (existing && existing.payType) || 'monthly';
  if (finalType === 'hourly' && !(data.hourlyRate || (existing && existing.hourlyRate))) row.warnings.push('Hourly employee with no hourly rate — their pay will be ₹0');
}

function planAttendance(row, ctx, mode) {
  const { data } = row; const d = ctx.deps;
  const emp = ctx.employees[data.employeeId];
  row.key = `${data.employeeId}|${data.date}`;
  if (!emp) { row.action = 'error'; row.errors.push(`Unknown employee "${data.employeeId}" — add them in the Employees import first`); return; }
  if (data.date > ctx.today) { row.action = 'error'; row.errors.push('Date is in the future'); return; }
  const existing = ctx.attendance[row.key];
  if (modeBlocks(row, existing, mode)) return;

  const toDate = (v) => (v.iso ? v.iso : d.parseLocal(data.date, v.hhmm).toISOString());
  const after = {};
  if (data.checkIn) after.checkIn = toDate(data.checkIn);
  if (data.checkOut) after.checkOut = toDate(data.checkOut);
  ['status', 'workMode', 'leaveType', 'remarks'].forEach((f) => { if (data[f] !== undefined) after[f] = data[f]; });

  const cur = existing ? {
    checkIn: existing.checkIn?.timestamp ? new Date(existing.checkIn.timestamp).toISOString() : null,
    checkOut: existing.checkOut?.timestamp ? new Date(existing.checkOut.timestamp).toISOString() : null,
    status: existing.status, workMode: existing.workMode || 'office', leaveType: existing.leaveType || 'auto', remarks: existing.remarks || '',
  } : { checkIn: null, checkOut: null, status: null, workMode: null, leaveType: null, remarks: '' };

  const finalIn = after.checkIn || cur.checkIn; const finalOut = after.checkOut || cur.checkOut;
  if (finalOut && !finalIn) { row.action = 'error'; row.errors.push('Check-out without a check-in'); return; }
  if (finalIn && finalOut && new Date(finalOut) <= new Date(finalIn)) { row.action = 'error'; row.errors.push('Check-out must be after check-in'); return; }
  if (finalIn && finalOut && (new Date(finalOut) - new Date(finalIn)) > 16 * 3600000) row.warnings.push('More than 16 hours between check-in and check-out — please verify');

  // sensible default status / work mode when the file doesn't say
  if (after.status === undefined) {
    if (finalOut) after.status = 'checked_out';
    else if (finalIn && (!cur.status || ['absent', 'leave', 'half_day'].includes(cur.status))) after.status = 'present';
    else if (!existing) { row.action = 'error'; row.errors.push('Give a check-in time or a status (leave / absent / half_day)'); return; }
  }
  if (!existing && after.workMode === undefined) after.workMode = d.workModeFor(emp, d.weekdayOf(data.date));

  row.changes = {};
  Object.entries(after).forEach(([f, v]) => { if (!same(cur[f], v)) row.changes[f] = { before: cur[f], after: v }; });
  row.action = existing ? (Object.keys(row.changes).length ? 'update' : 'unchanged') : 'create';
  row.sensitive = row.action !== 'unchanged';

  const effIn = after.checkIn !== undefined ? after.checkIn : cur.checkIn;
  const wm = after.workMode || cur.workMode || d.workModeFor(emp, d.weekdayOf(data.date));
  if (effIn && row.action !== 'unchanged') {
    const late = d.computeLate({ checkInTimestamp: new Date(effIn), workMode: wm, settings: ctx.settings, previous: existing?.late });
    if (late.isLate) row.warnings.push(late.waived ? `Late ${late.minutesLate} min (penalty already waived)` : `Late ${late.minutesLate} min → penalty ₹${late.penaltyAmount}`);
  }
  if (existing && ['leave', 'absent', 'half_day'].includes(after.status) && cur.checkIn && !after.checkIn) row.warnings.push('Status changed to leave/absent but the day still has a check-in time');
}

function planAdjustment(row, ctx, mode) {
  const { data } = row;
  row.key = `${data.employeeId}|${data.month}|${data.type}|${data.amount}|${data.reason}`;
  if (!ctx.employees[data.employeeId]) { row.action = 'error'; row.errors.push(`Unknown employee "${data.employeeId}"`); return; }
  if (data.month > ctx.today.slice(0, 7)) { row.action = 'error'; row.errors.push('Month is in the future'); return; }
  if (ctx.adjustmentKeys.has(row.key)) { row.action = 'unchanged'; row.warnings.push('Identical entry already exists — skipped (prevents double-paying)'); return; }
  if (mode === 'update_only') { row.action = 'unchanged'; row.warnings.push('Adjustments can only be added — skipped'); return; }
  row.action = 'create'; row.sensitive = true;
  row.changes = { type: { before: null, after: data.type }, amount: { before: null, after: data.amount }, month: { before: null, after: data.month }, reason: { before: null, after: data.reason } };
}

// ---------------------------------------------------------------- DB glue
const EMP_FIELDS = 'employeeId name email phone department designation joiningDate employmentType hybridOfficeDays payType hourlyRate monthlySalary paidLeavesPerMonth status';

async function plan({ target, mode = 'upsert', csv }) {
  if (!TARGETS[target]) throw new ImportError('Unknown import target', 404);
  if (!['upsert', 'create_only', 'update_only'].includes(mode)) throw new ImportError('Unknown mode');
  if (typeof csv !== 'string' || !csv.trim()) throw new ImportError('No CSV was received. Choose a .csv file.');
  const parsed = parseCsvObjects(csv);
  if (!parsed.headers.length) throw new ImportError('The file is empty.');

  const [settings, emps] = await Promise.all([settingsService.getSettings(), Employee.find({}).select(EMP_FIELDS).lean()]);
  const employees = {}; emps.forEach((e) => { employees[e.employeeId] = e; });
  const ctx = {
    employees, attendance: {}, adjustmentKeys: new Set(), settings: settings.toObject ? settings.toObject() : settings, today: dateUtil.todayKey(),
    deps: { parseLocal: dateUtil.parseLocal, workModeFor: attendanceService.workModeFor, weekdayOf: dateUtil.weekdayOf, computeLate: attendanceService.computeLate },
  };

  const { mapping } = mapHeaders(parsed.headers, target);
  const col = (field) => Object.keys(mapping).find((h) => mapping[h] === field);
  if (target === 'attendance' && col('employeeId') && col('date')) {
    const ids = [...new Set(parsed.records.map((r) => r[col('employeeId')]).filter(Boolean))];
    const dates = [...new Set(parsed.records.map((r) => (date(r[col('date')]).value)).filter(Boolean))];
    const recs = await Attendance.find({ employeeId: { $in: ids }, date: { $in: dates } }).lean();
    recs.forEach((r) => { ctx.attendance[`${r.employeeId}|${r.date}`] = r; });
  }
  if (target === 'adjustments' && col('month')) {
    const months = [...new Set(parsed.records.map((r) => month(r[col('month')]).value).filter(Boolean))];
    const adj = await PayrollAdjustment.find({ month: { $in: months } }).lean();
    adj.forEach((a) => ctx.adjustmentKeys.add(`${a.employeeId}|${a.month}|${a.type}|${a.amount}|${a.reason || ''}`));
  }
  return buildPlan({ target, mode, parsed, ctx });
}

// Canonical snapshot of the fields an import touches, for before/after comparison.
function snapEmployee(doc, fields) {
  const o = {};
  fields.forEach((f) => { o[f] = f === 'joiningDate' ? (doc.joiningDate ? new Date(doc.joiningDate).toISOString().slice(0, 10) : null) : (doc[f] === undefined ? null : doc[f]); });
  return o;
}
function snapAttendance(doc) {
  return {
    checkIn: doc.checkIn?.timestamp ? new Date(doc.checkIn.timestamp).toISOString() : null,
    checkOut: doc.checkOut?.timestamp ? new Date(doc.checkOut.timestamp).toISOString() : null,
    status: doc.status, workMode: doc.workMode || 'office', leaveType: doc.leaveType || 'auto', remarks: doc.remarks || '',
  };
}

async function applyRow(row, target, actor, settings, empCache) {
  const toSet = Object.fromEntries(Object.entries(row.changes).map(([f, c]) => [f, c.after]));

  if (target === 'employees') {
    const fields = Object.keys(toSet);
    if (row.action === 'create') {
      const doc = await Employee.create({ employeeId: row.data.employeeId, ...toSet });
      return { target, key: row.key, created: true, id: String(doc._id), after: snapEmployee(doc, fields) };
    }
    const doc = await Employee.findOne({ employeeId: row.data.employeeId });
    const before = snapEmployee(doc, fields);
    Object.assign(doc, toSet);
    await doc.save();
    return { target, key: row.key, created: false, before, after: snapEmployee(doc, fields) };
  }

  if (target === 'attendance') {
    const { employeeId, date: day } = row.data;
    let doc = await Attendance.findOne({ employeeId, date: day });
    const created = !doc;
    const before = doc ? snapAttendance(doc) : null;
    const previousLate = doc ? doc.toObject().late : undefined;
    if (!doc) doc = new Attendance({ employeeId, date: day });
    if (toSet.checkIn) doc.checkIn = { timestamp: new Date(toSet.checkIn), verificationMethod: 'csv_import' };
    if (toSet.checkOut) doc.checkOut = { timestamp: new Date(toSet.checkOut), verificationMethod: 'csv_import' };
    ['status', 'workMode', 'leaveType', 'remarks'].forEach((f) => { if (toSet[f] !== undefined) doc[f] = toSet[f]; });
    if (doc.checkIn?.timestamp) {
      doc.late = attendanceService.computeLate({ checkInTimestamp: doc.checkIn.timestamp, workMode: doc.workMode, settings, previous: previousLate });
    }
    await doc.save(); // pre-save hook recomputes workedMinutes
    return { target, key: row.key, created, id: String(doc._id), before, after: snapAttendance(doc), beforeLate: previousLate || null };
  }

  const doc = await PayrollAdjustment.create({
    employeeId: row.data.employeeId, month: row.data.month, type: row.data.type, amount: row.data.amount, reason: row.data.reason,
    addedBy: actor.id, addedByName: `CSV import · ${actor.name}`,
  });
  return { target, key: row.key, created: true, id: String(doc._id) };
}

async function apply({ target, mode = 'upsert', csv, filename, planHash, skipInvalid = false, confirmText }, actor) {
  const p = await plan({ target, mode, csv });
  if (planHash && planHash !== p.planHash) throw new ImportError('The data changed since you previewed this file. Please preview again before applying.', 409);
  if (p.summary.errors > 0 && !skipInvalid) throw new ImportError(`${p.summary.errors} row(s) have errors. Fix the file, or choose "apply valid rows only".`);
  const todo = p.rows.filter((r) => r.action === 'create' || r.action === 'update');
  if (!todo.length) throw new ImportError('There is nothing to change — every row is unchanged or skipped.');
  const sensitive = todo.some((r) => r.sensitive);
  if (sensitive && confirmText !== 'APPLY') throw new ImportError('This import changes pay, hours or status. Type APPLY to confirm.');

  const settings = await settingsService.getSettings();
  const batch = await ImportBatch.create({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role, target, mode, filename, sensitive,
    counts: { created: 0, updated: 0, unchanged: p.summary.unchanged, skipped: p.summary.errors },
  });

  try {
    for (const row of todo) {
      const change = await applyRow(row, target, actor, settings.toObject ? settings.toObject() : settings);
      await ImportBatch.updateOne({ _id: batch._id }, { $push: { changes: change }, $inc: { [row.action === 'create' ? 'counts.created' : 'counts.updated']: 1 } });
    }
  } catch (err) {
    require('../utils/logger').error(`CSV import failed, rolling back: ${err.stack || err.message}`);
    // Roll back whatever was already written, then report the failure.
    const fresh = await ImportBatch.findById(batch._id);
    await undoChanges((fresh && fresh.changes) || []);
    await ImportBatch.updateOne({ _id: batch._id }, { status: 'undone', undoneAt: new Date(), undoneByName: 'automatic rollback after an error' });
    throw new ImportError(`Import failed on one row and was rolled back (nothing was changed): ${err.message}`, 500);
  }

  const done = await ImportBatch.findById(batch._id);
  await AuditLog.create({
    adminId: actor.id, actorName: actor.name, action: 'IMPORT_APPLIED', entity: 'ImportBatch', entityId: String(batch._id),
    newValue: { target, filename, counts: done.counts, sensitive },
  });
  return { batchId: String(batch._id), counts: done.counts, target };
}

// Restore `changes` (newest first). Skips records someone edited after the import.
async function undoChanges(changes) {
  const report = { restored: 0, deleted: 0, skipped: [] };
  for (const c of [...changes].reverse()) {
    try {
      if (c.target === 'adjustments') {
        const r = await PayrollAdjustment.deleteOne({ _id: c.id }); report.deleted += r.deletedCount || 0;
      } else if (c.target === 'employees') {
        const empId = c.key;
        if (c.created) {
          const used = (await Attendance.countDocuments({ employeeId: empId })) + (await PayrollAdjustment.countDocuments({ employeeId: empId }));
          if (used) { report.skipped.push({ key: c.key, reason: 'the new employee already has attendance/pay records' }); continue; }
          await Employee.deleteOne({ employeeId: empId }); report.deleted += 1;
        } else {
          const doc = await Employee.findOne({ employeeId: empId });
          const fields = Object.keys(c.after);
          if (!doc || !same(snapEmployee(doc, fields), c.after)) { report.skipped.push({ key: c.key, reason: 'edited after the import' }); continue; }
          Object.assign(doc, c.before); await doc.save(); report.restored += 1;
        }
      } else {
        const doc = await Attendance.findById(c.id);
        if (!doc) { report.skipped.push({ key: c.key, reason: 'record no longer exists' }); continue; }
        if (!same(snapAttendance(doc), c.after)) { report.skipped.push({ key: c.key, reason: 'edited after the import' }); continue; }
        if (c.created) { await Attendance.deleteOne({ _id: c.id }); report.deleted += 1; } else {
          doc.checkIn = c.before.checkIn ? { timestamp: new Date(c.before.checkIn), verificationMethod: 'face_embedding' } : undefined;
          doc.checkOut = c.before.checkOut ? { timestamp: new Date(c.before.checkOut), verificationMethod: 'face_embedding' } : undefined;
          ['status', 'workMode', 'leaveType', 'remarks'].forEach((f) => { doc[f] = c.before[f]; });
          if (c.beforeLate) doc.late = c.beforeLate;
          await doc.save(); report.restored += 1;
        }
      }
    } catch (err) { report.skipped.push({ key: c.key, reason: err.message }); }
  }
  return report;
}

async function undo(batchId, actor) {
  const batch = await ImportBatch.findById(batchId);
  if (!batch) throw new ImportError('Import not found', 404);
  if (String(batch.actorId) !== String(actor.id) && actor.role !== 'super_admin') throw new ImportError('Only the person who ran an import (or a super admin) can undo it', 403);
  if (batch.status === 'undone') throw new ImportError('This import was already undone');
  const report = await undoChanges(batch.changes || []);
  batch.status = report.skipped.length ? 'partly_undone' : 'undone';
  batch.undoneAt = new Date(); batch.undoneByName = actor.name; batch.undoReport = report;
  await batch.save();
  await AuditLog.create({ adminId: actor.id, actorName: actor.name, action: 'IMPORT_UNDONE', entity: 'ImportBatch', entityId: String(batch._id), newValue: report });
  return report;
}

async function history(actor) {
  const q = actor.role === 'super_admin' || actor.role === 'admin' ? {} : { actorId: actor.id };
  const rows = await ImportBatch.find(q).select('-changes').sort({ createdAt: -1 }).limit(50);
  return rows.map((b) => ({
    id: String(b._id), target: b.target, filename: b.filename, actor: b.actorName, status: b.status, counts: b.counts, sensitive: b.sensitive,
    at: b.createdAt, undoneAt: b.undoneAt, undoneBy: b.undoneByName, undoReport: b.undoReport, mine: String(b.actorId) === String(actor.id),
  }));
}

module.exports = { ImportError, TARGETS, templateCsv, buildPlan, mapHeaders, plan, apply, undo, history, MAX_ROWS };
