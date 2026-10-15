# Phase 3 — changing Attendai from a Power BI dashboard (audited write-back)

Power BI itself can't edit data. The standard pattern is a **Power Apps visual** (or a button that starts a
**Power Automate flow**) inside the report. It sends a small JSON request to Attendai, which validates and applies it.

## What can be changed (and nothing else)
| Action | Endpoint | Body |
|---|---|---|
| Waive / restore a late penalty | `POST /api/bi-write/penalty` | `employeeId`, `date` (or `attendanceId`), `action` = `waive`/`restore`, `reason` (required to waive), `actor` |
| Add a bonus or deduction | `POST /api/bi-write/adjustment` | `employeeId`, `month` (YYYY-MM), `type` = `bonus`/`deduction`, `amount`, `reason`, `actor` |
| Change an hourly rate | `POST /api/bi-write/hourly-rate` | `employeeId`, `hourlyRate`, `reason`, `actor` |
| See what was changed from dashboards | `GET /api/bi-write/changes?format=csv` | – |

Attendance times, approved leave, monthly salaries, pay type and face data **cannot** be changed from a dashboard.

## Safety rules built in
- **Separate write key** (`REPORTING_WRITE_KEY`), sent as header `x-api-key`. The report's *read* key can never write.
- **`actor` is mandatory** (use the signed-in user's email, `User().Email` in Power Apps). Stored as "Power BI · email".
- **Audit log:** every change is saved with actor, time, old/new value, `source = powerbi`. Penalties waived this way show the actor's name on the Attendance page.
- **Limits:** bonus/deduction ≤ `WRITEBACK_MAX_AMOUNT` (₹50,000), hourly rate ≤ `WRITEBACK_MAX_HOURLY_RATE` (₹5,000). Larger changes must be done in the Attendai app.
- **Month lock:** only this month and `WRITEBACK_MONTHS_BACK` earlier months (default 1) are editable; future months are refused.
- **Reason required** for waivers, bonuses, deductions and rate changes.
- **Retry-safe:** send a unique `requestId` (e.g. a GUID). A repeated request is ignored, so a retried flow can't pay a bonus twice.
- Hourly-rate changes are refused for employees paid monthly.

## Turn it on
1. Generate a *different* secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set `REPORTING_WRITE_KEY` on the backend (optionally the three limits) and redeploy.
3. Test:
```
curl -X POST https://YOUR-BACKEND/api/bi-write/adjustment \
  -H "x-api-key: YOUR_WRITE_KEY" -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP001","month":"2026-10","type":"bonus","amount":500,"reason":"Test","actor":"you@company.com","requestId":"test-001"}'
```
Then open Payroll → that month: the bonus is there. Repeating the same `requestId` returns "Already applied".

## Power Automate flow (simplest)
1. Power Automate → **Instant flow** → trigger **Power BI button clicked** (or *Power Apps*).
2. Action **HTTP**: Method `POST`, URI `https://YOUR-BACKEND/api/bi-write/penalty`,
   Headers `x-api-key` = write key, `Content-Type` = `application/json`,
   Body:
```json
{ "employeeId": "@{triggerBody()?['employeeId']}", "date": "@{triggerBody()?['date']}",
  "action": "waive", "reason": "@{triggerBody()?['reason']}",
  "actor": "@{triggerOutputs()?['headers']?['x-ms-user-email']}",
  "requestId": "@{guid()}" }
```
3. Keep the key out of the flow text: store it in an environment variable / Azure Key Vault connection.
4. Power BI: add the **Power Automate visual**, pick the flow, and bind `employeeId` / `date` to the selected row of `attendance_daily`.

For a form (reason box, amount), use a **Power Apps visual** instead and call the same flow from a button.

## Licensing & hosting notes
- The **HTTP** action and custom connectors are *Premium* in Power Automate/Power Apps — users need the matching licence.
- The backend must be reachable over public HTTPS.

## After a change
- **Live feed** (`/api/bi`): the new value appears on the next report refresh.
- **Warehouse** (`source=warehouse`): attendance of the last 7 days and the current/previous month of payroll refresh at the next nightly sync (or press *Sync now* on the Payroll page).
- **Caveat — hourly rates are not versioned.** Pay is calculated live from the employee's *current* rate, so changing a rate also re-prices the still-open months (this and last). Months already synced to the warehouse keep the old figures until re-synced.
