import React, { useEffect, useState } from 'react';
import employeeClient from '../api/employeeClient';
import { GlassCard, GlassButton } from '../components/glass/index.js';

const STATUS_BADGE = { pending: 'leave', approved: 'present', rejected: 'absent' };

export default function EmployeeLeave() {
  const [form, setForm] = useState({ fromDate: '', toDate: '', type: 'leave', reason: '' });
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState([]);

  async function load() {
    try {
      const { data } = await employeeClient.get('/leave-requests/me');
      setRequests(data.requests || []);
    } catch (e) { /* non-fatal */ }
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      await employeeClient.post('/leave-requests', form);
      setIsError(false);
      setMsg('Leave request submitted. You can track its status below.');
      setForm({ fromDate: '', toDate: '', type: 'leave', reason: '' });
      load();
    } catch (err) {
      setIsError(true);
      setMsg(err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Could not submit your request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leave</h1>
          <p className="sub">Apply for leave. An admin decides whether it is paid or unpaid when approving.</p>
        </div>
      </div>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Apply for leave</h3>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="field">
              <label>From</label>
              <input type="date" required value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: form.toDate || e.target.value })} />
            </div>
            <div className="field">
              <label>To</label>
              <input type="date" required min={form.fromDate} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="leave">Full day(s)</option>
                <option value="half_day">Half day</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Reason</label>
            <input required minLength={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. family function, feeling unwell" />
          </div>
          <GlassButton type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</GlassButton>
          {msg && <p style={{ marginTop: 10, color: isError ? 'var(--absent)' : 'var(--present)' }}>{msg}</p>}
        </form>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>My requests</h3>
        <table>
          <thead><tr><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th><th>Pay</th><th>Admin note</th></tr></thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>No leave requests yet.</td></tr>}
            {requests.map((r) => (
              <tr key={r._id}>
                <td>{r.fromDate}{r.fromDate !== r.toDate ? ` → ${r.toDate}` : ''}</td>
                <td>{r.type === 'half_day' ? 'Half day' : 'Full day'}</td>
                <td>{r.reason}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                <td>{r.status === 'approved' ? (r.leaveType === 'paid' ? 'Paid' : r.leaveType === 'unpaid' ? 'Unpaid' : 'Paid within allowance') : '—'}</td>
                <td className="sub">{r.adminRemarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
