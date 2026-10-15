import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import EmploymentFields, { EMPTY_WORK_FORM, cleanWorkPayload } from '../components/EmploymentFields.jsx';
import { EMPLOYMENT_LABELS } from '../lib/format.js';

// FR-002 / Section 4.1 / 23: Employee list with search + add.
export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', name: '', department: '', designation: '', email: '', phone: '', ...EMPTY_WORK_FORM });
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();

  async function load() {
    const { data } = await client.get('/employees', { params: { search } });
    setEmployees(data.employees);
  }

  useEffect(() => { load(); }, [search]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await client.post('/employees', cleanWorkPayload(form));
      setShowForm(false);
      setForm({ employeeId: '', name: '', department: '', designation: '', email: '', phone: '', ...EMPTY_WORK_FORM });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create employee');
    }
  }

  async function handleDeactivate(id) {
    if (!confirm(`Deactivate employee ${id}? This preserves their attendance history.`)) return;
    setActionError('');
    try {
      await client.delete(`/employees/${id}`);
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not deactivate employee');
    }
  }

  async function handleActivate(id) {
    if (!confirm(`Activate employee ${id}? They will be eligible for face recognition and attendance.`)) return;
    setActionError('');
    try {
      await client.put(`/employees/${id}`, { status: 'active' });
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not activate employee');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Employees</h1>
          <p className="sub">Manage employee profiles and face registration</p>
        </div>
        <GlassButton onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add employee'}
        </GlassButton>
      </div>

      {showForm && (
        <form onSubmit={handleCreate}>
          <GlassCard className="panel">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="field">
                <label>Employee ID</label>
                <input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
              </div>
              <div className="field">
                <label>Full name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Department</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="field">
                <label>Designation</label>
                <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +91 98765 43210" />
              </div>
            </div>
            <EmploymentFields form={form} setForm={setForm} />
            <GlassButton type="submit">Create employee</GlassButton>
            {error && <p className="error-text">{error}</p>}
          </GlassCard>
        </form>
      )}

      <GlassCard className="panel">
        <input
          placeholder="Search by name, ID, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 16, width: 280 }}
        />
        {actionError && <p className="error-text">{actionError}</p>}
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Department</th><th>Type</th><th>Pay</th><th>Face registered</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.employeeId}>
                <td>{emp.employeeId}</td>
                <td><Link to={`/employees/${emp.employeeId}`}>{emp.name}</Link></td>
                <td>{emp.department || '—'}</td>
                <td><span className={`badge ${emp.employmentType || 'onsite'}`}>{EMPLOYMENT_LABELS[emp.employmentType || 'onsite']}</span></td>
                <td>{emp.payType === 'hourly' ? `₹${emp.hourlyRate || 0}/hr` : 'Monthly'}</td>
                <td>{emp.faceRegistered ? '✓ Registered' : '— Not registered'}</td>
                <td><span className={`badge ${emp.status === 'active' ? 'present' : 'absent'}`}>{emp.status}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <GlassButton
                    variant="secondary"
                    onClick={() => navigate(`/employees/${emp.employeeId}/register-face`)}
                  >
                    Register face
                  </GlassButton>
                  {emp.status === 'active' ? (
                    <GlassButton variant="danger" onClick={() => handleDeactivate(emp.employeeId)}>Deactivate</GlassButton>
                  ) : (
                    <GlassButton onClick={() => handleActivate(emp.employeeId)}>Activate</GlassButton>
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
