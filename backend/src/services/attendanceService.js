const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const faceService = require('./faceService');
const settingsService = require('./settingsService');
const env = require('../config/environment');
const { pushAttendanceEvent } = require('../utils/powerbiPush');
const {
  todayKey, formatTime, nowTz, minutesOfDay, weekdayOf, minutesWorked, parseHHmm, currentMonthKey,
} = require('../utils/date');

class AttendanceError extends Error {
  constructor(message, statusCode = 400, code = 'ATTENDANCE_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Fields every face-matching path needs from the Employee document.
const IDENTITY_FIELDS =
  'employeeId name status faceRegistered faceEmbeddings employmentType hybridOfficeDays';

// ---------------------------------------------------------------------------
// Work mode + late policy
// ---------------------------------------------------------------------------

// Where is this employee expected to work on the given weekday?
//   onsite -> office, remote -> remote, hybrid -> office only on their
//   configured office days.
function workModeFor(employee, weekday) {
  const type = employee.employmentType || 'onsite';
  if (type === 'remote') return 'remote';
  if (type === 'hybrid') {
    const days = employee.hybridOfficeDays && employee.hybridOfficeDays.length
      ? employee.hybridOfficeDays
      : [1, 2, 3];
    return days.includes(weekday) ? 'office' : 'remote';
  }
  return 'office';
}

// Works out lateness for a check-in time. Only OFFICE days can be late —
// remote employees (and a hybrid employee's remote days) have no fixed
// arrival time. Never overwrites a penalty an admin already waived.
function computeLate({ checkInTimestamp, workMode, settings, previous }) {
  const waived = !!previous?.waived;
  const base = {
    isLate: false,
    minutesLate: 0,
    penaltyAmount: 0,
    waived,
    waivedBy: previous?.waivedBy,
    waivedByName: previous?.waivedByName,
    waivedAt: previous?.waivedAt,
    waiveReason: previous?.waiveReason || '',
  };
  if (!checkInTimestamp || workMode !== 'office') return base;

  const start = parseHHmm(settings.officeStartTime, 570);
  const arrived = minutesOfDay(checkInTimestamp);
  const minutesLate = arrived - start;
  if (minutesLate <= (settings.lateGraceMinutes || 0)) return base;

  return {
    ...base,
    isLate: true,
    minutesLate,
    penaltyAmount: settings.latePenaltyAmount || 0,
  };
}

// ---------------------------------------------------------------------------
// Face identification
// ---------------------------------------------------------------------------

async function identifyEmployeeFromImage(imageBuffer) {
  const candidates = await Employee.find({ status: 'active', faceRegistered: true }).select(IDENTITY_FIELDS);

  if (candidates.length === 0) {
    throw new AttendanceError('No registered employees to match against', 422, 'NO_CANDIDATES');
  }

  const registeredEmployees = candidates.map((e) => ({
    employeeId: e.employeeId,
    embeddings: e.faceEmbeddings.map((f) => f.vector),
  }));

  const result = await faceService.recognizeFace(imageBuffer, registeredEmployees);

  if (!result.matched || result.confidence < env.faceMatchThreshold) {
    throw new AttendanceError(
      'Face not recognized. Please ensure good lighting and face the camera directly.',
      401,
      'FACE_NOT_RECOGNIZED'
    );
  }

  const employee = candidates.find((e) => e.employeeId === result.employeeId);
  if (!employee) {
    throw new AttendanceError('Matched employee record could not be found', 404, 'EMPLOYEE_NOT_FOUND');
  }
  if (employee.status !== 'active') {
    throw new AttendanceError('This employee account is not active', 403, 'EMPLOYEE_INACTIVE');
  }

  return { employee, confidence: result.confidence };
}

// Logged-in flow: the employee already proved who they are with a password
// (+2FA); the face scan only has to match THEIR OWN registration.
//
// NOTE: a face mismatch here deliberately returns 422, not 401. The web app
// and mobile app treat 401 as "your login expired" and sign the user out, so
// a blurry photo used to log people out of their account.
async function identifySpecificEmployee(imageBuffer, employeeId) {
  const employee = await Employee.findOne({ employeeId, status: 'active', faceRegistered: true }).select(
    IDENTITY_FIELDS
  );

  if (!employee) {
    throw new AttendanceError(
      'No registered face found for your account. Ask your admin to register your face first.',
      422,
      'NO_FACE_REGISTERED'
    );
  }

  const result = await faceService.recognizeFace(imageBuffer, [
    { employeeId: employee.employeeId, embeddings: employee.faceEmbeddings.map((f) => f.vector) },
  ]);

  if (!result.matched || result.confidence < env.faceMatchThreshold || result.employeeId !== employee.employeeId) {
    throw new AttendanceError(
      "That doesn't look like a match for your registered face. Please try again with clear, direct lighting.",
      422,
      'FACE_NOT_RECOGNIZED'
    );
  }

  return { employee, confidence: result.confidence };
}

// ---------------------------------------------------------------------------
// Check-in / check-out (shared by the kiosk flow and the logged-in flow)
// ---------------------------------------------------------------------------

async function recordCheckIn(employee, confidence) {
  const date = todayKey();

  const existing = await Attendance.findOne({ employeeId: employee.employeeId, date });
  if (existing) {
    return {
      alreadyCheckedIn: true,
      employee,
      attendance: existing,
      message: `Welcome back, ${employee.name}! You were already marked present today.`,
    };
  }

  const settings = await settingsService.getSettings();
  const timestamp = new Date();
  const workMode = workModeFor(employee, weekdayOf(date));
  const late = computeLate({ checkInTimestamp: timestamp, workMode, settings });

  const attendance = await Attendance.create({
    employeeId: employee.employeeId,
    date,
    checkIn: { timestamp, verificationScore: confidence, verificationMethod: 'face_embedding' },
    status: 'present',
    workMode,
    late,
  });

  let message = `Welcome, ${employee.name}! You are marked present.`;
  if (late.isLate) {
    message += late.penaltyAmount
      ? ` You arrived ${late.minutesLate} min after start time — a late penalty of ₹${late.penaltyAmount} has been recorded (an admin can waive it).`
      : ` You arrived ${late.minutesLate} min after start time.`;
  } else if (workMode === 'remote') {
    message += ' (Remote day)';
  }

  pushAttendanceEvent({
    event: 'check_in', employeeId: employee.employeeId, name: employee.name, date,
    workMode, isLate: late.isLate, minutesLate: late.minutesLate, penaltyAmount: late.isLate ? late.penaltyAmount : 0,
  });

  return { alreadyCheckedIn: false, employee, attendance, message };
}

async function recordCheckOut(employee, confidence) {
  const date = todayKey();
  const attendance = await Attendance.findOne({ employeeId: employee.employeeId, date });

  if (!attendance || !attendance.checkIn || !attendance.checkIn.timestamp) {
    throw new AttendanceError('No check-in record was found for today. Please check in first.', 400, 'NO_CHECKIN');
  }
  if (attendance.checkOut && attendance.checkOut.timestamp) {
    return { alreadyCheckedOut: true, employee, attendance, message: "Today's checkout was already recorded." };
  }

  attendance.checkOut = { timestamp: new Date(), verificationScore: confidence, verificationMethod: 'face_embedding' };
  attendance.status = 'checked_out';
  await attendance.save(); // pre-save hook computes workedMinutes

  const hrs = (attendance.workedMinutes / 60).toFixed(2);
  pushAttendanceEvent({
    event: 'check_out', employeeId: employee.employeeId, name: employee.name, date,
    workMode: attendance.workMode, workedHours: Number(hrs),
  });
  return {
    alreadyCheckedOut: false,
    employee,
    attendance,
    message: `Goodbye, ${employee.name}! You worked ${hrs} hours today.`,
  };
}

async function checkIn(imageBuffer) {
  const { employee, confidence } = await identifyEmployeeFromImage(imageBuffer);
  return recordCheckIn(employee, confidence);
}

async function checkOut(imageBuffer) {
  const { employee, confidence } = await identifyEmployeeFromImage(imageBuffer);
  return recordCheckOut(employee, confidence);
}

async function checkInAsEmployee(imageBuffer, employeeId) {
  const { employee, confidence } = await identifySpecificEmployee(imageBuffer, employeeId);
  return recordCheckIn(employee, confidence);
}

async function checkOutAsEmployee(imageBuffer, employeeId) {
  const { employee, confidence } = await identifySpecificEmployee(imageBuffer, employeeId);
  return recordCheckOut(employee, confidence);
}

// ---------------------------------------------------------------------------
// Employee portal views
// ---------------------------------------------------------------------------

function shapeRecord(r) {
  const mins = r.workedMinutes || minutesWorked(r);
  const late = r.late || {};
  return {
    id: r._id,
    date: r.date,
    checkIn: r.checkIn?.timestamp ? formatTime(r.checkIn.timestamp) : null,
    checkOut: r.checkOut?.timestamp ? formatTime(r.checkOut.timestamp) : null,
    status: r.status,
    workMode: r.workMode || 'office',
    leaveType: r.leaveType || 'auto',
    workedMinutes: mins,
    workedHours: Math.round((mins / 60) * 100) / 100,
    missingCheckout: !!(r.checkIn?.timestamp && !r.checkOut?.timestamp && r.date !== todayKey()),
    late: {
      isLate: !!late.isLate,
      minutesLate: late.minutesLate || 0,
      penaltyAmount: late.penaltyAmount || 0,
      waived: !!late.waived,
      waiveReason: late.waiveReason || '',
    },
  };
}

async function myHistory(employeeId) {
  const records = await Attendance.find({ employeeId }).sort({ date: -1 });
  const shaped = records.map(shapeRecord);
  const monthKey = currentMonthKey();

  const totalPresent = records.filter((r) => r.checkIn).length;
  const thisMonth = shaped.filter((r) => r.date.startsWith(monthKey));
  const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);

  return {
    totalPresent,
    totalWorkedHours: Math.round(sum(shaped, (r) => r.workedMinutes) / 60 * 100) / 100,
    month: monthKey,
    monthWorkedHours: Math.round(sum(thisMonth, (r) => r.workedMinutes) / 60 * 100) / 100,
    monthLateCount: thisMonth.filter((r) => r.late.isLate).length,
    monthPenaltyTotal: sum(thisMonth, (r) => (r.late.isLate && !r.late.waived ? r.late.penaltyAmount : 0)),
    records: shaped,
  };
}

// Live snapshot for the "Attendance" screen on web and mobile.
async function myToday(employeeId) {
  const [employee, settings, record] = await Promise.all([
    Employee.findOne({ employeeId }).select('employeeId name employmentType hybridOfficeDays payType hourlyRate'),
    settingsService.getSettings(),
    Attendance.findOne({ employeeId, date: todayKey() }),
  ]);

  const expectedMode = workModeFor(employee, weekdayOf(todayKey()));
  const base = {
    date: todayKey(),
    expectedWorkMode: expectedMode,
    employmentType: employee.employmentType || 'onsite',
    officeStartTime: settings.officeStartTime,
    lateGraceMinutes: settings.lateGraceMinutes,
    latePenaltyAmount: settings.latePenaltyAmount,
    standardDailyHours: settings.standardDailyHours,
    serverNow: nowTz().toISOString(),
    checkedIn: false,
    checkedOut: false,
    record: null,
  };
  if (!record) return base;

  const shaped = shapeRecord(record);
  // While the employee is still checked in, show hours so far.
  let liveMinutes = shaped.workedMinutes;
  if (record.checkIn?.timestamp && !record.checkOut?.timestamp) {
    liveMinutes = Math.max(0, Math.round((Date.now() - new Date(record.checkIn.timestamp).getTime()) / 60000));
  }
  return {
    ...base,
    checkedIn: !!record.checkIn?.timestamp,
    checkedOut: !!record.checkOut?.timestamp,
    liveMinutes,
    liveHours: Math.round((liveMinutes / 60) * 100) / 100,
    record: shaped,
  };
}

async function presentTodayWithNames() {
  const date = todayKey();
  const records = await Attendance.find({ date, 'checkIn.timestamp': { $exists: true } }).sort({ 'checkIn.timestamp': 1 });

  const employeeIds = records.map((r) => r.employeeId);
  const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select(
    'employeeId name department designation employmentType'
  );
  const byId = {};
  employees.forEach((e) => {
    byId[e.employeeId] = e;
  });

  return records.map((r) => ({
    employeeId: r.employeeId,
    name: byId[r.employeeId]?.name || r.employeeId,
    department: byId[r.employeeId]?.department || '',
    designation: byId[r.employeeId]?.designation || '',
    employmentType: byId[r.employeeId]?.employmentType || 'onsite',
    workMode: r.workMode || 'office',
    checkIn: r.checkIn?.timestamp ? formatTime(r.checkIn.timestamp) : null,
    checkOut: r.checkOut?.timestamp ? formatTime(r.checkOut.timestamp) : null,
    status: r.status,
  }));
}

// ---------------------------------------------------------------------------
// Admin views + corrections
// ---------------------------------------------------------------------------

async function listAttendance(filters = {}) {
  const query = {};
  if (filters.date) query.date = filters.date;
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.month && filters.year) {
    const prefix = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
    query.date = new RegExp(`^${prefix}`);
  }
  const records = await Attendance.find(query).sort({ date: -1 });
  // Older records (created before hours tracking existed) have no stored
  // workedMinutes — derive it from the timestamps so the UI is always right.
  return records.map((r) => {
    const obj = r.toObject();
    obj.workedMinutes = r.workedMinutes || minutesWorked(r);
    return obj;
  });
}

