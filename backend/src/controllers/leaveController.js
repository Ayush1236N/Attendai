const leaveService = require('../services/leaveService');
const { success, failure } = require('../utils/response');

async function apply(req, res, next) {
  try {
    const request = await leaveService.applyForLeave(req.employee.employeeId, req.body);
    return success(res, 201, 'Leave request submitted', { request });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

async function myRequests(req, res, next) {
  try {
    const requests = await leaveService.myRequests(req.employee.employeeId);
    return success(res, 200, 'Leave requests retrieved', { requests });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { status, employeeId } = req.query;
    const requests = await leaveService.listRequests({ status, employeeId });
    return success(res, 200, 'Leave requests retrieved', { requests });
  } catch (err) { next(err); }
}

async function decide(req, res, next) {
  try {
    const request = await leaveService.decide(req.params.id, req.body, req.admin);
    return success(res, 200, `Leave request ${req.body.decision}`, { request });
  } catch (err) {
    if (err.statusCode) return failure(res, err.statusCode, err.message);
    next(err);
  }
}

module.exports = { apply, myRequests, list, decide };
