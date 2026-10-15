import React, { useEffect, useState } from 'react';
import employeeClient from '../api/employeeClient';
import { GlassCard } from '../components/glass/index.js';
import { currentMonth, money, fmtHours, EMPLOYMENT_LABELS } from '../lib/format.js';

// The employee's own payslip: hours worked, leave, late penalties and net pay,
// with the day-by-day breakdown behind the numbers.
export default function EmployeeEarnings() {
  const [month, setMonth] = useState(currentMonth());
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    employeeClient
      .get('/payroll/me', { params: { month } })
      .then((r) => setSlip(r.data.payslip))
      .catch((err) => { setSlip(null); setError(err.response?.data?.message || 'Could not load your payslip.'); });
  }, [month]);

  const hourly = slip?.payType === 'hourly';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hours &amp; Earnings</h1>
          <p className="sub">
            {slip ? `${EMPLOYMENT_LABELS[slip.employmentType]} · paid ${hourly ? `hourly (${money(slip.hourlyRate)}/hr)` : `monthly (${money(slip.monthlySalary)})`}` : 'Your pay for the month'}
          </p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {slip && (
        <>
          <div className="stat-grid">
            <GlassCard className="stat-card"><div className="label">Total hours worked</div><div className="value">{fmtHours(slip.totalWorkedHours * 60)}</div></GlassCard>
            <GlassCard className="stat-card present"><div className="label">Gross pay</div><div className="value">{money(slip.grossPay)}</div></GlassCard>
            <GlassCard className="stat-card absent"><div className="label">Deductions</div><div className="value">{money(slip.leaveDeduction + slip.latePenaltyTotal + slip.manualDeductionTotal)}</div></GlassCard>
            <GlassCard className="stat-card late"><div className="label">Net pay</div><div className="value">{money(slip.netSalary)}</div></GlassCard>
          </div>

          <GlassCard className="panel">
            <h3 style={{ marginBottom: 12 }}>How it was calculated</h3>
            <table>
              <tbody>
                {hourly ? (
                  <>
                    <tr><td>Hours worked × rate ({slip.totalWorkedHours} h × {money(slip.hourlyRate)})</td><td style={{ textAlign: 'right' }}>{money(slip.hourlyPay)}</td></tr>
                    <tr><td>Paid leave ({slip.paidLeaveDays} day(s))</td><td style={{ textAlign: 'right' }}>{money(slip.paidLeavePay)}</td></tr>
                  </>
                ) : (
                  <>
                    <tr><td>Monthly salary</td><td style={{ textAlign: 'right' }}>{money(slip.monthlySalary)}</td></tr>
                    <tr><td>Unpaid leave / absence ({slip.unpaidLeaveDays} day(s) × {money(slip.perDaySalary)})</td><td style={{ textAlign: 'right', color: 'var(--absent)' }}>− {money(slip.leaveDeduction)}</td></tr>
                  </>
                )}
                {slip.overtimePay > 0 && <tr><td>Overtime ({slip.overtimeHours} h)</td><td style={{ textAlign: 'right', color: 'var(--present)' }}>+ {money(slip.overtimePay)}</td></tr>}
                <tr><td>Late penalties ({slip.lateCount}{slip.waivedPenaltyCount ? `, ${slip.waivedPenaltyCount} waived` : ''})</td><td style={{ textAlign: 'right', color: 'var(--absent)' }}>− {money(slip.latePenaltyTotal)}</td></tr>
                <tr><td>Bonus</td><td style={{ textAlign: 'right', color: 'var(--present)' }}>+ {money(slip.bonusTotal)}</td></tr>
                <tr><td>Other deductions</td><td style={{ textAlign: 'right', color: 'var(--absent)' }}>− {money(slip.manualDeductionTotal)}</td></tr>
                <tr><td><strong>Net pay</strong></td><td style={{ textAlign: 'right' }}><strong>{money(slip.netSalary)}</strong></td></tr>
              </tbody>
            </table>
            <p className="sub" style={{ marginTop: 10 }}>
              Paid leave days: {slip.paidLeaveDays} · Unpaid leave/absent days: {slip.unpaidLeaveDays} · Paid-leave allowance: {slip.paidLeaveAllowance}/month
              {slip.missingCheckouts > 0 && ` · ${slip.missingCheckouts} day(s) with no check-out (0 hours counted — ask an admin to correct)`}
            </p>
          </GlassCard>

          <GlassCard className="panel">
            <h3 style={{ marginBottom: 12 }}>Day by day</h3>
            <table>
              <thead><tr><th>Date</th><th>Status</th><th>Where</th><th>Hours</th><th>Late penalty</th></tr></thead>
              <tbody>
                {slip.days.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No attendance this month.</td></tr>}
                {slip.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td><span className={`badge ${d.status}`}>{d.status}</span>{(d.status === 'leave' || d.status === 'half_day') && <span className="sub"> {d.leaveType}</span>}</td>
                    <td><span className={`badge ${d.workMode}`}>{d.workMode}</span></td>
                    <td>{d.workedHours ? fmtHours(d.workedHours * 60) : '—'}</td>
                    <td>{d.late.isLate ? (d.late.waived ? <span className="badge present">waived</span> : `${money(d.late.penaltyAmount)} (${d.late.minutesLate}m late)`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </>
      )}
    </div>
  );
}
