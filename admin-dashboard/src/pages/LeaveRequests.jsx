import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';

// Admin/super_admin only. Approving a request writes an Attendance record
// ('leave' or 'half_day') for every date in range — the same write path as
// the Attendance page's "Mark leave" tool — so it's picked up by the salary
// report's leave deduction automatically, with no separate step.
export default function LeaveRequests() {
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [leaveType, setLeaveType] = useState('auto');
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = filter === 'all' ? {} : { status: filter };
      const { data } = await client.get('/leave-requests', { params });
      setRequests(data.requests || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load leave requests.');
    } finally {
      setLoading(false);
    }
  }

  async function decide(id, decision) {
    setBusy(true);
    try {
      await client.put(`/leave-requests/${id}/decision`, { decision, adminRemarks: remarks, leaveType });
      setDecidingId(null);
      setRemarks('');
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not record decision.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leave Requests</h1>
          <p className="sub">Approving a request automatically marks attendance for payroll</p>
        </div>
      </div>

      <GlassCard className="panel" style={{ display: 'flex', gap: 8 }}>
        {['pending', 'approved', 'rejected', 'all'].map((f) => (
          <GlassButton
            key={f}
            variant={filter === f ? 'primary' : 'secondary'}
            padding="7px 16px"
            style={{ fontSize: 12 }}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </GlassButton>
        ))}
      </GlassCard>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <GlassCard className="panel">
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th><th>Pay</th><th>Decided</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && requests.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--text-muted)' }}>No {filter !== 'all' ? filter : ''} leave requests.</td></tr>
            )}
            {requests.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeName}<div className="sub" style={{ fontSize: 11 }}>{r.employeeId}</div></td>
                <td>{r.fromDate}{r.fromDate !== r.toDate ? ` → ${r.toDate}` : ''}</td>
                <td>{r.type === 'half_day' ? 'Half day' : 'Full day'}</td>
                <td style={{ maxWidth: 220 }}>{r.reason}</td>
                <td>
                  <span className={`badge ${r.status === 'approved' ? 'present' : r.status === 'rejected' ? 'absent' : 'leave'}`}>
                    {r.status}
                  </span>
                </td>
                <td>{r.status === 'approved' ? (r.leaveType === 'paid' ? 'Paid' : r.leaveType === 'unpaid' ? 'Unpaid' : 'Auto') : '—'}</td>
                <td className="sub">
                  {r.decidedByName ? `${r.decidedByName} · ${new Date(r.decidedAt).toLocaleDateString()}` : '—'}
                </td>
                <td>
                  {r.status === 'pending' && (
                    decidingId === r._id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          placeholder="Remarks (optional)"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          style={{ width: 140 }}
                        />
                        <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} style={{ width: 'auto' }} title="How payroll treats approved days">
                          <option value="auto">Auto (paid within allowance)</option>
                          <option value="paid">Paid leave</option>
                          <option value="unpaid">Unpaid leave</option>
                        </select>
                        <GlassButton padding="6px 12px" style={{ fontSize: 12 }} onClick={() => decide(r._id, 'approved')} disabled={busy}>
                          Approve
                        </GlassButton>
                        <GlassButton variant="danger" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => decide(r._id, 'rejected')} disabled={busy}>
                          Reject
                        </GlassButton>
                        <GlassButton variant="secondary" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => { setDecidingId(null); setRemarks(''); }}>
                          Cancel
                        </GlassButton>
                      </div>
                    ) : (
                      <GlassButton variant="secondary" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => { setDecidingId(r._id); setRemarks(''); setLeaveType('auto'); }}>
                        Review
                      </GlassButton>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
