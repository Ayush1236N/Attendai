const employeeService = require('../services/employeeService');
const faceService = require('../services/faceService');
const { success, failure } = require('../utils/response');
const AuditLog = require('../models/AuditLog');

// FR-002 and Section 28: Employee CRUD.

async function list(req, res, next) {
  try {
    const { search, department, status } = req.query;
    const employees = await employeeService.listEmployees({ search, department, status });
    return success(res, 200, 'Employees retrieved', { employees });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const employee = await employeeService.createEmployee(req.body);
    return success(res, 201, 'Employee created', { employee });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const employee = await employeeService.getEmployeeByEmployeeId(req.params.id);
    if (!employee) return failure(res, 404, 'Employee not found');
    return success(res, 200, 'Employee retrieved', { employee });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const before = await employeeService.getEmployeeByEmployeeId(req.params.id);
    const employee = await employeeService.updateEmployee(req.params.id, req.body);
    if (!employee) return failure(res, 404, 'Employee not found');

    await AuditLog.create({
      adminId: req.admin.id,
      action: 'UPDATE_EMPLOYEE',
      entity: 'Employee',
      entityId: req.params.id,
      previousValue: before,
      newValue: employee,
    });

    return success(res, 200, 'Employee updated', { employee });
  } catch (err) {
    next(err);
  }
}

// DELETE maps to deactivation, per Rule 9.
async function remove(req, res, next) {
  try {
    const employee = await employeeService.deactivateEmployee(req.params.id);
    if (!employee) return failure(res, 404, 'Employee not found');

    await AuditLog.create({
      adminId: req.admin.id,
      action: 'DEACTIVATE_EMPLOYEE',
      entity: 'Employee',
      entityId: req.params.id,
      previousValue: null,
      newValue: { status: 'inactive' },
    });

    return success(res, 200, 'Employee deactivated', { employee });
  } catch (err) {
    next(err);
  }
}

// Admin sets or resets an employee's self-service portal login password.
async function setCredentials(req, res, next) {
  try {
    const employee = await employeeService.setPassword(req.params.id, req.body.password);
    if (!employee) return failure(res, 404, 'Employee not found');

    await AuditLog.create({
      adminId: req.admin.id,
      action: 'SET_EMPLOYEE_CREDENTIALS',
      entity: 'Employee',
      entityId: req.params.id,
      previousValue: null,
      newValue: { passwordChanged: true },
    });

    return success(res, 200, 'Employee portal password set', {
      employee: { employeeId: employee.employeeId, name: employee.name },
    });
  } catch (err) {
    next(err);
  }
}

// FR-003: Face Registration.
async function registerFace(req, res, next) {
  try {
    if (!req.file) return failure(res, 400, 'Face image is required');

    const employee = await employeeService.getEmployeeByEmployeeId(req.params.id);
    if (!employee) return failure(res, 404, 'Employee not found');

    const result = await faceService.registerFace(req.params.id, req.file.buffer, req.body.label);

    if (!result.success) {
      // e.g. no face detected, poor quality, multiple faces
      return failure(res, 422, result.message || 'Face registration failed quality checks');
    }

    await employeeService.storeFaceEmbedding(req.params.id, result.embedding, req.body.label);

    return success(res, 200, 'Face registered successfully', { employeeId: req.params.id });
  } catch (err) {
    next(err);
  }
}

// Employee self-service: view own profile (Profile screen in the app).
async function getMe(req, res, next) {
  try {
    const employee = await employeeService.getEmployeeByEmployeeId(req.employee.employeeId);
    if (!employee) return failure(res, 404, 'Employee not found');
    return success(res, 200, 'Profile retrieved', {
      employee: {
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email || null,
        phone: employee.phone,
        department: employee.department,
        designation: employee.designation,
        twoFactorEnabled: employee.twoFactorEnabled,
        employmentType: employee.employmentType,
        hybridOfficeDays: employee.hybridOfficeDays,
        payType: employee.payType,
        hourlyRate: employee.hourlyRate,
        faceRegistered: employee.faceRegistered,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Employee self-service: add or change their own contact email. This is
// what "add my own email" and the forgot-password-by-email flow rely on —
// without an email on file, /auth/employee-forgot-password has nothing to
// send a reset link to.
async function updateMyEmail(req, res, next) {
  try {
    const employee = await employeeService.updateEmployee(req.employee.employeeId, { email: req.body.email });
    if (!employee) return failure(res, 404, 'Employee not found');
    return success(res, 200, 'Email updated', { employee: { employeeId: employee.employeeId, email: employee.email } });
  } catch (err) {
    if (err.code === 11000) return failure(res, 409, 'That email is already in use');
    next(err);
  }
}

module.exports = { list, create, getOne, update, remove, registerFace, setCredentials, getMe, updateMyEmail };