/**
 * FR-011: admin correction of attendance. Every modification is audited.
 * If check-in time / status changes, hours and the late flag are recomputed
 * (a penalty that was already waived stays waived).
 */
async function adminUpdateAttendance(attendanceId, updates, adminId) {
  const record = await Attendance.findById(attendanceId);
  if (!record) throw new AttendanceError('Attendance record not found', 404, 'NOT_FOUND');

  const previousValue = record.toObject();
  Object.assign(record, updates);

  if (updates.checkIn || updates.workMode) {
    const settings = await settingsService.getSettings();
    const late = computeLate({
      checkInTimestamp: record.checkIn?.timestamp,
      workMode: record.workMode,
      settings,
      previous: previousValue.late,
    });
    record.late = late;
  }
  // Leave / absent days can't carry a late penalty.
  if (['leave', 'absent', 'half_day'].includes(record.status) && !record.checkIn?.timestamp) {
    record.late = computeLate({ checkInTimestamp: null, workMode: 'remote', settings: {}, previous: previousValue.late });
  }

  await record.save();

  await AuditLog.create({
    adminId,
    action: 'UPDATE_ATTENDANCE',
    entity: 'Attendance',
    entityId: attendanceId,
    previousValue,
    newValue: record.toObject(),
  });

  return record;
}

