import React from 'react';
import { WEEKDAYS } from '../lib/format.js';

// Work arrangement + pay fields, shared by "Add employee" and "Edit profile".
export const EMPTY_WORK_FORM = {
  employmentType: 'onsite',
  hybridOfficeDays: [1, 2, 3],
  payType: 'monthly',
  hourlyRate: '',
  monthlySalary: '',
  paidLeavesPerMonth: '',
};

// Turns the form's strings into what the API accepts (blank numbers are
// omitted rather than sent as "", which the API rejects).
export function cleanWorkPayload(form) {
  const out = { ...form };
  ['hourlyRate', 'monthlySalary', 'paidLeavesPerMonth'].forEach((k) => {
    if (out[k] === '' || out[k] === null || out[k] === undefined) delete out[k];
    else out[k] = Number(out[k]);
  });
  if (out.employmentType !== 'hybrid') delete out.hybridOfficeDays;
  ['email', 'phone', 'department', 'designation'].forEach((k) => {
    if (out[k] === undefined) delete out[k];
  });
  return out;
}

export default function EmploymentFields({ form, setForm }) {
  const days = form.hybridOfficeDays || [];
  function toggleDay(d) {
    setForm({ ...form, hybridOfficeDays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="field">
          <label>Employee type</label>
          <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
            <option value="onsite">On-site (office every day)</option>
            <option value="hybrid">Hybrid (some office days)</option>
            <option value="remote">Remote (work from home)</option>
          </select>
        </div>
        <div className="field">
          <label>Pay type</label>
          <select value={form.payType} onChange={(e) => setForm({ ...form, payType: e.target.value })}>
            <option value="monthly">Monthly salary</option>
            <option value="hourly">Hourly (paid for hours worked)</option>
          </select>
        </div>
        {form.payType === 'hourly' ? (
          <div className="field">
            <label>Hourly rate (₹ / hour)</label>
            <input type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="e.g. 250" />
          </div>
        ) : (
          <div className="field">
            <label>Monthly salary (₹)</label>
            <input type="number" min="0" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 40000" />
          </div>
        )}
        <div className="field">
          <label>Paid leaves / month</label>
          <input type="number" min="0" step="0.5" value={form.paidLeavesPerMonth} onChange={(e) => setForm({ ...form, paidLeavesPerMonth: e.target.value })} placeholder="e.g. 1" />
        </div>
      </div>

      {form.employmentType === 'hybrid' && (
        <div className="field">
          <label>Office days (other weekdays are remote)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={days.includes(d)} onChange={() => toggleDay(d)} />
                {WEEKDAYS[d]}
              </label>
            ))}
          </div>
        </div>
      )}
      {form.employmentType === 'remote' && (
        <p className="sub">Remote employees have no fixed arrival time, so late penalties never apply to them.</p>
      )}
    </div>
  );
}
