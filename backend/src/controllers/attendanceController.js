const attendanceService = require('../services/attendanceService');
const { success, failure } = require('../utils/response');
const { formatTime, todayKey } = require('../utils/date');

function lateInfo(attendance) {
  const l = attendance.late || {};
  return {
    isLate: !!l.isLate,
    minutesLate: l.minutesLate || 0,
    penaltyAmount: l.penaltyAmount || 0,
    waived: !!l.waived,
  };
}

// FR-006 / FR-007: Check-In.
async function checkIn(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');

    const result = await attendanceService.checkIn(req.file.buffer);

    return success(res, 200, result.message, {
      alreadyCheckedIn: result.alreadyCheckedIn,
      employee: { employeeId: result.employee.employeeId, name: result.employee.name },
      attendance: {
        date: result.attendance.date,
        checkIn: formatTime(result.attendance.checkIn.timestamp),
        status: result.attendance.status,
        workMode: result.attendance.workMode,
        late: lateInfo(result.attendance),
      },
    });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

// FR-008 / FR-009: Check-Out.
async function checkOut(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');

    const result = await attendanceService.checkOut(req.file.buffer);

    return success(res, 200, result.message, {
      alreadyCheckedOut: result.alreadyCheckedOut,
      employee: { employeeId: result.employee.employeeId, name: result.employee.name },
      attendance: {
        date: result.attendance.date,
        checkIn: formatTime(result.attendance.checkIn.timestamp),
        checkOut: result.attendance.checkOut ? formatTime(result.attendance.checkOut.timestamp) : null,
        status: result.attendance.status,
        workMode: result.attendance.workMode,
        workedMinutes: result.attendance.workedMinutes || 0,
        workedHours: Math.round(((result.attendance.workedMinutes || 0) / 60) * 100) / 100,
        late: lateInfo(result.attendance),
      },
    });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

// Section 33: attendance listing/filtering for the admin dashboard.
// Logged-in "My Account" flow: the employee already proved who they are via
// password (+2FA if enabled) — this just confirms their face against their
// OWN registration before marking them present, rather than searching
// across every employee like the open-kiosk checkIn/checkOut above.
async function checkInMe(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');

    const result = await attendanceService.checkInAsEmployee(req.file.buffer, req.employee.employeeId);

    return success(res, 200, result.message, {
      alreadyCheckedIn: result.alreadyCheckedIn,
      employee: { employeeId: result.employee.employeeId, name: result.employee.name },
      attendance: {
        date: result.attendance.date,
        checkIn: formatTime(result.attendance.checkIn.timestamp),
        status: result.attendance.status,
        workMode: result.attendance.workMode,
        late: lateInfo(result.attendance),
      },
    });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

async function checkOutMe(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');

    const result = await attendanceService.checkOutAsEmployee(req.file.buffer, req.employee.employeeId);

    return success(res, 200, result.message, {
      alreadyCheckedOut: result.alreadyCheckedOut,
      employee: { employeeId: result.employee.employeeId, name: result.employee.name },
      attendance: {
        date: result.attendance.date,
        checkIn: formatTime(result.attendance.checkIn.timestamp),
        checkOut: result.attendance.checkOut ? formatTime(result.attendance.checkOut.timestamp) : null,
        status: result.attendance.status,
        workMode: result.attendance.workMode,
        workedMinutes: result.attendance.workedMinutes || 0,
        workedHours: Math.round(((result.attendance.workedMinutes || 0) / 60) * 100) / 100,
        late: lateInfo(result.attendance),
      },
    });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { date, employeeId, status, month, year } = req.query;
    const records = await attendanceService.listAttendance({ date, employeeId, status, month, year });
    return success(res, 200, 'Attendance retrieved', { records });
  } catch (err) {
    next(err);
  }
}

async function today(req, res, next) {
  try {
    const records = await attendanceService.listAttendance({ date: todayKey() });
    return success(res, 200, "Today's attendance retrieved", { records });
  } catch (err) {
    next(err);
  }
}

async function byEmployee(req, res, next) {
  try {
    const records = await attendanceService.listAttendance({ employeeId: req.params.employeeId });
    return success(res, 200, 'Employee attendance history retrieved', { records });
  } catch (err) {
    next(err);
  }
}

// FR-011: admin correction, fully audited.
async function update(req, res, next) {
  try {
    const record = await attendanceService.adminUpdateAttendance(req.params.id, req.body, req.admin.id);
    return success(res, 200, 'Attendance updated', { record });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

// Employee portal: the logged-in employee's own history + total days present.
async function myHistory(req, res, next) {
  try {
    const result = await attendanceService.myHistory(req.employee.employeeId);
    return success(res, 200, 'Attendance history retrieved', result);
  } catch (err) {
    next(err);
  }
}

// Employee portal: live "today" snapshot (status, hours so far, late/penalty).
async function myToday(req, res, next) {
  try {
    const result = await attendanceService.myToday(req.employee.employeeId);
    return success(res, 200, "Today's status retrieved", result);
  } catch (err) {
    next(err);
  }
}

// Admin / super admin: waive or restore a late penalty.
async function setPenalty(req, res, next) {
  try {
    const record = await attendanceService.setPenaltyWaived(req.params.id, req.body, req.admin);
    return success(res, 200, req.body.action === 'waive' ? 'Late penalty waived' : 'Late penalty restored', { record });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

// Employee portal: everyone currently present today (name + check-in/out times).
async function presentToday(req, res, next) {
  try {
    const records = await attendanceService.presentTodayWithNames();
    return success(res, 200, "Today's present employees retrieved", { records });
  } catch (err) {
    next(err);
  }
}

// Section 30: standalone recognition endpoint (identification only, no
// attendance side-effects) - useful for admin testing / kiosk "who is this" UI.
async function verify(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');
    const { employee, confidence } = await attendanceService.identifyEmployeeFromImage(req.file.buffer);
    return success(res, 200, 'Face verified', {
      matched: true,
      employeeId: employee.employeeId,
      confidence,
    });
  } catch (err) {
    if (err.statusCode) {
      return success(res, 200, err.message, { matched: false, employeeId: null, confidence: 0 });
    }
    next(err);
  }
}

// Admin: mark a day's status directly (leave/half_day/absent), even if the
// employee never checked in that day at all. Used for recording approved
// leave so the payroll salary report can deduct it correctly.
async function markLeave(req, res, next) {
  try {
    const record = await attendanceService.markDayStatus(req.body, req.admin.id);
    return success(res, 200, 'Attendance updated', { record });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

module.exports = { checkIn, checkOut, checkInMe, checkOutMe, list, today, byEmployee, update, markLeave, verify, myHistory, myToday, setPenalty, presentToday };
