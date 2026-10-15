const Joi = require('joi');

const createEmployeeSchema = Joi.object({
  employeeId: Joi.string().trim().required(),
  name: Joi.string().trim().required(),
  email: Joi.string().email().allow('', null),
  phone: Joi.string().allow('', null),
  department: Joi.string().allow('', null),
  designation: Joi.string().allow('', null),
  joiningDate: Joi.date().allow(null),
  // Optional: if set, the employee can log into the self-service portal
  // with employeeId + this password.
  password: Joi.string().min(4).allow('', null),
  // Payroll (salary deduction on leave).
  monthlySalary: Joi.number().min(0).allow(null),
  paidLeavesPerMonth: Joi.number().min(0).allow(null),
  employmentType: Joi.string().valid('onsite', 'hybrid', 'remote'),
  hybridOfficeDays: Joi.array().items(Joi.number().integer().min(0).max(6)).unique(),
  payType: Joi.string().valid('monthly', 'hourly'),
  hourlyRate: Joi.number().min(0).allow(null),
});

// Used when an admin sets or resets an employee's portal login separately.
const setCredentialsSchema = Joi.object({
  password: Joi.string().min(4).required(),
});

const updateEmployeeSchema = Joi.object({
  name: Joi.string().trim(),
  email: Joi.string().email().allow('', null),
  phone: Joi.string().allow('', null),
  department: Joi.string().allow('', null),
  designation: Joi.string().allow('', null),
  joiningDate: Joi.date().allow(null),
  status: Joi.string().valid('active', 'inactive'),
  monthlySalary: Joi.number().min(0).allow(null),
  paidLeavesPerMonth: Joi.number().min(0).allow(null),
  employmentType: Joi.string().valid('onsite', 'hybrid', 'remote'),
  hybridOfficeDays: Joi.array().items(Joi.number().integer().min(0).max(6)).unique(),
  payType: Joi.string().valid('monthly', 'hourly'),
  hourlyRate: Joi.number().min(0).allow(null),
});

// Employee self-service: add/update their own contact email (used for
// forgot-password links and 2FA/security notices).
const updateOwnEmailSchema = Joi.object({
  email: Joi.string().email().required(),
});

module.exports = {
  createEmployeeSchema,
  updateEmployeeSchema,
  setCredentialsSchema,
  updateOwnEmailSchema,
};
