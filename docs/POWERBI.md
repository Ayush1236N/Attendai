# Connecting Power BI to Attendai (live reporting feed)

Attendai exposes a **read-only** feed. Anything changed in the app (a check-in, a waived
penalty, a new hourly rate, an approved leave) appears in Power BI on the next refresh.
Power BI cannot change app data through this feed.

## 1. Switch the feed on (backend)
1. Generate a secret:  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set it on the backend as `REPORTING_API_KEY` (Render: Environment tab; local: `backend/.env`). Redeploy.
3. Check it works (replace URL and key):
   `curl -H "x-api-key: YOUR_KEY" "https://YOUR-BACKEND/api/bi/employees?format=csv"`
   - 503 = key not set on server · 401 = wrong key · CSV text = working.

## 2. Datasets
| Dataset | One row per | Default range | Filters |
|---|---|---|---|
| `employees` | employee | all | – |
| `attendance_daily` | employee per day | last 90 days | `from`, `to` (YYYY-MM-DD) |
| `payroll_monthly` | employee per month | last 6 months | `from`, `to` (YYYY-MM) |
| `leave` | leave request | last 365 days | `from`, `to` (YYYY-MM-DD) |

Add `format=csv` (recommended). No passwords, face data or 2FA secrets are ever included.
`attendance_daily` includes: workMode, checkIn/checkOut (UTC ISO), workedHours, isLate,
minutesLate, penaltyAmount, penaltyWaived, penaltyCharged. `payroll_monthly` includes hours,
grossPay, leaveDeduction, latePenaltyTotal, bonusTotal, netSalary, paid/unpaid leave days.

## 3. Power BI Desktop: Get data → Blank query → Advanced editor
Create one query per dataset. Example for `attendance_daily` (name it `attendance_daily`):

```m
let
    BaseUrl = "https://YOUR-BACKEND/api/bi/",
    ApiKey  = "YOUR_KEY",
    Source  = Csv.Document(
        Web.Contents(BaseUrl, [
            RelativePath = "attendance_daily",
            Query   = [format = "csv", from = "2026-01-01"],
            Headers = [#"x-api-key" = ApiKey]
        ]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    Typed = Table.TransformColumnTypes(Promoted, {
        {"date", type date}, {"workedMinutes", Int64.Type}, {"workedHours", type number},
        {"minutesLate", Int64.Type}, {"penaltyAmount", type number}, {"penaltyCharged", type number},
        {"checkIn", type datetimezone}, {"checkOut", type datetimezone},
        {"isLate", type logical}, {"penaltyWaived", type logical}, {"missingCheckout", type logical}})
in
    Typed
```
Repeat with `RelativePath` = `employees`, `payroll_monthly`, `leave` (adjust the type list; for payroll
use `from = "2026-01"`). Use `RelativePath` + `Query` as shown — it lets the Power BI Service refresh
without the "dynamic data source" error. When asked for credentials choose **Anonymous** (the key is in the header).
Convert times to local with `DateTimeZone.SwitchZone([checkIn], 5, 30)` for IST.

**Relationships:** `employees[employeeId]` → `attendance_daily[employeeId]`, `payroll_monthly[employeeId]`, `leave[employeeId]` (one-to-many).

## 4. Automatic refresh
Publish to the Power BI Service → dataset **Settings → Scheduled refresh**: set credentials to Anonymous, pick up to
8 refreshes/day (Pro) or 48 (Premium). Because the backend is public HTTPS, **no gateway is needed**.
For a hosted free backend that sleeps (Render free), the first refresh may time out — retry or use a paid instance.

## 5. Useful measures (DAX)
```
Total Hours   = SUM(attendance_daily[workedHours])
Late Count    = CALCULATE(COUNTROWS(attendance_daily), attendance_daily[isLate] = TRUE())
Penalty Collected = SUM(attendance_daily[penaltyCharged])
Penalty Waived    = CALCULATE(SUM(attendance_daily[penaltyAmount]), attendance_daily[penaltyWaived] = TRUE())
Remote Share  = DIVIDE(CALCULATE(COUNTROWS(attendance_daily), attendance_daily[workMode]="remote"), COUNTROWS(attendance_daily))
Net Payroll   = SUM(payroll_monthly[netSalary])
Avg Hours/Day = AVERAGEX(FILTER(attendance_daily, attendance_daily[workedHours] > 0), attendance_daily[workedHours])
```
Suggested pages: **Attendance** (daily present, office/remote/hybrid split, late by weekday/department) ·
**Hours** (total/avg, missing check-outs) · **Pay** (cost by department, hourly vs monthly, penalties) ·
**Leave** (paid vs unpaid, trend) · **People** (repeat late-comers).

## 6. Near-real-time tiles (optional)
In Power BI Service create a **Streaming dataset (API)** with fields: event (text), employeeId (text), name (text),
date (text), workMode (text), isLate (Yes/No), minutesLate (number), penaltyAmount (number), workedHours (number),
eventTime (DateTime). Copy its **Push URL** into the backend as `POWERBI_PUSH_URL`. Every check-in/check-out is then
pushed instantly to a dashboard tile (a failure to reach Power BI never blocks check-ins).

## 7. Security
- Treat `REPORTING_API_KEY` like a password; rotate it by changing the env var and updating the report.
- The feed includes salaries and pay: restrict who can open the report; use Power BI **row-level security** for managers.
- Prefer the header over `?key=` (URLs get logged).

## 8. Phase 2 — reporting warehouse (history + speed)
A nightly job copies `attendance_daily` and `payroll_monthly` into dedicated reporting collections
(`report_attendance_daily`, `report_payroll_monthly`) in the same MongoDB — no extra server needed.
- Runs automatically after `WAREHOUSE_SYNC_HOUR` (default 2 = 2 AM, org timezone; `off` disables). The first run backfills ~13 months.
- Super admin can run it any time: Payroll page → **Reporting warehouse** → *Sync now* / *Full backfill*.
- Rows are upserted and **never deleted**, so reports keep history even if a live record is later edited or removed.
  Note: a row reflects the live data as of its last sync (rolling 7 days of attendance, current + previous month payroll are refreshed each night).
- To use it in Power BI add `source = "warehouse"` to the `Query` record, e.g. `Query = [format="csv", source="warehouse", from="2026-01-01"]`.
  Dashboards load faster and don't touch live attendance data. Without `source`, you still get live data.
- Check state: `GET /api/bi/_status` (with the API key).
