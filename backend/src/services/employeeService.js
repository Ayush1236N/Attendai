const bcrypt = require('bcrypt');
const Employee = require('../models/Employee');

async function listEmployees({ search, department, status } = {}) {
  const query = {};
  if (status) query.status = status;
  if (department) query.department = department;
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { employeeId: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }
  return Employee.find(query).sort({ createdAt: -1 });
}

async function createEmployee(payload) {
  const data = { ...payload };
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 12);
  } else {
    delete data.password; // leave portal login disabled until set explicitly
  }
  return Employee.create(data);
}

// Admin sets or resets an employee's self-service portal password.
async function setPassword(employeeId, plainPassword) {
  const hashed = await bcrypt.hash(plainPassword, 12);
  return Employee.findOneAndUpdate(
    { employeeId },
    { password: hashed },
    { new: true }
  );
}

// Used by the employee-login endpoint; explicitly selects the hidden field.
async function getEmployeeWithPassword(employeeId) {
  return Employee.findOne({ employeeId }).select('+password');
}

async function getEmployeeByEmployeeId(employeeId) {
  return Employee.findOne({ employeeId });
}

async function updateEmployee(employeeId, updates) {
  return Employee.findOneAndUpdate({ employeeId }, updates, { new: true });
}

// Rule 9: deactivation, not destructive deletion - historical attendance
// records must remain valid and attributable.
async function deactivateEmployee(employeeId) {
  return Employee.findOneAndUpdate(
    { employeeId },
    { status: 'inactive' },
    { new: true }
  );
}

async function storeFaceEmbedding(employeeId, vector, label = 'primary') {
  return Employee.findOneAndUpdate(
    { employeeId },
    {
      faceRegistered: true,
      $push: { faceEmbeddings: { vector, label } },
    },
    { new: true }
  );
}

module.exports = {
  listEmployees,
  createEmployee,
  getEmployeeByEmployeeId,
  updateEmployee,
  deactivateEmployee,
  storeFaceEmbedding,
  setPassword,
  getEmployeeWithPassword,
};
