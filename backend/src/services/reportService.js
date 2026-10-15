const Attendance = require('../models/Attendance');
const { minutesWorked } = require('../utils/date');

// Section 5.1 / FR-011: basic exportable attendance reports.
// Returns plain rows; the controller decides the response format (JSON/CSV).
async function buildAttendanceReport({ startDate, endDate, employeeId }) {
  const query = {};
  if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };
  if (employeeId) query.employeeId = employeeId;

  const records = await Attendance.find(query).sort({ date: 1 });

  return records.map((r) => ({
    employeeId: r.employeeId,
    date: r.date,
    checkIn: r.checkIn ? r.checkIn.timestamp : null,
    checkOut: r.checkOut ? r.checkOut.timestamp : null,
    status: r.status,
    workMode: r.workMode || 'office',
    workedHours: Math.round(((r.workedMinutes || minutesWorked(r)) / 60) * 100) / 100,
    late: r.late?.isLate ? (r.late.waived ? 'late (waived)' : 'late') : '',
    latePenalty: r.late?.isLate && !r.late.waived ? r.late.penaltyAmount : 0,
  }));
}

function toCsv(rows) {
  const header = 'employeeId,date,checkIn,checkOut,status,workMode,workedHours,late,latePenalty';
  const lines = rows.map((r) =>
    [r.employeeId, r.date, r.checkIn || '', r.checkOut || '', r.status, r.workMode, r.workedHours, r.late, r.latePenalty].join(',')
  );
  return [header, ...lines].join('\n');
}

module.exports = { buildAttendanceReport, toCsv };
