import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client from '../../api/client';
import { GlassCard, GlassButton } from '../glass/index.js';

// CSV clean-up import. Flow: choose target → (download template / current data) →
// pick the cleaned CSV → PREVIEW (nothing is written) → review the changes →
// APPLY → (optional) UNDO from the history table.

const TARGETS = [
  ['employees', 'Employees (profile, work type, pay)', 'employees'],
  ['attendance', 'Attendance (check-in / check-out / leave)', 'attendance_daily'],
  ['adjustments', 'Bonuses & deductions', 'adjustments'],
];
const MODES = [['upsert', 'Update existing + add new'], ['update_only', 'Update existing only'], ['create_only', 'Add new only']];
const BADGE = { create: 'present', update: 'late', unchanged: 'leave', error: 'absent' };
const LABEL = { create: 'new', update: 'update', unchanged: 'no change', error: 'error' };
const fmtVal = (v) => (v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? v.join(',') : String(v));

function saveBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function ImportTab() {
  const role = localStorage.getItem('admin_role');
  const [target, setTarget] = useState('employees');
  const [mode, setMode] = useState('upsert');
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState('');
  const [plan, setPlan] = useState(null);
  const [view, setView] = useState('changes');
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const fileRef = useRef(null);

  const loadHistory = useCallback(() => client.get('/analyst/import/history').then((r) => setHistory(r.data.imports)).catch(() => {}), []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const fail = (err, fallback) => setError(err.response?.data?.message || fallback);
  const csvConfig = { params: { target, mode }, headers: { 'Content-Type': 'text/csv' }, transformRequest: [(d) => d] };

  function reset() { setFile(null); setCsv(''); setPlan(null); setResult(null); setConfirm(''); setSkipInvalid(false); setError(''); if (fileRef.current) fileRef.current.value = ''; }

  async function pick(e) {
    const f = e.target.files[0];
    setPlan(null); setResult(null); setError(''); setConfirm('');
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('That file is over 5 MB. Split it into smaller files.'); return; }
    setFile(f); setCsv(await f.text());
  }

  async function downloadTemplate() {
    const { data } = await client.get(`/analyst/import/template/${target}`, { responseType: 'blob' });
    saveBlob(`${target}_template.csv`, data);
  }
  async function downloadCurrent() {
    const ds = TARGETS.find((t) => t[0] === target)[2];
    const { data } = await client.get(`/analyst/data/${ds}`, { params: { format: 'csv' }, responseType: 'blob' });
    saveBlob(`${ds}_current.csv`, data);
  }

  async function preview() {
    setBusy(true); setError(''); setResult(null); setConfirm('');
    try {
      const { data } = await client.post('/analyst/import/preview', csv, csvConfig);
      setPlan(data); setView(data.summary.errors ? 'errors' : 'changes'); setSkipInvalid(false);
    } catch (err) { setPlan(null); fail(err, 'Could not read that file.'); } finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setError('');
    try {
      const { data } = await client.post('/analyst/import/apply', csv, {
        ...csvConfig,
        params: { target, mode, planHash: plan.planHash, skipInvalid: skipInvalid ? 1 : 0, confirm, filename: file?.name || '' },
      });
      setResult(data); setPlan(null); setCsv(''); setFile(null); if (fileRef.current) fileRef.current.value = '';
      loadHistory();
    } catch (err) { fail(err, 'The import failed.'); } finally { setBusy(false); }
  }

  async function undo(id) {
    if (!window.confirm('Undo this import? Records that were edited after the import are left as they are.')) return;
    try {
      const { data } = await client.post(`/analyst/import/${id}/undo`);
      const r = data.report;
      alert(`Undone: ${r.restored} restored, ${r.deleted} removed${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped.slice(0, 5).map((s) => `${s.key}: ${s.reason}`).join('; ')})` : ''}.`);
      loadHistory();
    } catch (err) { alert(err.response?.data?.message || 'Could not undo.'); }
  }

  const rows = useMemo(() => {
    if (!plan) return [];
    const f = { changes: (r) => r.action === 'create' || r.action === 'update', errors: (r) => r.action === 'error', warnings: (r) => r.warnings.length > 0, all: () => true }[view];
    return plan.rows.filter(f);
  }, [plan, view]);

  const s = plan?.summary;
  const needsConfirm = plan && plan.rows.some((r) => r.sensitive && (r.action === 'create' || r.action === 'update'));
  const canApply = plan && s && (s.create + s.update > 0) && (s.errors === 0 || skipInvalid) && (!needsConfirm || confirm === 'APPLY');

  return (
    <>
      <GlassCard className="panel">
        <h3 style={{ marginBottom: 4 }}>Clean up data and load it into Attendai</h3>
        <p className="sub" style={{ marginBottom: 14, lineHeight: 1.6 }}>
          Download the current data, clean it in Excel / Jupyter, upload it here. You always <strong>preview first</strong> — nothing is written until you press Apply,
          and every import can be <strong>undone</strong>. A blank cell means “leave as is”; it never erases data.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}><label>1. What are you importing?</label>
            <select value={target} onChange={(e) => { setTarget(e.target.value); reset(); }}>{TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Mode</label>
            <select value={mode} onChange={(e) => { setMode(e.target.value); setPlan(null); }} disabled={target === 'adjustments'}>
              {MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <GlassButton variant="secondary" onClick={downloadTemplate}>Download template</GlassButton>
          <GlassButton variant="secondary" onClick={downloadCurrent}>Download current data</GlassButton>
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="sub" style={{ display: 'block', marginBottom: 6 }}>2. Choose your cleaned .csv file</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={pick} />
          {file && <GlassButton style={{ marginLeft: 12 }} onClick={preview} disabled={busy}>{busy && !plan ? 'Checking…' : '3. Preview changes'}</GlassButton>}
        </div>
        {target === 'attendance' && <p className="sub" style={{ marginTop: 10 }}>Times can be 09:30, 9:30 AM or full timestamps. Dates: 2026-10-05 or 05/10/2026 (day first). Late penalties are worked out automatically.</p>}
        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
      </GlassCard>

      {result && (
        <GlassCard className="panel" style={{ borderColor: 'var(--present)' }}>
          <h3 style={{ marginBottom: 6 }}>Import applied ✓</h3>
          <p>{result.counts.created} added · {result.counts.updated} updated · {result.counts.unchanged} unchanged · {result.counts.skipped} skipped.
            The app, Power BI live feed and payroll already show the new data. The reporting warehouse updates at its nightly sync (or press “Sync now” on Payroll).</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <GlassButton variant="danger" onClick={() => undo(result.batchId)}>Undo this import</GlassButton>
            <GlassButton variant="secondary" onClick={reset}>Import another file</GlassButton>
          </div>
        </GlassCard>
      )}

      {plan && (
        <GlassCard className="panel">
          <h3 style={{ marginBottom: 10 }}>Preview — nothing has been saved yet</h3>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <GlassCard className="stat-card present"><div className="label">New</div><div className="value">{s.create}</div></GlassCard>
            <GlassCard className="stat-card late"><div className="label">Updated</div><div className="value">{s.update}</div></GlassCard>
            <GlassCard className="stat-card"><div className="label">No change</div><div className="value">{s.unchanged}</div></GlassCard>
            <GlassCard className="stat-card absent"><div className="label">Errors</div><div className="value">{s.errors}</div></GlassCard>
            <GlassCard className="stat-card"><div className="label">Warnings</div><div className="value">{s.warnings}</div></GlassCard>
          </div>
          {plan.ignoredColumns.length > 0 && <p className="sub" style={{ marginBottom: 10 }}>Ignored columns (not importable): {plan.ignoredColumns.join(', ')}</p>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {[['changes', 'Will change'], ['errors', 'Errors'], ['warnings', 'Warnings'], ['all', 'All rows']].map(([k, l]) => (
              <GlassButton key={k} variant={view === k ? 'primary' : 'secondary'} padding="6px 12px" onClick={() => setView(k)}>{l}</GlassButton>))}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Line</th><th>Record</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>Nothing in this view.</td></tr>}
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td><td style={{ whiteSpace: 'nowrap' }}>{r.key.split('|').slice(0, 2).join(' · ')}</td>
                    <td><span className={`badge ${BADGE[r.action]}`}>{LABEL[r.action]}</span></td>
                    <td style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      {r.errors.map((e, i) => <div key={`e${i}`} style={{ color: 'var(--absent)' }}>✕ {e}</div>)}
                      {Object.entries(r.changes).map(([f, c]) => <div key={f}><strong>{f}</strong>: <span style={{ opacity: 0.6 }}>{fmtVal(c.before)}</span> → {fmtVal(c.after)}</div>)}
                      {r.warnings.map((w, i) => <div key={`w${i}`} style={{ color: 'var(--late)' }}>⚠ {w}</div>)}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="sub">Showing the first 300 of {rows.length} rows.</p>}

          <div style={{ marginTop: 16, display: 'grid', gap: 10, maxWidth: 520 }}>
            {s.errors > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                Apply only the valid rows and skip the {s.errors} row(s) with errors
              </label>)}
            {needsConfirm && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>This changes pay, hours or status. Type <strong>APPLY</strong> to confirm</label>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APPLY" /></div>)}
            <div style={{ display: 'flex', gap: 8 }}>
              <GlassButton onClick={apply} disabled={!canApply || busy}>{busy ? 'Applying…' : `Apply ${s.create + s.update} change(s) to the live database`}</GlassButton>
              <GlassButton variant="secondary" onClick={reset}>Cancel</GlassButton>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 8 }}>Import history</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>When</th><th>By</th><th>Type</th><th>File</th><th>Added / updated / skipped</th><th>Status</th><th /></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--text-muted)' }}>No imports yet.</td></tr>}
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.at).toLocaleString()}</td><td>{h.actor}</td><td>{h.target}</td><td>{h.filename || '—'}</td>
                  <td>{h.counts.created} / {h.counts.updated} / {h.counts.skipped}</td>
                  <td><span className={`badge ${h.status === 'applied' ? 'present' : 'leave'}`}>{h.status.replace('_', ' ')}</span></td>
                  <td>{h.status === 'applied' && (h.mine || role === 'super_admin') && <GlassButton variant="danger" padding="5px 10px" style={{ fontSize: 12 }} onClick={() => undo(h.id)}>Undo</GlassButton>}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  );
}
