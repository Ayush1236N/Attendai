const dayjs = require('dayjs');
const LeaveRequest = require('../models/LeaveRequest');
const Employee = require('../models/Employee');
const attendanceService = require('./attendanceService');

class LeaveError extends Error {
  constructor(message, statusCode = 400, code = 'LEAVE_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function datesBetween(fromDate, toDate) {
  const dates = [];
  let cur = dayjs(fromDate);
  const end = dayjs(toDate);
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    dates.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return dates;
}

// Employee applies for leave. Capped at 31 days per request so a typo in
// the date range can't silently create a year's worth of attendance writes.
async function applyForLeave(employeeId, { fromDate, toDate, type, reason }) {
  const employee = await Employee.findOne({ employeeId });
  if (!employee) throw new LeaveError('Employee not found', 404, 'EMPLOYEE_NOT_FOUND');

  if (dayjs(toDate).isBefore(dayjs(fromDate))) {
    throw new LeaveError('End date must be on or after the start date');
  }
  const days = datesBetween(fromDate, toDate);
  if (days.length > 31) {
    throw new LeaveError('Leave requests are limited to 31 days — please split longer leave into separate requests');
  }

  return LeaveRequest.create({
    employeeId,
    employeeName: employee.name,
    fromDate,
    toDate,
    type: type || 'leave',
    reason,
  });
}

async function myRequests(employeeId) {
  return LeaveRequest.find({ employeeId }).sort({ createdAt: -1 });
}

// Admin-facing list, optionally filtered by status (defaults to all).
async function listRequests({ status, employeeId } = {}) {
  const query = {};
  if (status) query.status = status;
  if (employeeId) query.employeeId = employeeId;
  return LeaveRequest.find(query).sort({ createdAt: -1 });
}

// Approve or reject. Approving writes an Attendance record (status 'leave'
// or 'half_day', per the request's `type`) for every date in the range —
// the exact same write path as the admin dashboard's "Mark leave" form, so
// it's automatically picked up by the salary report's leave deduction with
// no separate integration needed.
async function decide(id, { decision, adminRemarks, leaveType }, admin) {
  const request = await LeaveRequest.findById(id);
  if (!request) throw new LeaveError('Leave request not found', 404, 'NOT_FOUND');
  if (request.status !== 'pending') {
    throw new LeaveError('This request has already been decided');
  }

  request.status = decision; // 'approved' | 'rejected'
  request.decidedBy = admin.id;
  request.decidedByName = admin.name;
  request.decidedAt = new Date();
  if (decision === 'approved') request.leaveType = leaveType || 'auto';
  if (adminRemarks !== undefined) request.adminRemarks = adminRemarks;
  await request.save();

  if (decision === 'approved') {
    // Weekends aren't working days, so they're never marked (or charged) as leave.
    const days = datesBetween(request.fromDate, request.toDate).filter((d) => ![0, 6].includes(dayjs(d).day()));
    for (const date of days) {
      await attendanceService.markDayStatus(
        {
          employeeId: request.employeeId,
          date,
          status: request.type,
          leaveType: request.leaveType,
          remarks: `Approved ${request.leaveType} leave: ${request.reason}`,
        },
        admin.id
      );
    }
  }

  return request;
}

module.exports = { LeaveError, applyForLeave, myRequests, listRequests, decide, datesBetween };
