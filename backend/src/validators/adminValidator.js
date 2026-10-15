const Joi = require('joi');

const createAdminSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'data_analyst').required(),
});

const updateAdminSchema = Joi.object({
  name: Joi.string().trim(),
  role: Joi.string().valid('admin', 'data_analyst'),
  status: Joi.string().valid('active', 'disabled'),
}).min(1);

module.exports = { createAdminSchema, updateAdminSchema };
