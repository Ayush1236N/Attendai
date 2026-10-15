// Small shared formatters used across admin + employee pages.
export function fmtHours(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export const EMPLOYMENT_LABELS = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const PAY_LABELS = { monthly: 'Monthly salary', hourly: 'Hourly' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
