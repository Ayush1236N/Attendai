import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import employeeClient from '../api/employeeClient';
import { attachTilt } from '../lib/tilt.js';
import { GlassNavbar, GlassButton, GlassCard } from '../components/glass/index.js';

export default function EmployeeLayout() {
  const navigate = useNavigate();
  const employeeName = localStorage.getItem('employee_name') || 'there';

  // Shown once right after login (Login.jsx sets this flag), then cleared.
  const [greeting, setGreeting] = useState(null);
  const [farewell, setFarewell] = useState(null);

  useEffect(() => attachTilt(), []);

  useEffect(() => {
    if (sessionStorage.getItem('employee_greet') === 'login') {
      setGreeting(`Welcome, ${employeeName}!`);
      sessionStorage.removeItem('employee_greet');
      const t = setTimeout(() => setGreeting(null), 3500);
      return () => clearTimeout(t);
    }
  }, [employeeName]);

  async function logout() {
    setFarewell(`See you tomorrow, ${employeeName}!`);
    // End the session on the server too (so it shows as logged out in Login
    // Activity), not just in this browser.
    try { await employeeClient.post('/auth/employee-logout'); } catch (e) { /* clear locally regardless */ }
    setTimeout(() => {
      localStorage.removeItem('employee_token');
      localStorage.removeItem('employee_name');
      navigate('/login');
    }, 1200);
  }

  const link = ({ isActive }) => (isActive ? 'active' : '');

  return (
    <div className="app-shell">
      <aside className="sidebar-slot">
        <GlassNavbar className="sidebar">
          <div className="brand">Attend<span>ai</span></div>
          <div className="sub" style={{ marginBottom: 12 }}>Employee Portal</div>
          <nav>
            <NavLink to="/employee" end className={link}>Attendance</NavLink>
            <NavLink to="/employee/leave" className={link}>Leave</NavLink>
            <NavLink to="/employee/earnings" className={link}>Hours &amp; Earnings</NavLink>
            <NavLink to="/employee/account" className={link}>My Account</NavLink>
          </nav>
          <div className="admin-info" style={{ marginTop: 'auto' }}>
            Signed in as {employeeName}
            <div>
              <GlassButton variant="secondary" style={{ marginTop: 10, width: '100%' }} onClick={logout} disabled={!!farewell}>
                Log out
              </GlassButton>
            </div>
          </div>
        </GlassNavbar>
      </aside>
      <main className="main">
        {(greeting || farewell) && (
          <GlassCard
            className="panel"
            style={{ marginBottom: 22, padding: '14px 20px', borderColor: 'var(--present)', color: 'var(--present)', fontWeight: 600 }}
          >
            {farewell || greeting}
          </GlassCard>
        )}
        <Outlet />
      </main>
    </div>
  );
}
