import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import publicClient from '../api/publicClient';
import { attachTilt } from '../lib/tilt.js';
import { useEffect } from 'react';
import { GlassCard, GlassButton } from '../components/glass/index.js';

// Public — no login required. Sends a reset-link email regardless of role;
// which endpoint we call depends on ?role=admin|employee (defaults to admin).
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const role = params.get('role') === 'employee' ? 'employee' : 'admin';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [noEmailServer, setNoEmailServer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => attachTilt(), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = role === 'employee' ? '/auth/employee-forgot-password' : '/auth/forgot-password';
      const { data } = await publicClient.post(endpoint, { email });
      setNoEmailServer(data.emailConfigured === false);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <GlassCard className="login-card" cornerRadius={28}>
        <h1>Reset your password</h1>
        <p className="sub">
          {role === 'employee' ? 'Employee portal' : 'Admin dashboard'} — enter the email on your account
        </p>

        {sent ? (
          <>
            <p style={{ color: 'var(--present)', fontSize: 14, marginBottom: 18 }}>
              If that email is registered, a reset link has been sent. Check your inbox — the link is
              valid for a limited time.
            </p>
            {noEmailServer && (
              <p style={{ color: 'var(--late)', fontSize: 14, marginBottom: 18 }}>
                Heads up: this server is not set up to send emails, so no email will arrive. Ask your super admin
                to reset your password (Team page → Reset link / Set password).
              </p>
            )}
            <Link to="/login" style={{ display: 'block' }}>
              <GlassButton variant="secondary" style={{ width: '100%' }}>
                Back to sign in
              </GlassButton>
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <GlassButton type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
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
