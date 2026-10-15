const crypto = require('crypto');
const env = require('../config/environment');
const { failure } = require('../utils/response');

// Guards the Power BI endpoints. The key is sent in an `x-api-key` header.
//   default export  -> READ key  (REPORTING_API_KEY)  for /api/bi/*
//   .write          -> WRITE key (REPORTING_WRITE_KEY) for /api/bi-write/*
// The two keys are different on purpose: a leaked report (read key) can never
// change data. `?key=` is accepted for read only, because URLs end up in logs.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function make(getKey, envName, allowQuery) {
  return function apiKeyMiddleware(req, res, next) {
    const key = getKey();
    if (!key) return failure(res, 503, `This feed is switched off. Set ${envName} on the backend to enable it.`);
    const provided = req.headers['x-api-key'] || (allowQuery ? req.query.key : undefined);
    if (!provided || !safeEqual(provided, key)) return failure(res, 401, 'Invalid or missing API key');
    next();
  };
}

const read = make(() => env.reportingApiKey, 'REPORTING_API_KEY', true);
read.write = make(() => env.reportingWriteKey, 'REPORTING_WRITE_KEY', false);
module.exports = read;
