import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { attachTilt } from '../lib/tilt.js';
import { GlassNavbar, GlassButton } from './glass/index.js';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  data_analyst: 'Data Analyst',
};

export default function Layout() {
  const navigate = useNavigate();
  const adminName = localStorage.getItem('admin_name') || 'Admin';
  const role = localStorage.getItem('admin_role') || 'admin';

  useEffect(() => attachTilt(), []);

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_name');
    localStorage.removeItem('admin_role');
    navigate('/login');
  }

  // Employee management, attendance corrections, and org-wide login
  // activity stay admin/super_admin only. Payroll and Analytics are the
  // data_analyst's whole job, so they see those. Team (managing other admin
  // accounts) is super_admin only.
  const canManageEmployees = role === 'admin' || role === 'super_admin';
  const canManageSecurity = role === 'admin' || role === 'super_admin';
  const canManageTeam = role === 'super_admin';

  return (
    <div className="app-shell">
      <aside className="sidebar-slot">
        <GlassNavbar className="sidebar">
          <div className="brand">Attend<span>ai</span></div>
          <nav>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
            {canManageEmployees && (
              <NavLink to="/employees" className={({ isActive }) => (isActive ? 'active' : '')}>Employees</NavLink>
            )}
            <NavLink to="/attendance" className={({ isActive }) => (isActive ? 'active' : '')}>Attendance</NavLink>
            {canManageEmployees && (
              <NavLink to="/leave-requests" className={({ isActive }) => (isActive ? 'active' : '')}>Leave Requests</NavLink>
            )}
            <NavLink to="/payroll" className={({ isActive }) => (isActive ? 'active' : '')}>Payroll</NavLink>
            <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>Analytics</NavLink>
            <NavLink to="/data-workspace" className={({ isActive }) => (isActive ? 'active' : '')}>Analytics Studio</NavLink>
            {canManageTeam && (
              <NavLink to="/team" className={({ isActive }) => (isActive ? 'active' : '')}>Team</NavLink>
            )}
            <NavLink to="/security" className={({ isActive }) => (isActive ? 'active' : '')}>
              {canManageSecurity ? 'Security' : 'My Account'}
            </NavLink>
            <a href="/checkin" target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>
              Employee check-in link ↗
            </a>
          </nav>
          <div className="admin-info">
            Signed in as {adminName}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {ROLE_LABELS[role] || role}
            </div>
            <div>
              <GlassButton variant="secondary" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
                Log out
              </GlassButton>
            </div>
          </div>
        </GlassNavbar>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
