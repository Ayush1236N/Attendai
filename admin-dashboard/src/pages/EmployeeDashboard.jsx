import React, { useCallback, useEffect, useState } from 'react';
import employeeClient from '../api/employeeClient';
import FaceCapture from '../components/FaceCapture.jsx';
import { GlassCard } from '../components/glass/index.js';
import { fmtHours, money, EMPLOYMENT_LABELS } from '../lib/format.js';

// Employee portal home: mark attendance with the camera, see today's live
// hours, this month's hours + late penalties, and the attendance history.
export default function EmployeeDashboard() {
  const employeeName = localStorage.getItem('employee_name') || 'there';

  const [today, setToday] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [history, setHistory] = useState(null);
  const [presentToday, setPresentToday] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [, tick] = useState(0);

  const load = useCallback(() => {
    employeeClient.get('/attendance/me/today').then((r) => { setToday(r.data); setFetchedAt(Date.now()); }).catch(() => setLoadError('Could not load today\'s status.'));
    employeeClient.get('/attendance/me').then((r) => setHistory(r.data)).catch(() => setLoadError('Could not load your attendance history.'));
    employeeClient.get('/attendance/present-today').then((r) => setPresentToday(r.data.records)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-render every 30s so "hours so far" keeps ticking while checked in.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Hours so far: the server's figure at fetch time plus however long the
  // page has been open, so the counter keeps moving while checked in.
  let liveMinutes = today?.liveMinutes || 0;
  if (today?.checkedIn && !today?.checkedOut) {
    liveMinutes += Math.floor((Date.now() - fetchedAt) / 60000);
  }

  const rec = today?.record;
  const status = !today ? '—' : today.checkedOut ? 'Checked out' : today.checkedIn ? 'Checked in' : 'Not checked in';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hi, {employeeName}</h1>
          <p className="sub">
            {today ? `${EMPLOYMENT_LABELS[today.employmentType] || ''} · today is a ${today.expectedWorkMode === 'office' ? 'office' : 'remote'} day` : 'Your attendance at a glance'}
            {today?.expectedWorkMode === 'office' && ` · office starts ${today.officeStartTime} (+${today.lateGraceMinutes} min grace)`}
          </p>
        </div>
      </div>

      {rec?.late?.isLate && (
        <GlassCard className="panel" style={{ borderColor: rec.late.waived ? 'var(--present)' : 'var(--late)', marginBottom: 22 }}>
          {rec.late.waived ? (
            <>You were {rec.late.minutesLate} min late today, but the penalty was waived by an admin{rec.late.waiveReason ? ` (${rec.late.waiveReason})` : ''}.</>
          ) : (
            <>You checked in {rec.late.minutesLate} min after the start time. A late penalty of <strong>{money(rec.late.penaltyAmount)}</strong> is recorded — only an admin can remove it.</>
          )}
        </GlassCard>
      )}

      <div className="stat-grid">
        <GlassCard className="stat-card present">
          <div className="label">Today</div>
          <div className="value" style={{ fontSize: 20 }}>{status}</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="label">Hours worked today</div>
          <div className="value">{today ? fmtHours(liveMinutes) : '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="label">Hours this month</div>
          <div className="value">{history ? fmtHours(history.monthWorkedHours * 60) : '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card late">
          <div className="label">Late penalties this month</div>
          <div className="value">{history ? `${history.monthLateCount} · ${money(history.monthPenaltyTotal)}` : '—'}</div>
        </GlassCard>
      </div>

      {loadError && <p className="error-text" style={{ marginBottom: 16 }}>{loadError}</p>}

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Mark attendance with your face</h3>
        <FaceCapture client={employeeClient} onDone={load} />
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Your attendance history</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Date</th><th>Where</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Late</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(!history || history.records.length === 0) && (
                <tr><td colSpan={7} style={{ color: 'var(--text-muted)' }}>No attendance recorded yet.</td></tr>
              )}
              {history?.records.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td><span className={`badge ${r.workMode}`}>{r.workMode}</span></td>
                  <td>{r.checkIn || '--'}</td>
                  <td>{r.checkOut || (r.missingCheckout ? <span className="badge absent">missing</span> : '--')}</td>
                  <td>{r.workedMinutes ? fmtHours(r.workedMinutes) : '--'}</td>
                  <td>
                    {r.late.isLate ? (
                      <span className={`badge ${r.late.waived ? 'present' : 'late'}`}>
                        {r.late.waived ? 'waived' : `${r.late.minutesLate}m · ${money(r.late.penaltyAmount)}`}
                      </span>
                    ) : '—'}
                  </td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Who's present today ({presentToday.length})</h3>
        <table>
          <thead><tr><th>Name</th><th>Department</th><th>Where</th><th>Check-in</th><th>Check-out</th></tr></thead>
          <tbody>
            {presentToday.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No one has checked in yet today.</td></tr>
            )}
            {presentToday.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.name}</td>
                <td>{r.department || '—'}</td>
                <td><span className={`badge ${r.workMode}`}>{r.workMode}</span></td>
                <td>{r.checkIn || '--'}</td>
                <td>{r.checkOut || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
