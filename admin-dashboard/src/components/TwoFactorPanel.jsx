import React, { useState } from 'react';
import { GlassCard, GlassButton } from './glass/index.js';

// One 2FA widget for admins AND employees. Shows current status, walks through
// QR setup + code confirmation, and lets the user turn 2FA off again (which
// needs a valid current code, so a stolen session can't silently disable it).
export default function TwoFactorPanel({ client, basePath, enabled, onChanged, notice }) {
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [disabling, setDisabling] = useState(false);

  function say(text, error = false) {
    setMsg(text);
    setIsError(error);
  }

  async function start() {
    setBusy(true);
    say('');
    try {
      const { data } = await client.post(`${basePath}/setup`);
      setQr(data);
    } catch (err) {
      say(err.response?.data?.message || 'Could not start 2FA setup.', true);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    say('');
    try {
      await client.post(`${basePath}/enable`, { code });
      setQr(null);
      setCode('');
      say('Two-factor authentication is now ON. You will be asked for a code each time you sign in.');
      onChanged && onChanged(true);
    } catch (err) {
      say(err.response?.data?.message || 'Invalid code — try again.', true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    say('');
    try {
      await client.post(`${basePath}/disable`, { code });
      setDisabling(false);
      setCode('');
      say('Two-factor authentication has been turned off.');
      onChanged && onChanged(false);
    } catch (err) {
      say(err.response?.data?.message || 'Invalid code — try again.', true);
    } finally {
      setBusy(false);
    }
  }

  const codeInput = (
    <div className="field" style={{ maxWidth: 200 }}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
      />
    </div>
  );

  return (
    <GlassCard className="panel" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h3>Two-factor authentication</h3>
        <span className={`badge ${enabled ? 'present' : 'absent'}`}>{enabled ? 'On' : 'Off'}</span>
      </div>
      <p className="sub" style={{ marginBottom: 14 }}>
        Require a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…)
        in addition to your password.
      </p>
      {notice && <p style={{ color: 'var(--late)', marginBottom: 12 }}>{notice}</p>}
      {msg && <p style={{ color: isError ? 'var(--absent)' : 'var(--present)', marginBottom: 12 }}>{msg}</p>}

      {!enabled && !qr && (
        <GlassButton onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Set up 2FA'}</GlassButton>
      )}

      {!enabled && qr && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img src={qr.qrDataUrl} alt="2FA QR code" style={{ width: 180, height: 180, borderRadius: 12, background: '#fff' }} />
          <div style={{ minWidth: 220 }}>
            <p className="sub" style={{ marginBottom: 10 }}>
              1. Scan this QR code with your authenticator app.<br />
              2. Type the 6-digit code it shows and press confirm.
            </p>
            {codeInput}
            <GlassButton onClick={enable} disabled={busy || code.length !== 6}>
              {busy ? 'Confirming…' : 'Confirm & enable'}
            </GlassButton>
          </div>
        </div>
      )}

      {enabled && !disabling && (
        <GlassButton variant="danger" onClick={() => { setDisabling(true); say(''); }}>Turn off 2FA</GlassButton>
      )}
      {enabled && disabling && (
        <div>
          <p className="sub" style={{ marginBottom: 10 }}>Enter a current code from your authenticator app to turn 2FA off.</p>
          {codeInput}
          <div style={{ display: 'flex', gap: 8 }}>
            <GlassButton variant="danger" onClick={disable} disabled={busy || code.length !== 6}>
              {busy ? 'Working…' : 'Turn off'}
            </GlassButton>
            <GlassButton variant="secondary" onClick={() => { setDisabling(false); setCode(''); }}>Cancel</GlassButton>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