// Waive (remove) or restore a late penalty. Admin + super admin only — the
// route enforces the role; employees and data analysts can't reach it.
async function setPenaltyWaived(attendanceId, { action, reason }, admin) {
  const record = await Attendance.findById(attendanceId);
  if (!record) throw new AttendanceError('Attendance record not found', 404, 'NOT_FOUND');
  if (!record.late || !record.late.isLate) {
    throw new AttendanceError('This day has no late penalty to change', 400, 'NO_PENALTY');
  }

  const previousValue = record.toObject();
  if (action === 'waive') {
    record.late.waived = true;
    record.late.waivedBy = admin.id; // undefined for Power BI actors
    record.late.waivedByName = admin.name;
    record.late.waivedAt = new Date();
    record.late.waiveReason = reason || '';
  } else {
    record.late.waived = false;
    record.late.waivedBy = undefined;
    record.late.waivedByName = undefined;
    record.late.waivedAt = undefined;
    record.late.waiveReason = '';
  }
  record.markModified('late');
  await record.save();

  await AuditLog.create({
    adminId: admin.id,
    actorName: admin.name,
    source: admin.source || 'app',
    requestId: admin.requestId,
    action: action === 'waive' ? 'WAIVE_LATE_PENALTY' : 'RESTORE_LATE_PENALTY',
    entity: 'Attendance',
    entityId: String(attendanceId),
    previousValue,
    newValue: record.toObject(),
  });

  return record;
}

