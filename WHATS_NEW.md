# What's new in this update

This update fixes the mobile app login bug and adds self-service email,
forgot-password, two-factor authentication, login/logout activity tracking,
and salary deduction on leave. See `docs/DOCUMENTATION.md` for the original
system documentation — this file only covers what changed.

## 1. Mobile app login bug — fixed

`employee-app/screens/LoginScreen.js` was an **empty file**, and `App.js`
never rendered it — the employee app had no login at all, even though the
backend's `/auth/employee-login` endpoint already existed. That's why login
"showed an error": there was no login screen.

Added a full "My Account" flow to the mobile app (separate from the
password-free face check-in/out, which is unchanged):
- `LoginScreen.js`, `TwoFactorScreen.js`, `ForgotPasswordScreen.js`,
  `ProfileScreen.js`, `MyAttendanceScreen.js`
- Session token stored encrypted via `expo-secure-store`
- Reachable from a new "My Account →" link on the Home screen

**Before running the app**, set `EXPO_PUBLIC_API_URL` to your computer's LAN
IP (not `localhost` — the phone can't reach your computer's localhost):
```
EXPO_PUBLIC_API_URL=http://192.168.1.10:5000/api npx expo start
```

## 2. Employees can add their own email + reset their password by email

- `PUT /api/employees/me/email` (employee login required) — add/update your
  own email. This is what the forgot-password flow sends the link to.
- `POST /api/auth/employee-forgot-password` → emails a reset link
- `POST /api/auth/employee-reset-password` → sets the new password
- Same pair of endpoints exists for admins (`/auth/forgot-password`,
  `/auth/reset-password`)
- On the admin dashboard, both are wired up at `/forgot-password` and
  `/reset-password`; on mobile, `ForgotPasswordScreen.js`

