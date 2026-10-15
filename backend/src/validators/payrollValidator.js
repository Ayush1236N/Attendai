const Joi = require('joi');

const createAdjustmentSchema = Joi.object({
  employeeId: Joi.string().trim().required(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/).required(), // YYYY-MM
  type: Joi.string().valid('bonus', 'deduction').required(),
  amount: Joi.number().greater(0).required(),
  reason: Joi.string().allow('', null),
});

const updateSalarySchema = Joi.object({
  monthlySalary: Joi.number().min(0),
  paidLeavesPerMonth: Joi.number().min(0),
  payType: Joi.string().valid('monthly', 'hourly'),
  hourlyRate: Joi.number().min(0),
}).min(1);

module.exports = { createAdjustmentSchema, updateSalarySchema };
