const Joi = require('joi');

const updateSettingsSchema = Joi.object({
  officeStartTime: Joi.string().pattern(/^([01]?\d|2[0-3]):[0-5]\d$/),
  lateGraceMinutes: Joi.number().min(0).max(240),
  latePenaltyAmount: Joi.number().min(0),
  standardDailyHours: Joi.number().min(1).max(24),
  overtimeMultiplier: Joi.number().min(0).max(5),
  analystImportsEnabled: Joi.boolean(),
}).min(1);

module.exports = { updateSettingsSchema };
