import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { GlassCard } from '../components/glass/index.js';

// FR-012 / Section 24 & 34: Admin Dashboard with live analytics.
export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [today, setToday] = useState([]);

  useEffect(() => {
    client.get('/dashboard/summary').then((r) => setSummary(r.data)).catch(() => {});
    client.get('/dashboard/today').then((r) => setToday(r.data.records)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Live snapshot of today's attendance</p>
        </div>
      </div>

      <div className="stat-grid">
        <GlassCard className="stat-card">
          <div className="label">Total employees</div>
          <div className="value">{summary?.totalEmployees ?? '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card present">
          <div className="label">Present today</div>
          <div className="value">{summary?.present ?? '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card absent">
          <div className="label">Absent today</div>
          <div className="value">{summary?.absent ?? '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card late">
          <div className="label">Checked out</div>
          <div className="value">{summary?.checkedOut ?? '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card late">
          <div className="label">Late today</div>
          <div className="value">{summary?.lateToday ?? '—'}</div>
        </GlassCard>
        <GlassCard className="stat-card">
          <div className="label">Working remotely today</div>
          <div className="value">{summary?.remoteToday ?? '—'}</div>
        </GlassCard>
      </div>

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 14 }}>Today's attendance</h3>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {today.length === 0 && (
              <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No attendance recorded yet today.</td></tr>
            )}
            {today.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeId}</td>
                <td>{r.checkIn ? new Date(r.checkIn.timestamp).toLocaleTimeString() : '--'}</td>
                <td>{r.checkOut ? new Date(r.checkOut.timestamp).toLocaleTimeString() : '--'}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
