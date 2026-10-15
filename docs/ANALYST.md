# Analytics Studio — data analyst guide

## Getting access
A super admin creates the analyst under **Team → add member → role "Data analyst"**. After login the analyst lands in
**Analytics Studio** (menu). Everything is **read-only** on live data; no API key is needed in the browser.

If the analyst forgets their password and email isn't set up on the server, the super admin opens **Team** and uses
**Reset link** (copy and send it), **Set password** (temporary password) or **Reset 2FA** (lost phone).

## Tabs
| Tab | What it gives you |
|---|---|
| **Overview** | KPI cards (present, late, hours, overtime, penalties, remote share, net payroll) and 7 charts: attendance trend, weekday pattern, hours, office-vs-remote, department hours/lateness, payroll by department. Periods: 7/30/90/180 days. |
| **Explore** | Any dataset as a table: multiple filters (equals, contains, greater than, empty…), search, sort, show/hide columns, pagination, **CSV / JSON export**. |
| **Pivot & charts** | Pick rows, optional column split, measure and aggregate (sum, average, count, min, max, median) → pivot table + bar/line/pie chart + CSV. |
| **Insights** | Automatic findings: repeat late-comers, missing check-outs, worst weekday, department comparison, under-hours, heavy overtime, penalty waivers by person, office vs remote hours, unusual salaries (z-score), data-quality flags. |
| **Statistics** | pandas-style `describe()`, `isnull().sum()`, and a colour-coded correlation matrix. |
| **Code** | Ready Python (pandas), R and Power Query snippets for the exact table + filters on screen. |
| **Saved views** | Save dataset + range + filters + pivot; keep private or share with the team; reopen in one click. |

## Datasets
`payroll_sheet` (the notebook layout — see below) · `daily_summary` (one row per day) · `employee_scorecard` (one row per employee)
· `attendance_daily` · `payroll_monthly` (detailed) · `adjustments` (bonuses/deductions) · `leave` · `employees`.
Attendance-based sets default to the last 90 days and accept ranges up to ~800 days.

## The payroll sheet (`payroll_sheet`) — matches the notebook
| Column | How it is filled |
|---|---|
| Employee ID / Name / Department / Month | from the employee record, month = YYYY-MM |
| Working Days | Mon–Fri days in the month |
| Present Days | days present (a half day counts 0.5) |
| Absent Days | days marked absent |
| Leave Days | all leave taken (paid + unpaid) |
| Overtime Hours | per day, hours beyond the standard day (Payroll → rules, default 8 h) |
| Basic Salary | monthly salary, or for hourly staff hours × rate + paid-leave pay |
| Overtime Pay | OT hours × hourly equivalent × multiplier (0 = tracked, not paid) |
| Gross Salary | Basic + Overtime Pay + Bonus |
| Total Deduction | unpaid-leave deduction + late penalties + other deductions |
| Net Salary | Gross − Total Deduction (equals the payslip net) |

## Scope of access
The analyst can read every table above, including salaries and penalties. Not available to any role through the studio:
passwords, face data, 2FA secrets and login tokens. Changing data (attendance, pay, employees) stays with admins/super admins.

## Import & clean-up (CSV → live database)
Tab **Import & clean-up**. Flow: pick what you are importing → **Download template** or **Download current data** → clean it in Excel / pandas →
upload → **Preview** (nothing is saved) → review → **Apply** → **Undo** later if needed (Import history).

| Import | Key | Columns you can set |
|---|---|---|
| Employees | employeeId | name, email, phone, department, designation, joiningDate, employmentType (onsite/hybrid/remote), hybridOfficeDays (Mon,Tue…), payType (monthly/hourly), hourlyRate, monthlySalary, paidLeavesPerMonth, status (active/inactive) |
| Attendance | employeeId + date | checkIn, checkOut (09:30 / 9:30 AM / ISO), status (present, checked_out, absent, leave, half_day), workMode, leaveType (auto/paid/unpaid), remarks |
| Bonuses & deductions | employeeId + month + type + amount + reason | add-only; an identical existing entry is skipped so a re-upload can't pay twice |

**Cleaning done for you:** header spelling/case/spaces, ₹ and commas in money, On-site/WFH/half day spellings, DD/MM/YYYY dates (day first), lower-cased emails, trimmed text.
**Blank cell = leave unchanged** (never erases). Unknown columns are ignored and listed. Max 3,000 rows per file.

**Safety:** preview-then-apply (the server re-checks the file hasn't gone stale); rows with errors block the import unless you choose "apply valid rows only";
anything touching pay, hours or status needs you to type APPLY; a crash mid-import rolls everything back automatically; every import is stored with the old values
and can be **undone** by whoever ran it or a super admin (records edited after the import are skipped, not overwritten); every apply/undo is in the audit log.
Late penalties for imported check-ins are calculated by the normal rules. A super admin can switch analyst imports off (Payroll → rules → "Allow analyst CSV imports").

**Not importable:** passwords, face data, 2FA, admin accounts. New employees have no portal password or face until an admin sets them.
**Reflects where?** The app, payroll, Analytics Studio and the Power BI *live* feed show it immediately; the reporting warehouse after its nightly sync (or "Sync now").
