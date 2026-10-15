import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import publicClient from '../api/publicClient';
import { GlassCard, GlassButton } from '../components/glass/index.js';

// Public — reached via the link inside the password-reset email:
//   {FRONTEND_URL}/reset-password?token=...&role=admin|employee
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const role = params.get('role') === 'employee' ? 'employee' : 'admin';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is missing its token. Please use the link from your email.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = role === 'employee' ? '/auth/employee-reset-password' : '/auth/reset-password';
      await publicClient.post(endpoint, { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <GlassCard className="login-card" cornerRadius={28}>
        <h1>Choose a new password</h1>
        <p className="sub">{role === 'employee' ? 'Employee portal' : 'Admin dashboard'}</p>

        {done ? (
          <p style={{ color: 'var(--present)', fontSize: 14 }}>
            Password updated — redirecting you to sign in…
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <GlassButton type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Saving…' : 'Reset password'}
            </GlassButton>
            {error && <p className="error-text">{error}</p>}
            <p className="sub" style={{ marginTop: 14 }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </GlassCard>
    </div>
  );
}
