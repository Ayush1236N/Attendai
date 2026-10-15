const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const env = require('../config/environment');

dayjs.extend(utc);
dayjs.extend(timezone);

// Every "what day is it / what time is it" decision in the app (today's
// attendance key, late-arrival check, hybrid office-day check) is made in the
// ORGANISATION's timezone, not the server's. Hosting platforms like Render
// run in UTC, which would otherwise roll the date over at 5:30 AM IST and
// make a 9:30 AM IST check-in look like 4:00 AM.
const TZ = env.timezone;

function nowTz(date) {
  return date ? dayjs(date).tz(TZ) : dayjs().tz(TZ);
}

// All attendance records are keyed by calendar day (YYYY-MM-DD).
function todayKey() {
  return nowTz().format('YYYY-MM-DD');
}

function dateKey(date) {
  return nowTz(date).format('YYYY-MM-DD');
}

function currentMonthKey() {
  return nowTz().format('YYYY-MM');
}

function formatTime(date) {
  return nowTz(date).format('hh:mm A');
}

// Minutes since local midnight (in the org timezone) for a timestamp.
function minutesOfDay(date) {
  const d = nowTz(date);
  return d.hour() * 60 + d.minute();
}

// 0 = Sunday ... 6 = Saturday, for a YYYY-MM-DD key or a timestamp.
function weekdayOf(dateOrKey) {
  if (typeof dateOrKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrKey)) {
    return dayjs(dateOrKey).day(); // calendar date, no tz shifting needed
  }
  return nowTz(dateOrKey).day();
}

// Minutes between check-in and check-out. A day with no check-out yet (or a
// manually marked leave/absent day) has 0 worked minutes — the missing
// check-out is surfaced separately so an admin can correct it.
function minutesWorked(record) {
  const inTs = record?.checkIn?.timestamp;
  const outTs = record?.checkOut?.timestamp;
  if (!inTs || !outTs) return 0;
  const mins = Math.round((new Date(outTs).getTime() - new Date(inTs).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 0) return 0;
  return Math.min(mins, 24 * 60);
}

// Build a Date from a calendar day (YYYY-MM-DD) and a wall-clock time (HH:mm)
// in the ORGANISATION's timezone — used by CSV imports of attendance times.
function parseLocal(dateKey, hhmm) {
  return dayjs.tz(`${dateKey} ${hhmm}`, 'YYYY-MM-DD HH:mm', TZ).toDate();
}

function parseHHmm(str, fallbackMinutes = 570) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!m) return fallbackMinutes;
  return Number(m[1]) * 60 + Number(m[2]);
}

module.exports = {
  TZ, nowTz, todayKey, dateKey, currentMonthKey, formatTime,
  minutesOfDay, weekdayOf, minutesWorked, parseHHmm, parseLocal,
};
