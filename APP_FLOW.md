# Attendai — App Flow

One system, four pieces, all reading/writing the same MongoDB database:

```
                    ┌──────────────────┐
                    │     MongoDB       │   ← single source of truth
                    └────────▲──────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
 ┌────────┴───────┐ ┌────────┴────────┐ ┌───────┴────────┐
 │ backend (API)   │ │ face-service    │ │  (called by     │
 │ Node/Express    │◄┤ Python/FastAPI  │ │  backend only)  │
 └────────▲────────┘ └─────────────────┘ └─────────────────┘
          │
   ┌──────┴───────┐        ┌──────────────────┐
   │ admin-        │        │  employee-app     │
   │ dashboard     │        │  (Expo mobile)     │
   │ (React/Vite)  │        └──────────────────┘
   └───────────────┘
```

Every action — an employee checking in, an admin correcting a record, a data
analyst adding a bonus — is a real API call that writes to that one database.
There's no separate "reporting copy" of the data anywhere: what Analytics
shows is a live read of the same Attendance/Employee/PayrollAdjustment
collections everything else uses.

## Who uses what

| Who | Uses | For |
|---|---|---|
| Employee | The public check-in link / kiosk, or the mobile app's Check In/Out screen | Face-recognition attendance — no login needed |
| Employee | Mobile app → **My Account** | Viewing their own attendance history, adding their own email, 2FA, password reset |
| Admin / Super Admin | Admin dashboard | Managing employees, correcting attendance, payroll, security, (super admin only) managing other admin accounts |
| Data Analyst | Admin dashboard (same login page, fewer menu items) | Analytics, salary adjustments, bonuses/deductions — see role breakdown below |

## Roles, in detail

Three account types share the same `Admin` collection and the same login
page (`/login`) — what they can do differs by `role`:

- **`super_admin`** — everything, plus the only one who can create/disable
  other admin or data-analyst accounts (**Team** page).
- **`admin`** — manage employees (add/edit/deactivate, register faces),
  correct attendance, manage payroll, view analytics, view org-wide login
  activity. Cannot manage other admin accounts.
- **`data_analyst`** — a narrower, payroll-and-insight-focused role. Can:
  - View the Dashboard, Attendance (read-only — no corrections), and
    Analytics
  - View and download the Payroll report
  - Add/edit an employee's base salary
  - Add bonuses or manual deductions for any employee/month
  - Cannot add/remove employees, correct attendance, manage other accounts,
    or see org-wide login activity (only their own account's security)

All three change their own email/password and set up 2FA from the same
**Security** page (labeled **My Account** for data analysts, since the rest
of that page is hidden from them).

## Employee attendance flow — two separate mobile apps

There are two ways to check in/out, both producing the exact same
`Attendance` record — which one you use depends on which app is installed:

**A. `employee-app` ("Attendai") — personal app, on the employee's own phone**
1. Employee opens the app → **LOG IN TO CHECK IN / OUT**
2. Signs in with their Employee ID + password (and a 2FA code, if enabled)
3. Taps **CHECK IN** or **CHECK OUT** → camera opens → face is verified
   against **only that employee's own registered face** (not the whole
   roster) → attendance is recorded
4. They stay logged in between app opens — and since each login is an
   independent session, any number of employees can be logged into this
   app on their own separate phones at the same time
5. This is also where **Apply for Leave**, **My Attendance**, and account
   settings (email, password, 2FA) live — see below

**B. `employee-app-kiosk` ("Attendai Kiosk") — a separate app for a shared device**
1. Installed on a tablet/phone that sits at a front desk or entrance — no
   login screen at all, just a live clock, a greeting, and two buttons
2. Anyone scans their face → matched against **every** registered
   employee's face to figure out who it is
3. Same result — an `Attendance` record for whoever matched

