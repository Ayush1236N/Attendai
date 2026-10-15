import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';

export default function Team() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'data_analyst' });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/admins');
      setAdmins(data.admins || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load team.');
    } finally {
      setLoading(false);
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    setCreateMsg('');
    setCreating(true);
    try {
      await client.post('/admins', form);
      setCreateMsg(`${form.role === 'data_analyst' ? 'Data analyst' : 'Admin'} account created.`);
      setForm({ name: '', email: '', password: '', role: 'data_analyst' });
      load();
    } catch (err) {
      setCreateMsg(err.response?.data?.message || 'Could not create account.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(admin) {
    const nextStatus = admin.status === 'active' ? 'disabled' : 'active';
    if (!window.confirm(`${nextStatus === 'disabled' ? 'Disable' : 'Re-enable'} ${admin.name}'s account?`)) return;
    try {
      await client.put(`/admins/${admin.id}`, { status: nextStatus });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update account.');
    }
  }

  const [resetInfo, setResetInfo] = useState(null);

  async function resetLink(admin) {
    try {
      const { data } = await client.post(`/admins/${admin.id}/reset-link`);
      setResetInfo({ name: admin.name, url: data.resetUrl, emailed: data.emailed, minutes: data.expiresInMinutes });
    } catch (err) { alert(err.response?.data?.message || 'Could not create a reset link.'); }
  }

  async function setTempPassword(admin) {
    const pw = window.prompt(`Set a temporary password for ${admin.name} (min 8 characters).\nThey will be signed out everywhere.`);
    if (!pw) return;
    try {
      const { data } = await client.post(`/admins/${admin.id}/set-password`, { password: pw });
      alert(data.message);
    } catch (err) { alert(err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Could not set password.'); }
  }

  async function resetTwoFactor(admin) {
    if (!window.confirm(`Turn off two-factor authentication for ${admin.name}? Use this if they lost their phone.`)) return;
    try {
      const { data } = await client.post(`/admins/${admin.id}/reset-2fa`);
      alert(data.message);
      load();
    } catch (err) { alert(err.response?.data?.message || 'Could not reset 2FA.'); }
  }

  async function changeRole(admin, role) {
    try {
      await client.put(`/admins/${admin.id}`, { role });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update role.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p className="sub">Manage admin and data analyst accounts (super admin only)</p>
        </div>
      </div>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Add a team member</h3>
        <form onSubmit={submitCreate} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="they can change it later"
              required
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="data_analyst">Data Analyst</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <GlassButton type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</GlassButton>
        </form>
        {createMsg && <p className="sub" style={{ marginTop: 10 }}>{createMsg}</p>}
        <p className="sub" style={{ marginTop: 10 }}>
          A <strong>Data Analyst</strong> can view Attendance, Analytics, and manage Payroll (salary,
          bonuses, deductions) — but cannot add/remove employees or manage other accounts.
        </p>
      </GlassCard>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {resetInfo && (
        <GlassCard className="panel" style={{ borderColor: 'var(--present)' }}>
          <h3 style={{ marginBottom: 6 }}>Password reset link for {resetInfo.name}</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            {resetInfo.emailed ? 'Also sent to their email. ' : 'Email is not set up, so send this link to them yourself (WhatsApp, chat). '}
            It works once and expires in {resetInfo.minutes} minutes.
          </p>
          <input readOnly value={resetInfo.url} onFocus={(e) => e.target.select()} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <GlassButton onClick={() => navigator.clipboard.writeText(resetInfo.url)}>Copy link</GlassButton>
            <GlassButton variant="secondary" onClick={() => setResetInfo(null)}>Close</GlassButton>
          </div>
        </GlassCard>
      )}

      <GlassCard className="panel">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {!loading && admins.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>No accounts found.</td></tr>
            )}
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>
                  {a.role === 'super_admin' ? (
                    <span className="badge present">super admin</span>
                  ) : (
                    <select value={a.role} onChange={(e) => changeRole(a, e.target.value)}>
                      <option value="admin">admin</option>
                      <option value="data_analyst">data_analyst</option>
                    </select>
                  )}
                </td>
                <td>{a.twoFactorEnabled ? 'Enabled' : '—'}</td>
                <td><span className={`badge ${a.status === 'active' ? 'present' : 'absent'}`}>{a.status}</span></td>
                <td>
                  {a.role !== 'super_admin' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <GlassButton variant="secondary" padding="6px 10px" style={{ fontSize: 12 }} onClick={() => resetLink(a)}>Reset link</GlassButton>
                      <GlassButton variant="secondary" padding="6px 10px" style={{ fontSize: 12 }} onClick={() => setTempPassword(a)}>Set password</GlassButton>
                      {a.twoFactorEnabled && <GlassButton variant="secondary" padding="6px 10px" style={{ fontSize: 12 }} onClick={() => resetTwoFactor(a)}>Reset 2FA</GlassButton>}
                      <GlassButton variant="secondary" padding="6px 10px" style={{ fontSize: 12 }} onClick={() => toggleStatus(a)}>
                        {a.status === 'active' ? 'Disable' : 'Enable'}
                      </GlassButton>
                    </div>
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
