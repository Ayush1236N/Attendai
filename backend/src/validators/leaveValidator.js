const Joi = require('joi');

const applyLeaveSchema = Joi.object({
  fromDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  toDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  type: Joi.string().valid('leave', 'half_day').default('leave'),
  reason: Joi.string().trim().min(3).max(500).required(),
});

const decideLeaveSchema = Joi.object({
  decision: Joi.string().valid('approved', 'rejected').required(),
  adminRemarks: Joi.string().allow('', null),
  // How payroll should treat approved days: 'auto' = paid while within the
  // employee's monthly paid-leave allowance, 'paid' = always paid, 'unpaid' = salary deducted.
  leaveType: Joi.string().valid('auto', 'paid', 'unpaid').default('auto'),
});

module.exports = { applyLeaveSchema, decideLeaveSchema };
