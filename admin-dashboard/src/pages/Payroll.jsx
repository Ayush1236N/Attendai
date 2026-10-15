import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import { currentMonth, money, fmtHours, EMPLOYMENT_LABELS } from '../lib/format.js';

// Payroll: hours worked, hourly or monthly pay, paid vs unpaid leave, late
// penalties, and manual bonuses/deductions. Every figure is computed live by
// the backend from Attendance + Employee data (see backend payrollService).
export default function Payroll() {
  const role = localStorage.getItem('admin_role') || 'admin';
  const isSuper = role === 'super_admin';

  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null); // employeeId being edited
  const [payForm, setPayForm] = useState({ payType: 'monthly', monthlySalary: '', hourlyRate: '', paidLeavesPerMonth: '' });
  const [saving, setSaving] = useState(false);

  const [adjForm, setAdjForm] = useState({ employeeId: '', type: 'bonus', amount: '', reason: '' });
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjMsg, setAdjMsg] = useState('');

  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [wh, setWh] = useState(null);
  const [whMsg, setWhMsg] = useState('');

  useEffect(() => { load(); }, [month]);
  useEffect(() => {
    client.get('/settings').then((r) => { setSettings(r.data.settings); setSettingsForm(r.data.settings); }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/reports/salary', { params: { month } });
      setRows(data.rows || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load salary report.');
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    // Needs the auth header, which window.open can't send — fetch then save.
    client.get('/reports/salary', { params: { month, format: 'csv' }, responseType: 'blob' }).then((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = `salary_report_${month}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function startEdit(row) {
    setEditing(row.employeeId);
    setPayForm({
      payType: row.payType,
      monthlySalary: row.monthlySalary,
      hourlyRate: row.hourlyRate,
      paidLeavesPerMonth: row.paidLeaveAllowance,
    });
  }

  async function savePay(employeeId) {
    setSaving(true);
    try {
      await client.put(`/payroll/salary/${employeeId}`, {
        payType: payForm.payType,
        monthlySalary: Number(payForm.monthlySalary) || 0,
        hourlyRate: Number(payForm.hourlyRate) || 0,
        paidLeavesPerMonth: Number(payForm.paidLeavesPerMonth) || 0,
      });
      setEditing(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save pay details.');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjustment(e) {
    e.preventDefault();
    setAdjMsg('');
    if (!adjForm.employeeId || !adjForm.amount) { setAdjMsg('Employee ID and amount are required.'); return; }
    setAdjBusy(true);
    try {
      await client.post('/payroll/adjustments', {
        employeeId: adjForm.employeeId.trim(), month, type: adjForm.type, amount: Number(adjForm.amount), reason: adjForm.reason,
      });
      setAdjForm({ employeeId: '', type: 'bonus', amount: '', reason: '' });
      setAdjMsg('Saved — reflected in the table below.');
      load();
    } catch (err) {
      setAdjMsg(err.response?.data?.message || 'Could not save adjustment.');
    } finally {
      setAdjBusy(false);
    }
  }

  async function removeAdjustment(id) {
    if (!window.confirm('Remove this adjustment?')) return;
    try { await client.delete(`/payroll/adjustments/${id}`); load(); }
    catch (err) { alert(err.response?.data?.message || 'Could not remove adjustment.'); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsMsg('');
    try {
      const { data } = await client.put('/settings', {
        officeStartTime: settingsForm.officeStartTime,
        lateGraceMinutes: Number(settingsForm.lateGraceMinutes),
        latePenaltyAmount: Number(settingsForm.latePenaltyAmount),
        standardDailyHours: Number(settingsForm.standardDailyHours),
        overtimeMultiplier: Number(settingsForm.overtimeMultiplier || 0),
        analystImportsEnabled: settingsForm.analystImportsEnabled !== false,
      });
      setSettings(data.settings);
      setSettingsMsg('Saved. New rules apply to future check-ins and to payroll calculations immediately.');
      load();
    } catch (err) {
      setSettingsMsg(err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Could not save settings.');
    }
  }

  useEffect(() => {
    if (isSuper) client.get('/settings/warehouse-status').then((r) => setWh(r.data)).catch(() => {});
  }, [isSuper]);

  async function runSync(full) {
    setWhMsg(full ? 'Running full backfill…' : 'Syncing…');
    try {
      const { data } = await client.post('/settings/warehouse-sync', { full });
      setWhMsg(data.result?.skipped ? data.message : `Done — ${data.result.attendanceRows} attendance rows, ${data.result.payrollRows} payroll rows.`);
      client.get('/settings/warehouse-status').then((r) => setWh(r.data));
    } catch (err) {
      setWhMsg(err.response?.data?.message || 'Sync failed.');
    }
  }

  async function sendTest(e) {
    e.preventDefault();
    setTestMsg('Sending…');
    try {
      const { data } = await client.post('/settings/test-email', { to: testTo });
      setTestMsg(data.message);
    } catch (err) {
      setTestMsg(err.response?.data?.message || 'Could not send.');
    }
  }

  const totals = rows.reduce(
    (a, r) => ({
      hours: a.hours + r.totalWorkedHours,
      gross: a.gross + r.grossPay,
      deduction: a.deduction + r.leaveDeduction + r.manualDeductionTotal + r.latePenaltyTotal,
      bonus: a.bonus + r.bonusTotal,
      net: a.net + r.netSalary,
    }),
    { hours: 0, gross: 0, deduction: 0, bonus: 0, net: 0 }
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Payroll</h1>
          <p className="sub">Hours worked, hourly &amp; monthly pay, paid/unpaid leave and late penalties</p>
        </div>
        <GlassButton variant="secondary" onClick={downloadCsv}>Download CSV</GlassButton>
      </div>

      <GlassCard className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </GlassCard>

      {settingsForm && (
        <GlassCard className="panel">
          <h3 style={{ marginBottom: 4 }}>Attendance &amp; penalty rules</h3>
          <p className="sub" style={{ marginBottom: 14 }}>
            Anyone checking in on an office day after start time + grace is marked late and charged the penalty.
            Remote days are exempt. Admins and super admins can waive any penalty from the Attendance page.
            {!isSuper && ' Only a super admin can change these rules.'}
          </p>
          <form onSubmit={saveSettings} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field"><label>Office start time</label>
              <input type="time" disabled={!isSuper} value={settingsForm.officeStartTime} onChange={(e) => setSettingsForm({ ...settingsForm, officeStartTime: e.target.value })} /></div>
            <div className="field"><label>Grace (minutes)</label>
              <input type="number" min="0" disabled={!isSuper} value={settingsForm.lateGraceMinutes} onChange={(e) => setSettingsForm({ ...settingsForm, lateGraceMinutes: e.target.value })} /></div>
            <div className="field"><label>Late penalty (₹ per late)</label>
              <input type="number" min="0" disabled={!isSuper} value={settingsForm.latePenaltyAmount} onChange={(e) => setSettingsForm({ ...settingsForm, latePenaltyAmount: e.target.value })} /></div>
            <div className="field"><label>Standard hours / day</label>
              <input type="number" min="1" max="24" step="0.5" disabled={!isSuper} value={settingsForm.standardDailyHours} onChange={(e) => setSettingsForm({ ...settingsForm, standardDailyHours: e.target.value })} /></div>
            <div className="field"><label>Overtime pay multiplier (0 = off)</label>
              <input type="number" min="0" max="5" step="0.25" disabled={!isSuper} value={settingsForm.overtimeMultiplier ?? 0} onChange={(e) => setSettingsForm({ ...settingsForm, overtimeMultiplier: e.target.value })} /></div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text)', alignSelf: 'center' }}>
              <input type="checkbox" style={{ width: 'auto' }} disabled={!isSuper} checked={settingsForm.analystImportsEnabled !== false}
                onChange={(e) => setSettingsForm({ ...settingsForm, analystImportsEnabled: e.target.checked })} />
              Allow analyst CSV imports
            </label>
            {isSuper && <GlassButton type="submit">Save rules</GlassButton>}
          </form>
          {settingsMsg && <p className="sub" style={{ marginTop: 10 }}>{settingsMsg}</p>}
        </GlassCard>
      )}

      {isSuper && (
        <GlassCard className="panel">
          <h3 style={{ marginBottom: 4 }}>Email check (password reset)</h3>
          <p className="sub" style={{ marginBottom: 12 }}>Send a test email to confirm password-reset emails will be delivered.</p>
          <form onSubmit={sendTest} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Send to</label>
              <input type="email" required value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></div>
            <GlassButton type="submit">Send test email</GlassButton>
          </form>
          {testMsg && <p className="sub" style={{ marginTop: 10 }}>{testMsg}</p>}
        </GlassCard>
      )}

      {isSuper && (
        <GlassCard className="panel">
          <h3 style={{ marginBottom: 4 }}>Reporting warehouse (Power BI history)</h3>
          <p className="sub" style={{ marginBottom: 12 }}>
            Syncs automatically every night. Last sync: {wh?.lastSync ? new Date(wh.lastSync).toLocaleString() : 'never'} ·
            {' '}{wh ? `${wh.attendanceRows} attendance rows, ${wh.payrollRows} payroll rows` : '…'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <GlassButton onClick={() => runSync(false)}>Sync now</GlassButton>
            <GlassButton variant="secondary" onClick={() => runSync(true)}>Full backfill (13 months)</GlassButton>
          </div>
          {whMsg && <p className="sub" style={{ marginTop: 10 }}>{whMsg}</p>}
        </GlassCard>
      )}

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 4 }}>Add bonus / deduction</h3>
        <p className="sub" style={{ marginBottom: 14 }}>Applies to the month selected above and shows up in the table immediately.</p>
        <form onSubmit={submitAdjustment} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field"><label>Employee ID</label>
            <input value={adjForm.employeeId} onChange={(e) => setAdjForm({ ...adjForm, employeeId: e.target.value })} placeholder="e.g. EMP0123" required /></div>
          <div className="field"><label>Type</label>
            <select value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}>
              <option value="bonus">Bonus (adds to pay)</option>
              <option value="deduction">Deduction (subtracts from pay)</option>
            </select></div>
          <div className="field"><label>Amount (₹)</label>
            <input type="number" min="0" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} required /></div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label>Reason</label>
            <input value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder="e.g. performance bonus" /></div>
          <GlassButton type="submit" disabled={adjBusy}>{adjBusy ? 'Saving…' : 'Add'}</GlassButton>
        </form>
        {adjMsg && <p className="sub" style={{ marginTop: 10 }}>{adjMsg}</p>}
      </GlassCard>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="stat-grid">
        <GlassCard className="stat-card"><div className="label">Total hours worked</div><div className="value">{fmtHours(totals.hours * 60)}</div></GlassCard>
        <GlassCard className="stat-card"><div className="label">Total gross pay</div><div className="value">{money(totals.gross)}</div></GlassCard>
        <GlassCard className="stat-card absent"><div className="label">Total deductions &amp; penalties</div><div className="value">{money(totals.deduction)}</div></GlassCard>
        <GlassCard className="stat-card present"><div className="label">Total bonuses</div><div className="value">{money(totals.bonus)}</div></GlassCard>
        <GlassCard className="stat-card late"><div className="label">Total net payable</div><div className="value">{money(totals.net)}</div></GlassCard>
      </div>

      <GlassCard className="panel">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Pay basis</th><th>Hours</th><th>Present</th>
                <th>Paid / unpaid leave</th><th>Gross</th><th>Leave deduction</th>
                <th>Late penalty</th><th>Bonus</th><th>Other ded.</th><th>Net pay</th><th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan={12} style={{ color: 'var(--text-muted)' }}>No active employees.</td></tr>}
              {rows.map((r) => {
                const isEditing = editing === r.employeeId;
                return (
                  <tr key={r.employeeId}>
                    <td>
                      {r.name}
                      <div className="sub" style={{ fontSize: 11 }}>
                        {r.employeeId} · <span className={`badge ${r.employmentType}`}>{EMPLOYMENT_LABELS[r.employmentType]}</span>
                      </div>
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'grid', gap: 6, minWidth: 150 }}>
                          <select value={payForm.payType} onChange={(e) => setPayForm({ ...payForm, payType: e.target.value })}>
                            <option value="monthly">Monthly</option>
                            <option value="hourly">Hourly</option>
                          </select>
                          {payForm.payType === 'hourly' ? (
                            <input type="number" min="0" step="0.01" placeholder="₹ / hour" value={payForm.hourlyRate} onChange={(e) => setPayForm({ ...payForm, hourlyRate: e.target.value })} />
                          ) : (
                            <input type="number" min="0" placeholder="₹ / month" value={payForm.monthlySalary} onChange={(e) => setPayForm({ ...payForm, monthlySalary: e.target.value })} />
                          )}
                          <input type="number" min="0" step="0.5" placeholder="Paid leaves / month" value={payForm.paidLeavesPerMonth} onChange={(e) => setPayForm({ ...payForm, paidLeavesPerMonth: e.target.value })} />
                        </div>
                      ) : r.payType === 'hourly' ? (
                        <>{money(r.hourlyRate)}/hr</>
                      ) : (
                        <>{money(r.monthlySalary)}<div className="sub" style={{ fontSize: 11 }}>≈ {money(r.effectiveHourlyRate)}/hr</div></>
                      )}
                    </td>
                    <td>
                      {fmtHours(r.totalWorkedHours * 60)}
                      {r.overtimeHours > 0 && <div className="sub" style={{ fontSize: 11 }}>{r.overtimeHours} h overtime{r.overtimePay > 0 ? ` · ${money(r.overtimePay)}` : ''}</div>}
                      {r.missingCheckouts > 0 && <div className="sub" style={{ fontSize: 11, color: 'var(--absent)' }}>{r.missingCheckouts} missing check-out</div>}
                    </td>
                    <td>{r.presentDays}</td>
                    <td>{r.paidLeaveDays} / {r.unpaidLeaveDays}<div className="sub" style={{ fontSize: 11 }}>allowance {r.paidLeaveAllowance}</div></td>
                    <td>
                      {money(r.grossPay)}
                      {r.payType === 'hourly' && <div className="sub" style={{ fontSize: 11 }}>{money(r.hourlyPay)} hrs + {money(r.paidLeavePay)} leave</div>}
                    </td>
                    <td style={{ color: r.leaveDeduction > 0 ? 'var(--absent)' : 'inherit' }}>
                      {r.payType === 'hourly' ? <span className="sub">n/a (unpaid = no pay)</span> : r.leaveDeduction > 0 ? `-${money(r.leaveDeduction)}` : money(0)}
                    </td>
                    <td style={{ color: r.latePenaltyTotal > 0 ? 'var(--absent)' : 'inherit' }}>
                      {r.latePenaltyTotal > 0 ? `-${money(r.latePenaltyTotal)}` : money(0)}
                      <div className="sub" style={{ fontSize: 11 }}>{r.lateCount} late{r.waivedPenaltyCount ? ` · ${r.waivedPenaltyCount} waived` : ''}</div>
                    </td>
                    <td style={{ color: r.bonusTotal > 0 ? 'var(--present)' : 'inherit' }}>{r.bonusTotal > 0 ? `+${money(r.bonusTotal)}` : money(0)}</td>
                    <td style={{ color: r.manualDeductionTotal > 0 ? 'var(--absent)' : 'inherit' }}>{r.manualDeductionTotal > 0 ? `-${money(r.manualDeductionTotal)}` : money(0)}</td>
                    <td style={{ fontWeight: 700 }}>{money(r.netSalary)}</td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <GlassButton padding="6px 12px" style={{ fontSize: 12 }} onClick={() => savePay(r.employeeId)} disabled={saving}>Save</GlassButton>
                          <GlassButton variant="secondary" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</GlassButton>
                        </div>
                      ) : (
                        <GlassButton variant="secondary" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => startEdit(r)}>Edit pay</GlassButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 12 }}>Adjustments this month</h3>
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Reason</th><th>Added by</th><th></th></tr></thead>
          <tbody>
            {rows.every((r) => r.adjustments.length === 0) && (
              <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>No bonuses or manual deductions added for this month yet.</td></tr>
            )}
            {rows.flatMap((r) =>
              r.adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{r.name} <span className="sub">({r.employeeId})</span></td>
                  <td><span className={`badge ${a.type === 'bonus' ? 'present' : 'absent'}`}>{a.type}</span></td>
                  <td>{money(a.amount)}</td>
                  <td>{a.reason || '—'}</td>
                  <td className="sub">{a.addedByName}</td>
                  <td><GlassButton variant="danger" padding="6px 12px" style={{ fontSize: 12 }} onClick={() => removeAdjustment(a.id)}>Remove</GlassButton></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

      <p className="sub" style={{ marginTop: 10, lineHeight: 1.6 }}>
        <strong>How pay is calculated.</strong> Hourly employees: hours worked × hourly rate, plus paid-leave days × standard hours × rate.
        Monthly employees: fixed salary minus unpaid leave days × (salary ÷ working days). Leave is "paid" when an admin approved it as
        paid, or (for "auto") while within the employee's monthly paid-leave allowance; "absent" days are always unpaid.
        Net = gross − leave deduction − late penalties (not waived) + bonus − other deductions. Working days are Monday–Friday with
        no public-holiday calendar; a day with a check-in but no check-out counts 0 hours until an admin corrects it.
      </p>
    </div>
  );
}
