import React, { useEffect, useState } from 'react';
import employeeClient from '../api/employeeClient';
import TwoFactorPanel from '../components/TwoFactorPanel.jsx';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import { EMPLOYMENT_LABELS, WEEKDAYS, money } from '../lib/format.js';

export default function EmployeeAccount() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await employeeClient.get('/employees/me');
    setProfile(data.employee);
    setEmail(data.employee.email || '');
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function saveEmail(e) {
    e.preventDefault();
    setEmailMsg('');
    try {
      await employeeClient.put('/employees/me/email', { email });
      setEmailMsg('Email saved. It will be used if you ever need to reset your password.');
    } catch (err) {
      setEmailMsg(err.response?.data?.message || 'Could not save email.');
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg({ text: '', error: false });
    setBusy(true);
    try {
      const { data } = await employeeClient.put('/auth/employee-me/password', { currentPassword: current, newPassword: next });
      setPwMsg({ text: data.message, error: false });
      setCurrent('');
      setNext('');
    } catch (err) {
      setPwMsg({ text: err.response?.data?.message || 'Could not change password.', error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Account</h1>
          <p className="sub">{profile.employeeId} · {profile.department || 'No department'} · {profile.designation || '—'}</p>
        </div>
      </div>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 10 }}>Work &amp; pay</h3>
        <p>Employment type: <strong>{EMPLOYMENT_LABELS[profile.employmentType] || 'On-site'}</strong>
          {profile.employmentType === 'hybrid' && ` (office on ${(profile.hybridOfficeDays || []).map((d) => WEEKDAYS[d]).join(', ')})`}
        </p>
        <p>Pay: <strong>{profile.payType === 'hourly' ? `${money(profile.hourlyRate)} per hour` : 'Monthly salary'}</strong></p>
        <p>Face registered: {profile.faceRegistered ? 'Yes' : 'No — ask your admin to register your face so you can check in'}</p>
      </GlassCard>

      <TwoFactorPanel
        client={employeeClient}
        basePath="/auth/employee-2fa"
        enabled={!!profile.twoFactorEnabled}
        onChanged={(on) => setProfile({ ...profile, twoFactorEnabled: on })}
      />

      <GlassCard className="panel" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <form onSubmit={saveEmail} style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginBottom: 10 }}>Email address</h3>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <GlassButton type="submit">Save email</GlassButton>
          {emailMsg && <p className="sub" style={{ marginTop: 10 }}>{emailMsg}</p>}
        </form>

        <form onSubmit={changePassword} style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginBottom: 10 }}>Change password</h3>
          <div className="field">
            <label>Current password</label>
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" required minLength={4} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <GlassButton type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</GlassButton>
          {pwMsg.text && <p style={{ marginTop: 10, color: pwMsg.error ? 'var(--absent)' : 'var(--present)' }}>{pwMsg.text}</p>}
        </form>
      </GlassCard>
    </div>
  );
}
