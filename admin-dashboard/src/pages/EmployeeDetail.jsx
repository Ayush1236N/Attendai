import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import EmploymentFields, { EMPTY_WORK_FORM, cleanWorkPayload } from '../components/EmploymentFields.jsx';
import { EMPLOYMENT_LABELS, WEEKDAYS, fmtHours, money } from '../lib/format.js';

// Section 23: Employee Details + attendance history for one employee.
export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [history, setHistory] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', department: '', designation: '',
    ...EMPTY_WORK_FORM,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalStatus, setPortalStatus] = useState('');
  const [settingPortal, setSettingPortal] = useState(false);

  async function loadEmployee() {
    const r = await client.get(`/employees/${id}`);
    const emp = r.data.employee;
    setEmployee(emp);
    setForm({
      name: emp.name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      designation: emp.designation || '',
      monthlySalary: emp.monthlySalary ?? '',
      paidLeavesPerMonth: emp.paidLeavesPerMonth ?? '',
      employmentType: emp.employmentType || 'onsite',
      hybridOfficeDays: emp.hybridOfficeDays?.length ? emp.hybridOfficeDays : [1, 2, 3],
      payType: emp.payType || 'monthly',
      hourlyRate: emp.hourlyRate ?? '',
    });
  }

  useEffect(() => {
    loadEmployee();
    client.get(`/attendance/employee/${id}`).then((r) => setHistory(r.data.records));
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await client.put(`/employees/${id}`, cleanWorkPayload(form));
      await loadEmployee();
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update employee');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPortalPassword(e) {
    e.preventDefault();
    setPortalStatus('');
    setSettingPortal(true);
    try {
      await client.put(`/employees/${id}/credentials`, { password: portalPassword });
      setPortalStatus(`Portal login set. Give ${employee.name} their Employee ID (${employee.employeeId}) and this password.`);
      setPortalPassword('');
    } catch (err) {
      setPortalStatus(err.response?.data?.message || 'Could not set portal password');
    } finally {
      setSettingPortal(false);
    }
  }

  if (!employee) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{employee.name}</h1>
          <p className="sub">{employee.employeeId} · {employee.department || 'No department'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <GlassButton variant="secondary" onClick={() => setEditing((s) => !s)}>
            {editing ? 'Cancel' : 'Edit profile'}
          </GlassButton>
          <GlassButton onClick={() => navigate(`/employees/${id}/register-face`)}>
            Register / update face
          </GlassButton>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSave}>
          <GlassCard className="panel">
            <h3 style={{ marginBottom: 14 }}>Edit profile</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="field">
                <label>Full name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +91 98765 43210" />
              </div>
              <div className="field">
                <label>Department</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="field">
                <label>Designation</label>
                <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
            </div>
            <EmploymentFields form={form} setForm={setForm} />
            <GlassButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</GlassButton>
            {error && <p className="error-text">{error}</p>}
          </GlassCard>
        </form>
      )}

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 10 }}>Profile</h3>
        <p>Email: {employee.email || '—'}</p>
        <p>Phone: {employee.phone || '—'}</p>
        <p>Designation: {employee.designation || '—'}</p>
        <p>Employee type: <span className={`badge ${employee.employmentType || 'onsite'}`}>{EMPLOYMENT_LABELS[employee.employmentType || 'onsite']}</span>
          {employee.employmentType === 'hybrid' && ` — office on ${(employee.hybridOfficeDays || []).map((d) => WEEKDAYS[d]).join(', ')}`}</p>
        <p>Pay: {employee.payType === 'hourly' ? `${money(employee.hourlyRate)} per hour (paid for hours worked)` : `${employee.monthlySalary ? money(employee.monthlySalary) : '—'} monthly`}</p>
        <p>Paid leaves / month: {employee.paidLeavesPerMonth ?? '—'}</p>
        <p>Face registered: {employee.faceRegistered ? `Yes (${employee.faceEmbeddings.length} sample(s))` : 'No'}</p>
        <p>Status: <span className={`badge ${employee.status === 'active' ? 'present' : 'absent'}`}>{employee.status}</span></p>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 6 }}>Employee portal login</h3>
        <p className="sub" style={{ marginBottom: 14 }}>
          Face check-in/out needs no password. This is separate: it lets{' '}
          {employee.name} log into the web portal or mobile app, mark attendance with
          their face, apply for leave and see their hours and pay.
        </p>
        <form onSubmit={handleSetPortalPassword} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>Set / reset password</label>
            <input
              type="text"
              minLength={4}
              required
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="At least 4 characters"
            />
          </div>
          <GlassButton type="submit" disabled={settingPortal}>
            {settingPortal ? 'Saving…' : 'Save password'}
          </GlassButton>
        </form>
        {portalStatus && <p className="sub" style={{ marginTop: 10 }}>{portalStatus}</p>}
        <p className="sub" style={{ marginTop: 10 }}>
          Employee ID to log in with: <strong>{employee.employeeId}</strong>
        </p>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 10 }}>Attendance history</h3>
        <table>
          <thead><tr><th>Date</th><th>Where</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Late</th><th>Status</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r._id}>
                <td>{r.date}</td>
                <td><span className={`badge ${r.workMode || 'office'}`}>{r.workMode || 'office'}</span></td>
                <td>{r.checkIn ? new Date(r.checkIn.timestamp).toLocaleTimeString() : '--'}</td>
                <td>{r.checkOut ? new Date(r.checkOut.timestamp).toLocaleTimeString() : '--'}</td>
                <td>{r.workedMinutes ? fmtHours(r.workedMinutes) : '--'}</td>
                <td>{r.late?.isLate ? <span className={`badge ${r.late.waived ? 'present' : 'late'}`}>{r.late.waived ? 'waived' : `${r.late.minutesLate}m · ${money(r.late.penaltyAmount)}`}</span> : '—'}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--text-muted)' }}>No attendance history yet.</td></tr>}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
