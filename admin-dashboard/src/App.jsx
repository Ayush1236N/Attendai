import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import EmployeeDetail from './pages/EmployeeDetail.jsx';
import FaceRegistration from './pages/FaceRegistration.jsx';
import Attendance from './pages/Attendance.jsx';
import Payroll from './pages/Payroll.jsx';
import LeaveRequests from './pages/LeaveRequests.jsx';
import Analytics from './pages/Analytics.jsx';
import Team from './pages/Team.jsx';
import Security from './pages/Security.jsx';
import DataWorkspace from './pages/DataWorkspace.jsx';
import EmployeeLayout from './pages/EmployeeLayout.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import EmployeeLeave from './pages/EmployeeLeave.jsx';
import EmployeeEarnings from './pages/EmployeeEarnings.jsx';
import EmployeeAccount from './pages/EmployeeAccount.jsx';
import CheckInKiosk from './pages/CheckInKiosk.jsx';

function RequireAuth({ children }) {
  const token = localStorage.getItem('admin_token');
  return token ? children : <Navigate to="/login" replace />;
}

function RequireEmployeeAuth({ children }) {
  const token = localStorage.getItem('employee_token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public, no-login link employees open on any phone or laptop to
          scan their face and mark attendance. */}
      <Route path="/checkin" element={<CheckInKiosk />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="employees/:id/register-face" element={<FaceRegistration />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="leave-requests" element={<LeaveRequests />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="data-workspace" element={<DataWorkspace />} />
        <Route path="team" element={<Team />} />
        <Route path="security" element={<Security />} />
      </Route>

      <Route
        path="/employee"
        element={
          <RequireEmployeeAuth>
            <EmployeeLayout />
          </RequireEmployeeAuth>
        }
      >
        <Route index element={<EmployeeDashboard />} />
        <Route path="leave" element={<EmployeeLeave />} />
        <Route path="earnings" element={<EmployeeEarnings />} />
        <Route path="account" element={<EmployeeAccount />} />
      </Route>
    </Routes>
  );
}
