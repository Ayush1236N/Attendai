// Shared colours + tiny formatters for the employee app.
export const C = {
  bg: '#16100c', card: '#221a14', border: '#3a2e24', text: '#f6ecdf', muted: '#b7a591',
  dim: '#7a6a58', gold: '#c9903f', green: '#3ecf8e', red: '#e2665f', amber: '#e0b25a',
};

export function fmtHours(minutes) {
  const m = Math.max(0, Math.round(minutes || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export const EMPLOYMENT_LABELS = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
