import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import TwoFactorPanel from '../components/TwoFactorPanel.jsx';

export default function Security() {
  const role = localStorage.getItem('admin_role') || 'admin';
  const canViewOrgActivity = role === 'admin' || role === 'super_admin';

  // --- Change email ---
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // --- Change password ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  // --- 2FA ---
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // --- Org-wide login activity ---
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(canViewOrgActivity);
  const [filter, setFilter] = useState('all');
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    client.get('/auth/me').then((r) => setTwoFactorEnabled(!!r.data.admin.twoFactorEnabled)).catch(() => {});
    if (canViewOrgActivity) loadSessions();
  }, []);

  async function loadSessions() {
    setLoadingSessions(true);
    setSessionError('');
    try {
      const { data } = await client.get('/auth/sessions');
      setSessions(data.sessions || []);
    } catch (err) {
      setSessionError(err.response?.data?.message || 'Could not load login activity.');
    } finally {
      setLoadingSessions(false);
    }
  }

  async function revoke(id) {
    if (!window.confirm('Log this device out immediately?')) return;
    try {
      await client.post(`/auth/sessions/${id}/revoke`);
      loadSessions();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not revoke session.');
    }
  }

  async function submitEmailChange(e) {
    e.preventDefault();
    setEmailMsg('');
    setEmailBusy(true);
    try {
      await client.put('/auth/me/email', { newEmail, currentPassword: emailPassword });
      setEmailMsg('Email updated. Use it next time you sign in.');
      setNewEmail('');
      setEmailPassword('');
    } catch (err) {
      setEmailMsg(err.response?.data?.message || 'Could not update email.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function submitPasswordChange(e) {
    e.preventDefault();
    setPasswordMsg('');
    if (newPassword.length < 6) {
      setPasswordMsg('New password must be at least 6 characters.');
      return;
    }
    setPasswordBusy(true);
    try {
      await client.put('/auth/me/password', { currentPassword, newPassword });
      setPasswordMsg('Password updated. Your other signed-in devices have been logged out.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordMsg(err.response?.data?.message || 'Could not update password.');
    } finally {
      setPasswordBusy(false);
    }
  }

  const filtered = sessions.filter((s) => {
    if (filter === 'active') return s.active;
    if (filter === 'admin' || filter === 'employee') return s.userType === filter;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{canViewOrgActivity ? 'Security' : 'My Account'}</h1>
          <p className="sub">Your login details, two-factor authentication{canViewOrgActivity ? ', and org-wide login activity' : ''}</p>
        </div>
      </div>

      <GlassCard className="panel" style={{ marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <form onSubmit={submitEmailChange} style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginBottom: 10 }}>Change email</h3>
          <div className="field">
            <label>New email</label>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} required />
          </div>
          <GlassButton type="submit" disabled={emailBusy}>{emailBusy ? 'Saving…' : 'Update email'}</GlassButton>
          {emailMsg && <p className="sub" style={{ marginTop: 10 }}>{emailMsg}</p>}
        </form>

        <form onSubmit={submitPasswordChange} style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginBottom: 10 }}>Change password</h3>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <GlassButton type="submit" disabled={passwordBusy}>{passwordBusy ? 'Saving…' : 'Update password'}</GlassButton>
          {passwordMsg && <p className="sub" style={{ marginTop: 10 }}>{passwordMsg}</p>}
        </form>
      </GlassCard>

      <TwoFactorPanel
        client={client}
        basePath="/auth/2fa"
        enabled={twoFactorEnabled}
        onChanged={setTwoFactorEnabled}
      />

      {canViewOrgActivity && (
        <GlassCard className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <h3>Login activity (everyone)</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {['all', 'admin', 'employee', 'active'].map((f) => (
                <GlassButton
                  key={f}
                  variant={filter === f ? 'primary' : 'secondary'}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'active' ? 'Active only' : f[0].toUpperCase() + f.slice(1) + 's'}
                </GlassButton>
              ))}
            </div>
          </div>

          {sessionError && <p className="error-text" style={{ marginBottom: 12 }}>{sessionError}</p>}

          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Logged in</th>
                <th>Logged out</th>
                <th>IP</th>
                <th>Device</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!loadingSessions && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ color: 'var(--text-muted)' }}>No login activity found.</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s._id}>
                  <td>{s.name || s.userId}</td>
                  <td><span className={`badge ${s.userType === 'admin' ? 'present' : 'leave'}`}>{s.userType}</span></td>
                  <td>{new Date(s.loginAt).toLocaleString()}</td>
                  <td>{s.logoutAt ? new Date(s.logoutAt).toLocaleString() : '—'}</td>
                  <td>{s.ip || '—'}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.userAgent || '—'}
                  </td>
                  <td>
                    <span className={`badge ${s.active ? 'present' : 'absent'}`}>
                      {s.active ? 'Active' : 'Logged out'}
                    </span>
                  </td>
                  <td>
                    {s.active && (
                      <GlassButton variant="danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => revoke(s._id)}>
                        Log out
                      </GlassButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
