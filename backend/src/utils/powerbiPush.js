const axios = require('axios');
const env = require('../config/environment');
const logger = require('./logger');

// Optional real-time push. If POWERBI_PUSH_URL is set (a Power BI streaming /
// push dataset URL), each check-in and check-out is sent there immediately so
// a dashboard tile updates within seconds. Fire-and-forget: a Power BI outage
// must never block or fail an employee's check-in.
function pushAttendanceEvent(event) {
  if (!env.powerBiPushUrl) return;
  axios
    .post(env.powerBiPushUrl, [{ ...event, eventTime: new Date().toISOString() }], { timeout: 5000 })
    .catch((err) => logger.warn(`Power BI push failed: ${err.message}`));
}

module.exports = { pushAttendanceEvent };