// Marks a day as 'leave', 'half_day' or 'absent' even when the employee never
// checked in. `leaveType` ('paid' | 'unpaid' | 'auto') decides how payroll
// treats it.
async function markDayStatus({ employeeId, date, status, remarks, leaveType }, adminId) {
  const employee = await Employee.findOne({ employeeId });
  if (!employee) throw new AttendanceError('Employee not found', 404, 'EMPLOYEE_NOT_FOUND');

  let record = await Attendance.findOne({ employeeId, date });
  const previousValue = record ? record.toObject() : null;

  if (record) {
    record.status = status;
    if (remarks !== undefined) record.remarks = remarks;
    if (leaveType) record.leaveType = leaveType;
    await record.save();
  } else {
    record = await Attendance.create({
      employeeId,
      date,
      status,
      remarks,
      leaveType: leaveType || 'auto',
      workMode: workModeFor(employee, weekdayOf(date)),
    });
  }

  await AuditLog.create({
    adminId,
    action: previousValue ? 'UPDATE_ATTENDANCE' : 'MARK_LEAVE',
    entity: 'Attendance',
    entityId: record._id,
    previousValue,
    newValue: record.toObject(),
  });

  return record;
}

module.exports = {
  AttendanceError,
  workModeFor,
  computeLate,
  shapeRecord,
  identifyEmployeeFromImage,
  checkIn,
  checkOut,
  checkInAsEmployee,
  checkOutAsEmployee,
  listAttendance,
  adminUpdateAttendance,
  setPenaltyWaived,
  markDayStatus,
  formatTime,
  myHistory,
  myToday,
  presentTodayWithNames,
};