**Email setup:** configure `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
`SMTP_PASS` in `backend/.env`. If left blank, reset emails are printed to the
backend console instead of sent — useful for testing without a mailbox. For
Gmail, use an "app password", not your normal password.

## 3. Two-factor authentication (2FA) — admins and employees

TOTP-based (works with Google Authenticator, Authy, 1Password, etc):
- `POST /api/auth/2fa/setup` / `/2fa/enable` / `/2fa/disable` (admin)
- `POST /api/auth/employee-2fa/setup` / `/employee-2fa/enable` /
  `/employee-2fa/disable` (employee)
- Login now returns `{ requires2FA: true, challengeToken }` when 2FA is on;
  finish with `POST /api/auth/verify-2fa { challengeToken, code }`
- Admin dashboard: **Security** page. Mobile app: **My Account → set up 2FA**
- To make it mandatory for every employee, set `EMPLOYEE_2FA_REQUIRED=true`
  in `backend/.env` — login responses then flag `twoFactorSetupRequired`

## 4. Login/logout activity ("multiple login/logout" tracking)

New `Session` model records every login and logout (or forced revoke), for
both admins and employees — device, IP, timestamp, active/ended status.
- `GET /api/auth/sessions` (admin only) — list all sessions, filterable
- `POST /api/auth/sessions/:id/revoke` — force-log-out any device
- Logging out now actually invalidates the token server-side (not just
  discarding it client-side)
- Admin dashboard: **Security** page, "Login activity" table

## 5. Salary deduction on leave

- Employee now has `monthlySalary` and `paidLeavesPerMonth` (free leave
  allowance before deductions kick in) — set from the employee's profile
  page in the admin dashboard
- Attendance can be marked `leave` or `half_day` (in addition to the
  existing present/checked_out/absent), including for a day the employee
  never checked in at all, via the new "Mark leave" form on the Attendance
  page (`POST /api/attendance/mark-leave`)
- `GET /api/reports/salary?month=YYYY-MM` — per-employee salary after
  deducting unpaid leave, pro-rated by working days in the month
  (Mon–Fri; no public-holiday calendar). Add `&format=csv` to download.
- Admin dashboard: new **Payroll** page

## Setup checklist

```bash
cd backend
cp .env.example .env   # fill in FRONTEND_URL, SMTP_*, EMPLOYEE_2FA_REQUIRED as needed
npm install             # installs the new nodemailer / speakeasy / qrcode deps
npm run dev
```

Everything else (`admin-dashboard`, `employee-app`, `face-service`) installs
and runs the same way as before — see the main `README.md`.

## Hosting: render.yaml

A `render.yaml` Blueprint at the repo root deploys `face-service`, `backend`,
and `admin-dashboard` together on Render in one go (MongoDB itself isn't
included — use a free MongoDB Atlas cluster). See the comment block at the
top of `render.yaml` for exact steps, or the walkthrough in the chat that
produced this zip.

## 6. Data Analyst role + live analytics + payroll adjustments

A new account role, `data_analyst`, alongside the existing `admin` and
`super_admin` — created by a super_admin from the new **Team** page. It can:
- View **Analytics** — daily attendance trend, department breakdown, and a
  **best performers of the month** leaderboard (`GET /api/analytics/overview`,
  `GET /api/analytics/best-performers`)
- Manage **Payroll** — edit an employee's base salary/paid-leave allowance
  (`PUT /api/payroll/salary/:employeeId`), and add/remove bonuses or manual
  deductions per employee/month (`POST` / `DELETE /api/payroll/adjustments`)
- View (but not edit) Employees, Attendance, and the Dashboard

**Everything the data analyst changes is live data** — bonuses, deductions,
and salary edits write straight to the same `Employee` / `PayrollAdjustment`
collections the salary report and the rest of the app read from. There's no
separate analytics copy of anything.

Admins and super admins see the same Analytics and Payroll pages, plus
everything they already had (Employees, attendance corrections, org-wide
Login Activity). Only super admins see **Team** (creating/disabling other
admin or data-analyst accounts).

## 7. Change your own admin email/password

Any admin-model account (admin, super_admin, or data_analyst) can now change
their own email and password from **Security** (labeled **My Account** for
data analysts) — `PUT /api/auth/me/email` and `PUT /api/auth/me/password`.
See `CHANGE_ADMIN_CREDENTIALS.md` for the full how-to.

## More docs

- `APP_FLOW.md` — how the whole system fits together and who does what
- `DEPLOY_VERCEL_EXPO.md` — deploying the dashboard on Vercel and the mobile
  app via Expo/EAS
- `CHANGE_ADMIN_CREDENTIALS.md` — changing admin email/password

## 8. Mobile check-in is now login-first, tied to your own face

Previously the mobile app's Check In/Check Out went straight to an open,
unauthenticated scan (matched against every registered employee — a "kiosk"
model). Now the home screen leads with **LOG IN TO CHECK IN / OUT**:

- Employee signs in (Employee ID + password, +2FA if enabled)
- CHECK IN / CHECK OUT then verify their face against **only their own**
  registered face (`POST /api/attendance/me/check-in` /
  `.../me/check-out`, both `employeeAuth`-protected) — not a lookup across
  the whole roster
- Staying logged in persists between app opens (via the existing secure
  token storage), so this is a one-time sign-in, not per check-in
- The old open/kiosk behavior (scan without logging in, matched against
  everyone) is still available from **Use shared kiosk instead** on the home
  screen, for a shared front-desk tablet scenario — both flows write to the
  exact same `Attendance` records

## 9. Analytics bug fixes + richer fields, and a glass UI theme

**Bugs fixed:**
- The daily attendance trend was counting **every** attendance status
  (including absent/leave) as "present" — inflating the chart. Now only
  present/checked-out days count as present, with absent/leave/half-day
  tracked separately.
- The department breakdown was silently hardcoded to **today only**,
  regardless of which month was selected elsewhere on the page. It now
  reflects the actual selected month.
- The analytics queries ran one database lookup **per employee** (an N+1
  pattern). Rewritten to run a single query for all employees and a single
  query for the month's attendance records, then compute everything in
  memory — faster and easier to reason about.

**New fields/features on the Analytics page:**
- Department filter (applies to the trend, breakdown, and leaderboards)
- Monthly attendance rate, total leave/absent/half-days, working days —
  alongside the existing "today" snapshot
- **Payroll impact this month** — gross salary, leave deductions, bonuses,
  and net payable, pulled live from the Payroll module
- Multi-line daily trend (present / absent / leave, not just present)
- Department breakdown table with an attendance-rate column, alongside the chart
- **Needs attention** list (most absences/leave this month) next to Best Performers
- "Download full ranking (CSV)" export

**UI:** the admin dashboard now uses a proper glassmorphism theme — vivid
colorful gradient backdrop, frosted/blurred translucent panels with a thin
bright top edge on every card, sidebar, input, and button, applied
consistently through `index.css` so it covers every page automatically.

## 10. Apple "Liquid Glass" look (liquid-glass-react)

The admin dashboard's whole UI now runs on the `liquid-glass-react` library
(real-time SVG displacement/refraction, not just a CSS blur) via three
reusable wrappers in `src/components/glass/`:

- **GlassCard** — every panel, stat card, modal, and the login card
- **GlassButton** — every button in the app. It renders a real, unstyled
  `<button>` around the glass visual, so `type="submit"`, `disabled`, and
  keyboard activation all still work exactly as before — only the look
  changed. A `variant` prop (`primary` / `secondary` / `danger`) replaces the
  old `.btn` / `.btn.secondary` / `.btn.danger` classes.
- **GlassNavbar** — the sidebar (admin) and the employee-portal sidebar

**Requires React 19** (`liquid-glass-react`'s peer dependency) — the
dashboard's React/React-DOM were upgraded from 18 to 19; `react-router-dom`
and `recharts` already support it, so nothing else changed.

**Fallback:** every glass element keeps its original CSS class (`panel`,
`stat-card`, `login-card`, `sidebar`) alongside the new glass wrapper, so on
Safari/Firefox — where the library's displacement effect doesn't render —
the existing `backdrop-filter: blur()` + translucent background still makes
it look like frosted glass, just without the liquid refraction.

Not wrapped in glass, by design: the live camera `<video>` feed (check-in
kiosk, face registration) and long attendance/table rows — only the
containing surfaces around them are glass, per the library's own guidance
that large/scrolling content shouldn't get the effect.

## 11. Two separate mobile apps, leave requests, and confirmed multi-user login

**The mobile app is now split into two independent Expo projects:**

- **`employee-app/` ("Attendai")** — the personal app, for an employee's own
  phone. Always login-gated: sign in, then CHECK IN/CHECK OUT (verified
  against *your own* registered face only), view your attendance, apply for
  leave, manage your account. The old "Use shared kiosk instead" fallback
  has been removed from this app entirely.
- **`employee-app-kiosk/` ("Attendai Kiosk")** — a separate, minimal app for
  a shared device (e.g. a tablet at the entrance). No login, no accounts, no
  leave — just a live clock, a greeting, and CHECK IN/CHECK OUT that matches
  the scanned face against every registered employee. Install this one on
  the shared device; install `employee-app` on each employee's own phone.

Both talk to the same backend and write to the same `Attendance` collection
— a company can run either, or both side by side.

**New: employee-initiated leave requests, with admin approval.**
- Mobile app → Profile → **Apply for Leave / My Requests**: employees submit
  a date range, type (full/half day), and reason, and can track each
  request's status (pending/approved/rejected) with any admin remarks.
- Admin dashboard → new **Leave Requests** page (admin/super_admin only):
  review, approve, or reject, with optional remarks.
- **Approving a request automatically marks every date in the range as
  'leave' or 'half_day' on that employee's Attendance record** — the exact
  same write path as the existing "Mark leave" tool on the Attendance page —
  so it flows straight into the Payroll module's leave-deduction calculation
  with no extra step.
- New backend: `LeaveRequest` model, `leaveService.js`,
  `POST /api/leave-requests`, `GET /api/leave-requests/me`,
  `GET /api/leave-requests`, `PUT /api/leave-requests/:id/decision`.

**Confirmed: multiple employees can log in at the same time.** Checked the
actual session code to be sure rather than assuming — every login
(`authService.issueAccessToken`) just inserts a new `Session` row; nothing
anywhere checks for or invalidates another user's existing session. Two,
ten, or a hundred employees can be logged into the personal app on their own
phones simultaneously, fully independently. (The only existing cross-session
effect is deliberate: changing your own password logs out your *other*
devices, for security — never anyone else's.)
