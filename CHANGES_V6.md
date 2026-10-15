# Attendai v6 — what changed

## Fixes
- **2FA on the web login now works.** The login page used the admin API client, whose
  401 handler reloads the page — so a wrong code/password wiped the 2FA screen. Login now uses
  the public client. TOTP tolerance widened to ±60s; login/2FA endpoints are rate-limited.
- **Employees can set up / turn off 2FA** on web (My Account) and mobile (Account tab). Admin Security
  page now shows 2FA status and has a "Turn off" option.
- **Failed face scan no longer logs you out.** It used HTTP 401 (= "session expired"); it is now 422.
- **Camera is back on the web Employee tab** (Attendance page): Check in / Check out with face scan
  against the logged-in employee's own face.
- **Timezone bug:** "today" and late checks now use `TIMEZONE` (default Asia/Kolkata), not the server's UTC.
- CSV downloads (Payroll / Attendance) now send the login token (they silently failed before).

## Mobile app (employee-app)
Separate **Login page** (front door) → tabs: **Attendance** (camera check in/out, live hours, late
penalty) · History · Leave · Earnings · Account (2FA, email, password, logout).

## Employee types & pay
- Type: **On-site / Hybrid / Remote**. Hybrid has chosen office days (default Mon–Wed); other days are remote.
- Pay: **Monthly** or **Hourly** (hourly rate × hours worked).
- Hours = check-out − check-in, stored per day and totalled per month.

## Payroll rules
- Hourly gross = hours × rate + paid-leave days × standard hours × rate.
- Monthly gross = salary; unpaid leave deducted at salary ÷ Mon–Fri working days.
- Leave pay: admin chooses **Auto / Paid / Unpaid** when approving (or marking) leave.
  Auto = paid within the employee's monthly allowance. **Absent days are always unpaid.**
- **Late penalty:** office days only (remote exempt). Rules (start time, grace, ₹ amount, standard hours)
  are edited by a super admin on the Payroll page. Only **admin / super admin** can waive or restore a
  penalty (Attendance page); every action is audit-logged.
- Net = gross − leave deduction − unwaived penalties + bonus − other deductions.

## New / changed API
`GET /attendance/me/today` · `PUT /attendance/:id/penalty` {action: waive|restore, reason} ·
`GET /payroll/me?month=` · `GET|PUT /settings` · `GET /auth/me` · `PUT /auth/employee-me/password`

## Notes
- Existing employees default to On-site + Monthly; set Hourly/Hybrid/Remote in Edit profile.
- Default penalty is ₹100 per late arrival — change it (or set 0) on the Payroll page.
- Days with no attendance record are not auto-marked absent for monthly staff (same as before);
  hourly staff are naturally unpaid for them.
- Run payroll unit tests: `cd backend && npm install && node --test test/`
- Face scan needs HTTPS (or localhost) in the browser to access the camera.

## Email password reset + 2FA (update)
- Forgot-password: email lookup is now case-insensitive; a mail-server failure is logged instead of returning a 500.
- Mobile reset screen accepts the whole emailed link or just the token.
- Super admin: Payroll page → "Email check" sends a test email (`POST /api/settings/test-email`).
- `EMPLOYEE_2FA_REQUIRED=true` (render.yaml + .env.example): employees are sent to set up 2FA right after login.
- **To receive emails you MUST set SMTP_HOST / SMTP_USER / SMTP_PASS (+ FRONTEND_URL).** Gmail: smtp.gmail.com, port 587,
  and a Google "App password" (needs 2-Step Verification on that Google account). Without them emails are only printed in the server log.
- Google Authenticator works as the 2FA app (any TOTP app does).

## Analytics pipeline (Power BI) — Phase 1
- Read-only feed `GET /api/bi/{employees|attendance_daily|payroll_monthly|leave}` (CSV or JSON), protected by `REPORTING_API_KEY`
  (`x-api-key` header). Off until the key is set. Optional instant push of check-ins to a Power BI streaming dataset (`POWERBI_PUSH_URL`).
- Setup, Power Query code, DAX measures and refresh guide: `docs/POWERBI.md`. Tests: `backend/test/bi.test.js`.
- Phase 2: nightly reporting warehouse (report_* collections), 'Sync now' on Payroll page, '?source=warehouse' on the BI feed. Env: WAREHOUSE_SYNC_HOUR (default 2, 'off' disables). See docs/POWERBI.md §8.

## Phase 3 — audited write-back from Power BI
- `POST /api/bi-write/{penalty|adjustment|hourly-rate}` and `GET /api/bi-write/changes`, protected by a separate `REPORTING_WRITE_KEY`.
- Mandatory actor + reason, amount/rate caps, month lock, retry-safe `requestId`, all audit-logged (`source: powerbi`).
- Guide: `docs/POWERBI_WRITEBACK.md`. Tests: `backend/test/biwrite.test.js`.

## Fix: broken/ghosted login page and buttons
- The `liquid-glass-react` effect (cards + buttons) rendered doubled text, an off-centre/clipped card, a missing
  "Employee" tab and blank button labels on some screens. Replaced with plain CSS glass (same look: blur, translucency,
  gold buttons) in `components/glass/*`; removed the dependency. 3D tilt now only affects small stat tiles.

## Data analyst workspace + overtime
- New **Data Workspace** page (analyst/admin/super admin): load, search, sort, describe()/missing-values, chart, CSV, Jupyter snippet.
- New dataset `payroll_sheet` in the analyst's exact notebook columns (also at `/api/bi/payroll_sheet` for Power BI/Jupyter).
- **Overtime** (hours beyond standard day) tracked in payroll; paid only if Payroll → rules → "Overtime pay multiplier" > 0 (default 0).
- Analysts land on the workspace after login. Guide: `docs/ANALYST.md`. Tests: `backend/test/sheet.test.js`, 2 new overtime tests.

## Password recovery for team members (incl. data analysts)
- Team page (super admin): **Reset link** (copyable; also emailed if SMTP is set), **Set password** (temporary), **Reset 2FA**. All audit-logged.
- Forgot-password pages now say clearly when the server cannot send email.

## Analytics Studio (replaces the simple Data Workspace)
- Tabs: Overview (KPIs + 7 charts) · Explore (multi-filter, columns, CSV/JSON) · Pivot & charts · Insights (automatic findings) ·
  Statistics (describe, missing values, correlation) · Code (Python/R/Power Query) · Saved & shareable views.
- New datasets: `daily_summary`, `employee_scorecard`, `adjustments`; attendance rows gain `weekday` and `overtimeHours`; ranges up to ~800 days.
- Tests: `backend/test/summaries.test.js`, `admin-dashboard/test/analytics.test.mjs` (`npm test`).

## CSV import for the data analyst
- Analytics Studio → **Import & clean-up**: employees, attendance, bonuses/deductions. Preview → apply → undo. See docs/ANALYST.md.
- API: `POST /api/analyst/import/preview|apply` (text/csv body), `GET /api/analyst/import/history|template/:target`, `POST /api/analyst/import/:id/undo`.
- Safeguards: preview first, plan-hash check, typed APPLY for pay/hours changes, automatic rollback on failure, undo with before-images, audit log,
  3,000-row cap, super-admin switch `analystImportsEnabled`. Tests: `backend/test/import.test.js`.
