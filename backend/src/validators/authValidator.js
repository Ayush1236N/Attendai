const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const employeeLoginSchema = Joi.object({
  employeeId: Joi.string().trim().required(),
  password: Joi.string().min(4).required(),
});

const verify2FASchema = Joi.object({
  challengeToken: Joi.string().required(),
  code: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const twoFACodeSchema = Joi.object({
  code: Joi.string().length(6).pattern(/^\d+$/).required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).required(),
});

const employeeForgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const employeeResetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(4).required(),
});

const updateMyEmailSchema = Joi.object({
  newEmail: Joi.string().email().required(),
  currentPassword: Joi.string().required(),
});

const updateMyPasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

const employeeChangePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(4).required(),
});

module.exports = {
  employeeChangePasswordSchema,
  loginSchema,
  employeeLoginSchema,
  verify2FASchema,
  twoFACodeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  employeeForgotPasswordSchema,
  employeeResetPasswordSchema,
  updateMyEmailSchema,
  updateMyPasswordSchema,
};