Both apps (plus the admin dashboard's public check-in kiosk page) use the
same face-matching engine (`face-service`) and write to the same
`Attendance` collection — the only difference is whether the search is
narrowed to one specific logged-in employee (personal app) or open to
everyone (kiosk app / kiosk web page). A company can deploy just the
personal app, just the kiosk, or both side by side.

## Employee self-service flow (mobile "My Account")

1. Employee logs in with the Employee ID + password an admin set for them
   (`Employees` page → set credentials)
2. If 2FA is enabled on their account, they're prompted for a 6-digit code
3. Once in: **CHECK IN**/**CHECK OUT** right from the home screen (verified
   against their own face only), view attendance history, **apply for leave**
   and track its status, add/update their own email (needed so "forgot
   password" has somewhere to send the link), set up 2FA

## Leave request flow

1. Employee (mobile app → Profile → Apply for Leave) submits a date range,
   type (full/half day), and reason
2. Request sits as `pending` until an admin or super_admin reviews it on the
   dashboard's **Leave Requests** page (the data_analyst role does not see
   this page — approving leave is an admin-level action, same as attendance
   corrections)
3. On **approve**, the backend writes an `Attendance` record (`leave` or
   `half_day`) for every date in the range — the exact same code path as the
   Attendance page's "Mark leave" tool — so it's automatically picked up by
   that month's Payroll leave-deduction calculation
4. On **reject**, nothing changes in Attendance; the employee just sees the
   rejected status (and any admin remarks) in their request history
5. Either way, the employee can see the decision next time they open
   Apply for Leave → My Requests in the mobile app

## Payroll flow (the core of "data analytics directly changes real data")

1. Every employee has a `monthlySalary` and `paidLeavesPerMonth` (free leave
   allowance before deductions start)
2. Each month, the system automatically counts present/absent/leave/half-day
   days from real `Attendance` records and calculates a **leave deduction**
3. An admin or data analyst can then add:
   - A **bonus** (e.g. performance bonus) — adds to that month's pay
   - A **manual deduction** (e.g. late penalty) — subtracts from that month's pay
   - Or edit the base salary / paid-leave allowance directly
4. All of this is visible immediately in the same Payroll report — the
   number displayed *is* the number stored, recalculated live on every load
5. Everything is downloadable as CSV, and every change is written to the
   `AuditLog` collection (who changed what, when)

## Analytics flow

- **Daily attendance trend** and **department breakdown** — read straight
  from `Attendance`/`Employee` for the selected month
- **Best performers of the month** — ranks employees by
  `present − absent − 0.5×(leave + half-days)` for the selected month
- Both admin and data-analyst roles see this page; nothing here is exportable
  as a separate "snapshot" — refresh the page and you're looking at current data

## Two-factor authentication & sessions

- Any admin-model account (super_admin/admin/data_analyst) or employee can
  turn on TOTP-based 2FA from their own Security/My Account/Profile page
- Every login and logout is recorded (`Session` collection) with device/IP —
  admins and super admins can see and force-log-out any session from
  **Security → Login activity**
- Logging out (or being force-logged-out) invalidates the token
  server-side immediately, not just on that device

## Where things live in the code

| Feature | Backend | Frontend |
|---|---|---|
| Roles & permissions | `models/Admin.js`, `middleware/roleMiddleware.js` | `components/Layout.jsx` (nav), each page checks `localStorage.admin_role` |
| Payroll & adjustments | `services/payrollService.js`, `routes/payrollRoutes.js` | `pages/Payroll.jsx` |
| Analytics | `services/analyticsService.js`, `routes/analyticsRoutes.js` | `pages/Analytics.jsx` |
| Team management | `controllers/adminController.js`, `routes/adminRoutes.js` | `pages/Team.jsx` |
| 2FA | `utils/twofactor.js` | `pages/Security.jsx`, mobile `ProfileScreen.js` |
| Sessions / login activity | `models/Session.js`, `services/authService.js` | `pages/Security.jsx` |
| Employee self-service | `employeeAuthMiddleware.js`, `/employees/me*` routes | mobile app screens |
| Leave requests | `models/LeaveRequest.js`, `services/leaveService.js`, `routes/leaveRoutes.js` | `pages/LeaveRequests.jsx` (admin), mobile `LeaveScreen.js` |
| Kiosk (shared device) attendance | `routes/attendanceRoutes.js` (`/attendance/check-in`, open) | separate `employee-app-kiosk/` project |

See `WHATS_NEW.md` for the change log of everything added on top of the
original attendance system, and `CHANGE_ADMIN_CREDENTIALS.md` for the
credential-change how-to.
