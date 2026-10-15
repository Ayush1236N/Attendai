import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import publicClient, { BASE_URL } from '../api/publicClient';
import { attachTilt } from '../lib/tilt.js';
import { GlassCard, GlassButton } from '../components/glass/index.js';

// FR-001: Admin Authentication, plus the employee self-service portal login
// (separate system — employees still check in/out with their face, this is
// only for viewing their own attendance history and today's team roster).
//
// IMPORTANT: every call on this page goes through publicClient (no auth
// interceptor). It used to use the admin client, whose interceptor reloads the
// page to /login on ANY 401 — so a wrong 2FA code (or wrong password) wiped the
// 2FA screen and the error message before the user could read or retry it.
//
// Both flows are 2FA-aware: a correct password can return a short-lived
// challengeToken instead of a session token, in which case we show the code
// step before finishing login.
// Turns any login failure into a message that says WHAT is wrong, instead of a
// generic "Login failed".
function explain(err, fallback) {
  if (!err.response) {
    const health = BASE_URL.replace(/\/api\/?$/, '') + '/health';
    return `Cannot reach the server at ${BASE_URL}. Check that the backend is running (open ${health} in a new tab — it should say OK) and that VITE_API_URL is correct. If that page opens but login still fails, the backend's ALLOWED_ORIGINS must include ${window.location.origin}.`;
  }
  const { status, data } = err.response;
  if (status === 401) return data?.message === 'Invalid credentials' ? 'Wrong email/ID or password.' : data?.message || fallback;
  if (status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (status === 400) return data?.errors?.join(', ') || data?.message || fallback;
  if (status >= 500) return `The server had an error (${status}). Look at the terminal where the backend is running — it prints the exact reason.`;
  return data?.message || fallback;
}

export default function Login() {
  const [mode, setMode] = useState('admin'); // 'admin' | 'employee'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [employeeId, setEmployeeId] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');

  const [challengeToken, setChallengeToken] = useState(null);
  const [code, setCode] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => attachTilt(), []);

  function finishAdminLogin(data) {
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_name', data.admin.name);
    localStorage.setItem('admin_role', data.admin.role);
    // Data analysts land straight in their workspace.
    navigate(data.admin.role === 'data_analyst' ? '/data-workspace' : '/dashboard');
  }

  function finishEmployeeLogin(data) {
    localStorage.setItem('employee_token', data.token);
    localStorage.setItem('employee_name', data.employee.name);
    sessionStorage.setItem('employee_greet', 'login');
    // If the organisation requires 2FA and this employee hasn't set it up yet,
    // take them straight to the page where they can.
    navigate(data.twoFactorSetupRequired ? '/employee/account' : '/employee');
  }

  async function handleAdminSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await publicClient.post('/auth/login', { email, password });
      if (data.requires2FA) {
        setChallengeToken(data.challengeToken);
      } else {
        finishAdminLogin(data);
      }
    } catch (err) {
      setError(explain(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmployeeSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await publicClient.post('/auth/employee-login', {
        employeeId,
        password: employeePassword,
      });
      if (data.requires2FA) {
        setChallengeToken(data.challengeToken);
      } else {
        finishEmployeeLogin(data);
      }
    } catch (err) {
      setError(explain(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handle2FASubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await publicClient.post('/auth/verify-2fa', { challengeToken, code });
      if (data.admin) finishAdminLogin(data);
      else finishEmployeeLogin(data);
    } catch (err) {
      setError(explain(err, 'Invalid 2FA code'));
    } finally {
      setLoading(false);
    }
  }

  if (challengeToken) {
    return (
      <div className="login-shell">
        <GlassCard className="login-card" cornerRadius={28}>
          <form onSubmit={handle2FASubmit}>
            <h1>Two-factor authentication</h1>
            <p className="sub">Enter the 6-digit code from your authenticator app</p>
            <div className="field">
              <label>Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
            <GlassButton type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </GlassButton>
            <GlassButton
              type="button"
              variant="secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => { setChallengeToken(null); setCode(''); setError(''); }}
            >
              Back
            </GlassButton>
            <p className="sub" style={{ marginTop: 12 }}>
              Code not working? Make sure your phone's clock is set to automatic date &amp; time.
            </p>
            {error && <p className="error-text">{error}</p>}
          </form>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <GlassCard className="login-card" cornerRadius={28}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          <GlassButton
            type="button"
            variant={mode === 'admin' ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            onClick={() => { setMode('admin'); setError(''); }}
          >
            Admin
          </GlassButton>
          <GlassButton
            type="button"
            variant={mode === 'employee' ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            onClick={() => { setMode('employee'); setError(''); }}
          >
            Employee
          </GlassButton>
        </div>

        {mode === 'admin' ? (
          <form onSubmit={handleAdminSubmit}>
            <h1>Admin sign in</h1>
            <p className="sub">Attendai Management System</p>

            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <GlassButton type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </GlassButton>
            <p className="sub" style={{ marginTop: 14 }}>
              <Link to="/forgot-password?role=admin">Forgot your password?</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleEmployeeSubmit}>
            <h1>Employee sign in</h1>
            <p className="sub">Mark attendance with your face, see your hours and pay</p>

            <div className="field">
              <label>Employee ID</label>
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={employeePassword}
                onChange={(e) => setEmployeePassword(e.target.value)}
                required
              />
            </div>

            <GlassButton type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </GlassButton>
            <p className="sub" style={{ marginTop: 14 }}>
              <Link to="/forgot-password?role=employee">Forgot your password?</Link>
            </p>
            <p className="sub" style={{ marginTop: 6 }}>
              Don't have a password? Ask your admin to set one for you.
            </p>
          </form>
        )}

        {error && <p className="error-text">{error}</p>}
        <p className="sub" style={{ marginTop: 14, marginBottom: 0, fontSize: 11, opacity: 0.6 }}>Server: {BASE_URL}</p>
      </GlassCard>
    </div>
  );
}
