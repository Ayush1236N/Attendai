import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import { fmtHours, money } from '../lib/format.js';

// FR-011: Admin Attendance Management — filter, view, correct.
export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ date: '', employeeId: '' });
  const [editingId, setEditingId] = useState(null);
  const [leaveForm, setLeaveForm] = useState({ employeeId: '', date: '', status: 'leave', leaveType: 'auto', remarks: '' });
  const [penaltyMsg, setPenaltyMsg] = useState('');
  const role = localStorage.getItem('admin_role') || 'admin';
  // Only admin / super admin can waive late penalties (the API enforces this too).
  const canWaive = role === 'admin' || role === 'super_admin';
  const [leaveMsg, setLeaveMsg] = useState('');

  async function load() {
    const params = {};
    if (filters.date) params.date = filters.date;
    if (filters.employeeId) params.employeeId = filters.employeeId;
    const { data } = await client.get('/attendance', { params });
    setRecords(data.records);
  }

  useEffect(() => { load(); }, [filters]);

  async function correctStatus(id, status) {
    await client.put(`/attendance/${id}`, { status });
    setEditingId(null);
    load();
  }

  async function setPenalty(record, action) {
    let reason = '';
    if (action === 'waive') {
      reason = window.prompt(`Waive the ₹${record.late.penaltyAmount} late penalty for ${record.employeeId} on ${record.date}?\n\nReason (optional):`);
      if (reason === null) return; // cancelled
    }
    setPenaltyMsg('');
    try {
      await client.put(`/attendance/${record._id}/penalty`, { action, reason });
      load();
    } catch (err) {
      setPenaltyMsg(err.response?.data?.message || 'Could not update the penalty.');
    }
  }

  async function submitLeave(e) {
    e.preventDefault();
    setLeaveMsg('');
    try {
      await client.post('/attendance/mark-leave', leaveForm);
      setLeaveMsg('Saved.');
      setLeaveForm({ employeeId: '', date: '', status: 'leave', leaveType: 'auto', remarks: '' });
      load();
    } catch (err) {
      setLeaveMsg(err.response?.data?.message || 'Could not save.');
    }
  }

  function exportCsv() {
    // window.open can't send the auth header, so fetch with the token and save the blob.
    client.get('/reports/attendance', { params: { format: 'csv' }, responseType: 'blob' }).then((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = 'attendance_report.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Attendance</h1>
          <p className="sub">Filter, review, and correct attendance records</p>
        </div>
        <GlassButton variant="secondary" onClick={exportCsv}>Export CSV</GlassButton>
      </div>

      <GlassCard className="panel" style={{ display: 'flex', gap: 12 }}>
        <div className="field">
          <label>Date</label>
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </div>
        <div className="field">
          <label>Employee ID</label>
          <input value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })} />
        </div>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 12 }}>Mark leave / half-day / absent</h3>
        <p className="sub" style={{ marginBottom: 14 }}>
          Use this for a day the employee never checked in at all (e.g. approved leave) — it creates the
          record so the salary report deducts it correctly.
        </p>
        <form onSubmit={submitLeave} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field">
            <label>Employee ID</label>
            <input
              value={leaveForm.employeeId}
              onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={leaveForm.date}
              onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={leaveForm.status} onChange={(e) => setLeaveForm({ ...leaveForm, status: e.target.value })}>
              <option value="leave">leave</option>
              <option value="half_day">half_day</option>
              <option value="absent">absent</option>
            </select>
          </div>
          {leaveForm.status !== 'absent' && (
            <div className="field">
              <label>Pay</label>
              <select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
                <option value="auto">Auto (paid within allowance)</option>
                <option value="paid">Paid leave</option>
                <option value="unpaid">Unpaid leave</option>
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Remarks (optional)</label>
            <input
              value={leaveForm.remarks}
              onChange={(e) => setLeaveForm({ ...leaveForm, remarks: e.target.value })}
              placeholder="e.g. approved sick leave"
            />
          </div>
          <GlassButton type="submit">Save</GlassButton>
        </form>
        {leaveMsg && <p className="sub" style={{ marginTop: 10 }}>{leaveMsg}</p>}
      </GlassCard>

      <GlassCard className="panel">
        {penaltyMsg && <p className="error-text" style={{ marginBottom: 10 }}>{penaltyMsg}</p>}
        <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr><th>Employee</th><th>Date</th><th>Where</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Late penalty</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeId}</td>
                <td>{r.date}</td>
                <td><span className={`badge ${r.workMode || 'office'}`}>{r.workMode || 'office'}</span></td>
                <td>{r.checkIn ? new Date(r.checkIn.timestamp).toLocaleTimeString() : '--'}</td>
                <td>{r.checkOut ? new Date(r.checkOut.timestamp).toLocaleTimeString() : '--'}</td>
                <td>{r.workedMinutes ? fmtHours(r.workedMinutes) : '--'}</td>
                <td>
                  {r.late?.isLate ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${r.late.waived ? 'present' : 'late'}`}>
                        {r.late.waived ? 'waived' : `${r.late.minutesLate}m · ${money(r.late.penaltyAmount)}`}
                      </span>
                      {canWaive && (
                        <GlassButton
                          variant={r.late.waived ? 'secondary' : 'danger'}
                          padding="4px 10px"
                          style={{ fontSize: 11 }}
                          onClick={() => setPenalty(r, r.late.waived ? 'restore' : 'waive')}
                        >
                          {r.late.waived ? 'Restore' : 'Remove'}
                        </GlassButton>
                      )}
                    </div>
                  ) : '—'}
                  {r.late?.waived && r.late.waivedByName && <div className="sub" style={{ fontSize: 11 }}>by {r.late.waivedByName}</div>}
                </td>
                <td>
                  {editingId === r._id ? (
                    <select defaultValue={r.status} onChange={(e) => correctStatus(r._id, e.target.value)}>
                      <option value="present">present</option>
                      <option value="checked_out">checked_out</option>
                      <option value="absent">absent</option>
                      <option value="leave">leave</option>
                      <option value="half_day">half_day</option>
                    </select>
                  ) : (
                    <span className={`badge ${r.status}`}>{r.status}</span>
                  )}
                </td>
                <td>
                  <GlassButton variant="secondary" onClick={() => setEditingId(editingId === r._id ? null : r._id)}>
                    {editingId === r._id ? 'Cancel' : 'Correct'}
                  </GlassButton>
                </td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--text-muted)' }}>No records match these filters.</td></tr>}
          </tbody>
        </table>
        </div>
      </GlassCard>
    </div>
  );
}
