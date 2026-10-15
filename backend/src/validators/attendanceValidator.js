const Joi = require('joi');

const updateAttendanceSchema = Joi.object({
  checkIn: Joi.object({
    timestamp: Joi.date(),
  }),
  checkOut: Joi.object({
    timestamp: Joi.date(),
  }),
  status: Joi.string().valid('present', 'checked_out', 'absent', 'leave', 'half_day'),
  workMode: Joi.string().valid('office', 'remote'),
  leaveType: Joi.string().valid('auto', 'paid', 'unpaid'),
  remarks: Joi.string().allow('', null),
});

const markLeaveSchema = Joi.object({
  employeeId: Joi.string().trim().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), // YYYY-MM-DD
  status: Joi.string().valid('absent', 'leave', 'half_day').required(),
  remarks: Joi.string().allow('', null),
  leaveType: Joi.string().valid('auto', 'paid', 'unpaid'),
});

const penaltySchema = Joi.object({
  action: Joi.string().valid('waive', 'restore').required(),
  reason: Joi.string().trim().allow('', null),
});

module.exports = { updateAttendanceSchema, markLeaveSchema, penaltySchema };
