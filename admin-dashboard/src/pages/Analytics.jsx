import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function Analytics() {
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadDepartments(); }, []);
  useEffect(() => { load(); }, [year, month, department]);

  async function loadDepartments() {
    try {
      const { data } = await client.get('/employees');
      const unique = [...new Set((data.employees || []).map((e) => e.department).filter(Boolean))];
      setDepartments(unique.sort());
    } catch (err) {
      // Non-fatal — the department filter just won't have options.
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/analytics/overview', {
        params: { year, month, department: department || undefined },
      });
      setData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }

  function handleMonthChange(e) {
    const [y, m] = e.target.value.split('-').map(Number);
    setYearMonth({ year: y, month: m });
  }

  function downloadCsv() {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const params = new URLSearchParams({ month: monthKey, limit: '1000', format: 'csv' });
    if (department) params.set('department', department);
    window.open(`${client.defaults.baseURL}/analytics/best-performers?${params.toString()}`, '_blank');
  }

  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="sub">Attendance trends, department breakdown, payroll impact, and performance — live data</p>
        </div>
        <GlassButton variant="secondary" onClick={downloadCsv}>Download full ranking (CSV)</GlassButton>
      </div>

      <GlassCard className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field">
          <label>Month</label>
          <input type="month" value={monthValue} onChange={handleMonthChange} />
        </div>
        <div className="field">
          <label>Department</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </GlassCard>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {data && (
        <>
          <div className="stat-grid">
            <GlassCard className="stat-card">
              <div className="label">Total employees</div>
              <div className="value">{data.summary?.totalEmployees ?? '—'}</div>
            </GlassCard>
            <GlassCard className="stat-card present">
              <div className="label">Present today</div>
              <div className="value">{data.summary?.present ?? '—'}</div>
            </GlassCard>
            <GlassCard className="stat-card absent">
              <div className="label">Absent today</div>
              <div className="value">{data.summary?.absent ?? '—'}</div>
            </GlassCard>
            <GlassCard className="stat-card late">
              <div className="label">Attendance rate this month</div>
              <div className="value">{data.summary?.monthlyAttendanceRate ?? 0}%</div>
            </GlassCard>
          </div>

          <div className="stat-grid">
            <GlassCard className="stat-card">
              <div className="label">Leave days this month</div>
              <div className="value">{data.summary?.totalLeaveDaysThisMonth ?? 0}</div>
            </GlassCard>
            <GlassCard className="stat-card absent">
              <div className="label">Absent days this month</div>
              <div className="value">{data.summary?.totalAbsentDaysThisMonth ?? 0}</div>
            </GlassCard>
            <GlassCard className="stat-card">
              <div className="label">Working days this month</div>
              <div className="value">{data.summary?.workingDaysThisMonth ?? 0}</div>
            </GlassCard>
            <GlassCard className="stat-card">
              <div className="label">Half-days this month</div>
              <div className="value">{data.summary?.totalHalfDaysThisMonth ?? 0}</div>
            </GlassCard>
          </div>

          <GlassCard className="panel">
            <h3 style={{ marginBottom: 4 }}>Payroll impact this month</h3>
            <p className="sub" style={{ marginBottom: 14 }}>
              Live figures from the Payroll module — go there to add bonuses, deductions, or edit salaries.
            </p>
            <div className="stat-grid" style={{ marginBottom: 0 }}>
              <GlassCard className="stat-card">
                <div className="label">Total gross salary</div>
                <div className="value">₹{Math.round(data.payrollSummary?.totalGrossSalary || 0).toLocaleString()}</div>
              </GlassCard>
              <GlassCard className="stat-card absent">
                <div className="label">Leave deductions</div>
                <div className="value">₹{Math.round(data.payrollSummary?.totalLeaveDeduction || 0).toLocaleString()}</div>
              </GlassCard>
              <GlassCard className="stat-card present">
                <div className="label">Bonuses paid</div>
                <div className="value">₹{Math.round(data.payrollSummary?.totalBonus || 0).toLocaleString()}</div>
              </GlassCard>
              <GlassCard className="stat-card late">
                <div className="label">Total net payable</div>
                <div className="value">₹{Math.round(data.payrollSummary?.totalNetPayable || 0).toLocaleString()}</div>
              </GlassCard>
            </div>
          </GlassCard>

          <GlassCard className="panel">
            <h3 style={{ marginBottom: 14 }}>Daily attendance this month{department ? ` — ${department}` : ''}</h3>
            {data.dailyTrend.length === 0 ? (
              <p className="sub">No attendance recorded yet this month.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a2e24" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#b7a591' }} tickFormatter={(d) => d.slice(-2)} />
                  <YAxis tick={{ fontSize: 11, fill: '#b7a591' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#221a14', border: '1px solid #3a2e24', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="present" stroke="#3ecf8e" strokeWidth={2} dot={false} name="Present" />
                  <Line type="monotone" dataKey="absent" stroke="#e2665f" strokeWidth={2} dot={false} name="Absent" />
                  <Line type="monotone" dataKey="leave" stroke="#c9903f" strokeWidth={2} dot={false} name="Leave" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          <GlassCard className="panel">
            <h3 style={{ marginBottom: 14 }}>Attendance by department this month</h3>
            {data.departmentBreakdown.length === 0 ? (
              <p className="sub">No department data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.departmentBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3a2e24" />
                  <XAxis dataKey="department" tick={{ fontSize: 11, fill: '#b7a591' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#b7a591' }} allowDecimals={false} unit="%" />
                  <Tooltip contentStyle={{ background: '#221a14', border: '1px solid #3a2e24', borderRadius: 8 }} />
                  <Bar dataKey="attendanceRate" fill="#c9903f" name="Attendance rate %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <table style={{ marginTop: 16 }}>
              <thead>
                <tr><th>Department</th><th>Headcount</th><th>Present days</th><th>Absent days</th><th>Leave days</th><th>Attendance rate</th></tr>
              </thead>
              <tbody>
                {data.departmentBreakdown.map((d) => (
                  <tr key={d.department}>
                    <td>{d.department}</td>
                    <td>{d.headcount}</td>
                    <td>{d.presentDays}</td>
                    <td>{d.absentDays}</td>
                    <td>{d.leaveDays}</td>
                    <td>{d.attendanceRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <GlassCard className="panel" style={{ flex: 1, minWidth: 320 }}>
              <h3 style={{ marginBottom: 4 }}>Best performers this month</h3>
              <p className="sub" style={{ marginBottom: 14 }}>Score = present − absent − 0.5 × (leave + half-days).</p>
              <table>
                <thead>
                  <tr><th>#</th><th>Employee</th><th>Present</th><th>Absent</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {data.topPerformers.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No data yet.</td></tr>
                  )}
                  {data.topPerformers.map((pf) => (
                    <tr key={pf.employeeId}>
                      <td>{pf.rank}</td>
                      <td>{pf.name}<div className="sub" style={{ fontSize: 11 }}>{pf.employeeId}</div></td>
                      <td>{pf.presentDays}</td>
                      <td>{pf.absentDays}</td>
                      <td style={{ fontWeight: 700, color: 'var(--present)' }}>{pf.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>

            <GlassCard className="panel" style={{ flex: 1, minWidth: 320 }}>
              <h3 style={{ marginBottom: 4 }}>Needs attention</h3>
              <p className="sub" style={{ marginBottom: 14 }}>Employees with the most absences/leave this month.</p>
              <table>
                <thead>
                  <tr><th>#</th><th>Employee</th><th>Absent</th><th>Leave</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {data.needsAttention.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No attendance activity yet this month.</td></tr>
                  )}
                  {data.needsAttention.map((pf) => (
                    <tr key={pf.employeeId}>
                      <td>{pf.rank}</td>
                      <td>{pf.name}<div className="sub" style={{ fontSize: 11 }}>{pf.employeeId}</div></td>
                      <td>{pf.absentDays}</td>
                      <td>{pf.leaveDays}</td>
                      <td style={{ fontWeight: 700, color: pf.score < 0 ? 'var(--absent)' : 'inherit' }}>{pf.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
