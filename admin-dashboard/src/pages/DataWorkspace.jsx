import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import client from '../api/client';
import { GlassCard, GlassButton } from '../components/glass/index.js';
import { currentMonth } from '../lib/format.js';
import {
  columnsOf, numericColumns, describe, correlationMatrix, applyFilters, OPS, AGGS, pivot, toCsvText, downloadText, fmt, aggregate,
} from '../lib/analytics.js';
import { buildInsights } from '../lib/insights.js';
import ImportTab from '../components/studio/ImportTab.jsx';

// ANALYTICS STUDIO — the data analyst's workspace. Everything is read-only and
// uses the analyst's normal login. Tabs: Overview · Explore · Pivot · Insights ·
// Statistics · Code, plus saved views the analyst can share with the team.

const COLORS = ['#c9903f', '#3ecf8e', '#9b8cff', '#6fd9c7', '#e2665f', '#e0b25a', '#7aa2f7', '#f08fc0'];
const AX = { fill: '#b7a591', fontSize: 11 };
const PAGE = 50;
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

function Kpi({ label, value, hint, tone }) {
  return (
    <GlassCard className={`stat-card ${tone || ''}`}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 24 }}>{value}</div>
      {hint && <div className="sub" style={{ fontSize: 11.5, marginTop: 2 }}>{hint}</div>}
    </GlassCard>
  );
}

function SimpleTable({ columns, rows, max = 100 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, max).map((r, i) => <tr key={i}>{columns.map((c) => <td key={c}>{fmt(r[c])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const Chart = ({ children, height = 280 }) => <div style={{ width: '100%', height }}><ResponsiveContainer>{children}</ResponsiveContainer></div>;

// ---------------------------------------------------------------- Overview
function Overview({ p }) {
  const { daily, scorecard, payroll } = p;
  const days = daily.length;
  const totalPresent = daily.reduce((a, d) => a + d.employeesPresent, 0);
  const totalLate = daily.reduce((a, d) => a + d.late, 0);
  const remote = daily.reduce((a, d) => a + d.remote, 0);
  const hours = daily.reduce((a, d) => a + d.totalHours, 0);
  const deptHours = useMemo(() => {
    const g = {}; scorecard.forEach((e) => { const k = e.department || '—'; (g[k] = g[k] || []).push(e.avgHoursPerDay); });
    return Object.entries(g).map(([name, v]) => ({ name, avgHours: aggregate(v, 'mean') }));
  }, [scorecard]);
  const deptLate = useMemo(() => {
    const g = {}; scorecard.forEach((e) => { const k = e.department || '—'; g[k] = (g[k] || 0) + e.lateCount; });
    return Object.entries(g).map(([name, late]) => ({ name, late }));
  }, [scorecard]);
  const weekday = useMemo(() => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => {
    const ds = daily.filter((d) => d.weekday === w);
    return { weekday: w, avgPresent: ds.length ? aggregate(ds.map((d) => d.employeesPresent), 'mean') : 0, avgLatePct: ds.length ? aggregate(ds.map((d) => d.latePct), 'mean') : 0 };
  }), [daily]);
  const pay = useMemo(() => {
    const g = {}; payroll.forEach((r) => { const k = r.Department || '—'; g[k] = (g[k] || 0) + Number(r['Net Salary']); });
    return Object.entries(g).map(([name, net]) => ({ name, net: Math.round(net) }));
  }, [payroll]);
  const mode = [{ name: 'Office', value: totalPresent - remote }, { name: 'Remote', value: remote }].filter((m) => m.value > 0);
  const netTotal = payroll.reduce((a, r) => a + Number(r['Net Salary']), 0);

  return (
    <>
      <div className="stat-grid">
        <Kpi label="Employees tracked" value={scorecard.length} hint={`${days} day(s) of data`} />
        <Kpi label="Avg present per day" value={days ? Math.round(totalPresent / days) : 0} tone="present" />
        <Kpi label="Late arrivals" value={totalLate} tone="late" hint={`${totalPresent ? ((totalLate / totalPresent) * 100).toFixed(1) : 0}% of check-ins`} />
        <Kpi label="Avg hours / person-day" value={totalPresent ? (hours / totalPresent).toFixed(2) : 0} hint={`${Math.round(hours).toLocaleString('en-IN')} total hours`} />
        <Kpi label="Overtime hours" value={Math.round(daily.reduce((a, d) => a + d.overtimeHours, 0))} />
        <Kpi label="Penalties charged" value={`₹${Math.round(daily.reduce((a, d) => a + d.penaltyCharged, 0)).toLocaleString('en-IN')}`} tone="absent" hint={`₹${Math.round(daily.reduce((a, d) => a + d.penaltyWaived, 0)).toLocaleString('en-IN')} waived`} />
        <Kpi label="Remote share" value={`${totalPresent ? ((remote / totalPresent) * 100).toFixed(0) : 0}%`} />
        <Kpi label="Net payroll (this month)" value={`₹${Math.round(netTotal).toLocaleString('en-IN')}`} hint={`${payroll.length} employees`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Attendance trend</h3>
          <Chart><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="date" tick={AX} /><YAxis tick={AX} /><Tooltip /><Legend />
            <Line type="monotone" dataKey="employeesPresent" name="Present" stroke="#3ecf8e" dot={false} />
            <Line type="monotone" dataKey="late" name="Late" stroke="#e0b25a" dot={false} />
            <Line type="monotone" dataKey="absent" name="Absent" stroke="#e2665f" dot={false} /></LineChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Late % and attendance by weekday</h3>
          <Chart><BarChart data={weekday}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="weekday" tick={AX} /><YAxis tick={AX} /><Tooltip /><Legend />
            <Bar dataKey="avgPresent" name="Avg present" fill="#3ecf8e" radius={[5, 5, 0, 0]} /><Bar dataKey="avgLatePct" name="Avg late %" fill="#e0b25a" radius={[5, 5, 0, 0]} /></BarChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Hours worked per day</h3>
          <Chart><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="date" tick={AX} /><YAxis tick={AX} /><Tooltip /><Legend />
            <Line type="monotone" dataKey="avgHours" name="Avg hours" stroke="#c9903f" dot={false} /><Line type="monotone" dataKey="overtimeHours" name="Overtime hrs" stroke="#9b8cff" dot={false} /></LineChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Office vs remote</h3>
          <Chart><PieChart><Pie data={mode} dataKey="value" nameKey="name" outerRadius={95} label>{mode.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /><Legend /></PieChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Average hours/day by department</h3>
          <Chart><BarChart data={deptHours}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" tick={AX} /><YAxis tick={AX} /><Tooltip /><Bar dataKey="avgHours" fill="#6fd9c7" radius={[5, 5, 0, 0]} /></BarChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Late arrivals by department</h3>
          <Chart><BarChart data={deptLate}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" tick={AX} /><YAxis tick={AX} /><Tooltip /><Bar dataKey="late" fill="#e0b25a" radius={[5, 5, 0, 0]} /></BarChart></Chart></GlassCard>
        <GlassCard className="panel"><h3 style={{ marginBottom: 8 }}>Net payroll by department (this month)</h3>
          <Chart><BarChart data={pay}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" tick={AX} /><YAxis tick={AX} /><Tooltip /><Bar dataKey="net" fill="#c9903f" radius={[5, 5, 0, 0]} /></BarChart></Chart></GlassCard>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Insights
function Insights({ p }) {
  const items = useMemo(() => buildInsights(p), [p]);
  const border = { warn: 'var(--late)', info: 'var(--accent-2)', good: 'var(--present)' };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {items.map((i) => (
        <GlassCard key={i.id} className="panel" style={{ borderColor: border[i.level], marginBottom: 0 }}>
          <h3 style={{ marginBottom: 4 }}>{i.title}</h3>
          <p className="sub" style={{ marginBottom: i.rows.length ? 10 : 0 }}>{i.text}</p>
          {i.rows.length > 0 && <SimpleTable columns={i.columns} rows={i.rows} />}
        </GlassCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Explore
function Explore({ rows, filters, setFilters, name }) {
  const columns = columnsOf(rows);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ col: null, dir: 1 });
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState([]);

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const visible = useMemo(() => {
    let r = filtered;
    if (search.trim()) { const s = search.toLowerCase(); r = r.filter((x) => Object.values(x).some((v) => String(v).toLowerCase().includes(s))); }
    if (sort.col) r = [...r].sort((a, b) => ((Number.isNaN(Number(a[sort.col])) || Number.isNaN(Number(b[sort.col]))) ? String(a[sort.col]).localeCompare(String(b[sort.col])) : Number(a[sort.col]) - Number(b[sort.col])) * sort.dir);
    return r;
  }, [filtered, search, sort]);
  const shown = columns.filter((c) => !hidden.includes(c));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  useEffect(() => setPage(0), [filters, search]);

  const setF = (i, patch) => setFilters(filters.map((f, k) => (k === i ? { ...f, ...patch } : f)));

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {filters.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <select value={f.column} onChange={(e) => setF(i, { column: e.target.value })} style={{ width: 'auto' }}>{columns.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={f.op} onChange={(e) => setF(i, { op: e.target.value })} style={{ width: 'auto' }}>{OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {!['empty', 'notempty'].includes(f.op) && <input value={f.value} onChange={(e) => setF(i, { value: e.target.value })} placeholder="value" style={{ width: 160 }} />}
            <GlassButton variant="secondary" padding="6px 10px" onClick={() => setFilters(filters.filter((_, k) => k !== i))}>✕</GlassButton>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <GlassButton variant="secondary" padding="6px 12px" onClick={() => setFilters([...filters, { column: columns[0], op: '=', value: '' }])}>+ Add filter</GlassButton>
          <input placeholder="Search any value…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <details><summary className="sub" style={{ cursor: 'pointer' }}>Columns ({shown.length}/{columns.length})</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 8 }}>
              {columns.map((c) => <label key={c} style={{ fontSize: 12, display: 'flex', gap: 4, color: 'var(--text)' }}><input type="checkbox" style={{ width: 'auto' }} checked={!hidden.includes(c)} onChange={() => setHidden(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c])} />{c}</label>)}
            </div></details>
          <GlassButton variant="secondary" padding="6px 12px" onClick={() => downloadText(`${name}.csv`, toCsvText(visible))}>CSV ({visible.length})</GlassButton>
          <GlassButton variant="secondary" padding="6px 12px" onClick={() => downloadText(`${name}.json`, JSON.stringify(visible, null, 2), 'application/json')}>JSON</GlassButton>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>{shown.map((c) => <th key={c} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort({ col: c, dir: sort.col === c ? -sort.dir : 1 })}>{c}{sort.col === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
          <tbody>{visible.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => <tr key={i}>{shown.map((c) => <td key={c}>{r[c] === '' ? '—' : String(r[c])}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
        <GlassButton variant="secondary" padding="6px 12px" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</GlassButton>
        <span className="sub">Page {page + 1} of {pages} · {visible.length} of {rows.length} rows</span>
        <GlassButton variant="secondary" padding="6px 12px" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</GlassButton>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Pivot
function PivotTab({ rows, cfg, setCfg, name }) {
  const columns = columnsOf(rows);
  const nums = numericColumns(rows);
  const res = useMemo(() => pivot(rows, cfg), [rows, cfg]);
  const set = (patch) => setCfg({ ...cfg, ...patch });
  const matrix = res.columns.length > 1 || cfg.colBy;
  const flat = res.data.map((r) => ({ [cfg.rowBy]: r.key, ...Object.fromEntries(res.columns.map((c) => [c === 'value' ? `${cfg.agg} of ${cfg.measure || 'rows'}` : c, r[c]])) }));

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}><label>Group rows by</label><select value={cfg.rowBy} onChange={(e) => set({ rowBy: e.target.value })}>{columns.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Split columns by (optional)</label><select value={cfg.colBy} onChange={(e) => set({ colBy: e.target.value })}><option value="">— none —</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Measure</label><select value={cfg.measure} onChange={(e) => set({ measure: e.target.value })}><option value="">Row count</option>{nums.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Aggregate</label><select value={cfg.agg} onChange={(e) => set({ agg: e.target.value })}>{AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field" style={{ marginBottom: 0 }}><label>Chart</label><select value={cfg.chart} onChange={(e) => set({ chart: e.target.value })}><option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option></select></div>
        <GlassButton variant="secondary" style={{ alignSelf: 'flex-end' }} onClick={() => downloadText(`${name}_pivot.csv`, toCsvText(flat))}>Download pivot CSV</GlassButton>
      </div>
      {res.data.length > 0 && (
        <Chart height={320}>
          {cfg.chart === 'pie' && !matrix ? (
            <PieChart><Pie data={res.data} dataKey="value" nameKey="key" outerRadius={110} label>{res.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          ) : cfg.chart === 'line' ? (
            <LineChart data={res.data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="key" tick={AX} /><YAxis tick={AX} /><Tooltip /><Legend />
              {res.columns.map((c, i) => <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} />)}</LineChart>
          ) : (
            <BarChart data={res.data}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="key" tick={AX} /><YAxis tick={AX} /><Tooltip /><Legend />
              {res.columns.map((c, i) => <Bar key={c} dataKey={c} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}</BarChart>
          )}
        </Chart>
      )}
      <div style={{ marginTop: 14 }}><SimpleTable columns={Object.keys(flat[0] || {})} rows={flat} max={500} /></div>
    </>
  );
}

// ---------------------------------------------------------------- Statistics
function Stats({ rows }) {
  const stats = useMemo(() => describe(rows), [rows]);
  const cols = stats.numeric.map((s) => s.column);
  const corr = useMemo(() => (cols.length > 1 && cols.length <= 14 ? correlationMatrix(rows, cols) : null), [rows, cols.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const tint = (v) => (v >= 0 ? `rgba(62,207,142,${Math.min(Math.abs(v), 1) * 0.55})` : `rgba(226,102,95,${Math.min(Math.abs(v), 1) * 0.55})`);
  return (
    <>
      <h3 style={{ marginBottom: 8 }}>describe()</h3>
      <div style={{ overflowX: 'auto', marginBottom: 22 }}>
        <table><thead><tr><th>Column</th><th>count</th><th>mean</th><th>std</th><th>min</th><th>25%</th><th>50%</th><th>75%</th><th>max</th><th>sum</th></tr></thead>
          <tbody>{stats.numeric.map((s) => <tr key={s.column}><td>{s.column}</td><td>{s.count}</td><td>{fmt(s.mean)}</td><td>{fmt(s.std)}</td><td>{fmt(s.min)}</td><td>{fmt(s.q25)}</td><td>{fmt(s.q50)}</td><td>{fmt(s.q75)}</td><td>{fmt(s.max)}</td><td>{fmt(s.sum)}</td></tr>)}</tbody></table>
      </div>
      <h3 style={{ marginBottom: 8 }}>isnull().sum()</h3>
      <table style={{ maxWidth: 420, marginBottom: 22 }}><thead><tr><th>Column</th><th>Missing</th></tr></thead>
        <tbody>{stats.missing.map((m) => <tr key={m.column}><td>{m.column}</td><td style={{ color: m.missing ? 'var(--absent)' : 'inherit' }}>{m.missing}</td></tr>)}</tbody></table>
      {corr && (<>
        <h3 style={{ marginBottom: 8 }}>Correlation matrix</h3>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th />{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{cols.map((c, i) => <tr key={c}><td><strong>{c}</strong></td>{cols.map((_, j) => <td key={j} style={{ background: tint(corr[i][j]), textAlign: 'center' }}>{corr[i][j].toFixed(2)}</td>)}</tr>)}</tbody></table></div>
      </>)}
    </>
  );
}

// ---------------------------------------------------------------- Code
function CodeTab({ name, params }) {
  const base = client.defaults.baseURL;
  const q = Object.entries({ format: 'csv', ...params }).filter(([, v]) => v !== undefined && v !== '');
  const py = `import io, requests, pandas as pd

BASE = "${base}"
KEY  = "PASTE_REPORTING_API_KEY_HERE"   # ask the super admin; never commit it

r = requests.get(f"{BASE}/bi/${name}",
                 params={${q.map(([k, v]) => `"${k}": ${typeof v === 'number' ? v : `"${v}"`}`).join(', ')}},
                 headers={"x-api-key": KEY}, timeout=60)
r.raise_for_status()
df = pd.read_csv(io.StringIO(r.text))
df.describe()`;
  const R = `library(httr); library(readr)
res <- GET("${base}/bi/${name}", query = list(${q.map(([k, v]) => `${k} = "${v}"`).join(', ')}),
           add_headers("x-api-key" = "PASTE_REPORTING_API_KEY_HERE"))
df <- read_csv(content(res, "text"))
summary(df)`;
  const m = `let
    Source = Csv.Document(Web.Contents("${base}/bi/", [
        RelativePath = "${name}",
        Query = [${q.map(([k, v]) => `${k} = "${v}"`).join(', ')}],
        Headers = [#"x-api-key" = "PASTE_REPORTING_API_KEY_HERE"]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Promoted`;
  return (
    <>
      <p className="sub" style={{ marginBottom: 12 }}>Same table, same filters, in your own tools. These use the reporting API key (ask the super admin) — it is never shown here.</p>
      {[['Python / pandas (Jupyter)', py], ['R', R], ['Power BI / Excel Power Query (M)', m]].map(([t, code]) => (
        <div key={t} style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 6 }}>{t}</h3>
          <pre style={{ background: 'rgba(0,0,0,0.35)', padding: 14, borderRadius: 12, overflowX: 'auto', fontSize: 12.5, lineHeight: 1.5 }}>{code}</pre>
          <GlassButton variant="secondary" padding="6px 12px" onClick={() => navigator.clipboard.writeText(code)}>Copy</GlassButton>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Shell
export default function DataWorkspace() {
  const [datasets, setDatasets] = useState([]);
  const [name, setName] = useState('payroll_sheet');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [extended, setExtended] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState([]);
  const [pv, setPv] = useState({ rowBy: '', colBy: '', measure: '', agg: 'sum', chart: 'bar' });
  const [views, setViews] = useState([]);
  const [period, setPeriod] = useState(30);
  const [pdata, setPdata] = useState(null);
  const [ploading, setPloading] = useState(false);

  const meta = datasets.find((d) => d.name === name);
  const role = localStorage.getItem('admin_role');

  const loadViews = useCallback(() => client.get('/analyst/views').then((r) => setViews(r.data.views)).catch(() => {}), []);
  useEffect(() => {
    client.get('/analyst/datasets').then((r) => setDatasets(r.data.datasets)).catch(() => setError('Could not load the dataset list.'));
    loadViews();
  }, [loadViews]);

  const params = useCallback((over = {}) => {
    const p = {};
    const m = over.name ? datasets.find((d) => d.name === over.name) : meta;
    if (m?.range === 'month') { p.from = from || currentMonth(); p.to = to || currentMonth(); }
    else if (m?.range === 'date') { if (from) p.from = from; if (to) p.to = to; }
    if ((over.name || name) === 'payroll_sheet' && extended) p.extended = 1;
    return p;
  }, [datasets, meta, from, to, extended, name]);

  async function load(override) {
    const n = override?.name || name;
    setLoading(true); setError('');
    try {
      const { data } = await client.get(`/analyst/data/${n}`, { params: override?.params || params() });
      setRows(data.rows);
      const cols = columnsOf(data.rows); const nums = numericColumns(data.rows);
      setPv((cur) => (cur.rowBy && cols.includes(cur.rowBy) ? cur : { ...cur, rowBy: cols.find((c) => /department/i.test(c)) || cols.find((c) => !nums.includes(c)) || cols[0] || '', colBy: '', measure: nums.find((c) => /net|worked|hours/i.test(c)) || nums[0] || '' }));
      if (tab === 'overview' || tab === 'insights') setTab('explore');
    } catch (err) { setRows([]); setError(err.response?.data?.message || 'Could not load data.'); }
    finally { setLoading(false); }
  }

  // Overview + Insights always work on a fixed period of attendance/payroll data.
  const loadPeriod = useCallback(async () => {
    setPloading(true); setError('');
    try {
      const rng = { from: daysAgo(period), to: iso(new Date()) };
      const get = (n, p) => client.get(`/analyst/data/${n}`, { params: p }).then((r) => r.data.rows);
      const [daily, scorecard, attendance, payroll] = await Promise.all([
        get('daily_summary', rng), get('employee_scorecard', rng), get('attendance_daily', rng), get('payroll_sheet', { from: currentMonth(), to: currentMonth() }),
      ]);
      setPdata({ daily, scorecard, attendance, payroll });
    } catch (err) { setError(err.response?.data?.message || 'Could not load the overview.'); }
    finally { setPloading(false); }
  }, [period]);

  useEffect(() => { if (['overview', 'insights'].includes(tab)) loadPeriod(); }, [tab, loadPeriod]);

  async function saveView() {
    const viewName = window.prompt('Name this view:');
    if (!viewName) return;
    const shared = window.confirm('Share it with the whole team? (OK = share, Cancel = keep private)');
    await client.post('/analyst/views', { name: viewName, shared, config: { name, from, to, extended, filters, pv, tab } });
    loadViews();
  }
  async function openView(v) {
    const c = v.config || {};
    setName(c.name || 'payroll_sheet'); setFrom(c.from || ''); setTo(c.to || ''); setExtended(!!c.extended);
    setFilters(c.filters || []); setPv(c.pv || pv);
    const m = datasets.find((d) => d.name === c.name);
    const p = {};
    if (m?.range === 'month') { p.from = c.from || currentMonth(); p.to = c.to || currentMonth(); } else if (m?.range === 'date') { if (c.from) p.from = c.from; if (c.to) p.to = c.to; }
    if (c.name === 'payroll_sheet' && c.extended) p.extended = 1;
    await load({ name: c.name, params: p });
    setTab(c.tab && !['overview', 'insights'].includes(c.tab) ? c.tab : 'explore');
  }
  async function deleteView(v) {
    if (!window.confirm(`Delete view "${v.name}"?`)) return;
    await client.delete(`/analyst/views/${v.id}`).catch((e) => alert(e.response?.data?.message || 'Could not delete.'));
    loadViews();
  }

  const tabs = [['overview', 'Overview'], ['explore', 'Explore'], ['pivot', 'Pivot & charts'], ['insights', 'Insights'], ['stats', 'Statistics'], ['code', 'Code'], ['import', 'Import & clean-up']];
  const needsRows = ['explore', 'pivot', 'stats', 'code'].includes(tab);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Analytics Studio</h1>
          <p className="sub">Explore every Attendai table, pivot it, chart it, find insights and take it to Jupyter, R or Power BI. Read-only, live data.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([k, label]) => <GlassButton key={k} variant={tab === k ? 'primary' : 'secondary'} padding="8px 16px" onClick={() => setTab(k)}>{label}</GlassButton>)}
      </div>

      {error && <p className="error-text" style={{ marginBottom: 14 }}>{error}</p>}

      {['overview', 'insights'].includes(tab) && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <span className="sub">Period:</span>
            {[7, 30, 90, 180].map((d) => <GlassButton key={d} variant={period === d ? 'primary' : 'secondary'} padding="6px 12px" onClick={() => setPeriod(d)}>Last {d} days</GlassButton>)}
            {ploading && <span className="sub">Loading…</span>}
          </div>
          {pdata && tab === 'overview' && <Overview p={pdata} />}
          {pdata && tab === 'insights' && <Insights p={pdata} />}
        </>
      )}

      {tab === 'import' && <ImportTab />}

      {needsRows && (
        <GlassCard className="panel" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Dataset</label>
            <select value={name} onChange={(e) => { setName(e.target.value); setRows([]); setFrom(''); setTo(''); setFilters([]); }}>
              {datasets.map((d) => <option key={d.name} value={d.name}>{d.label}</option>)}</select></div>
          {meta?.range === 'month' && (<>
            <div className="field" style={{ marginBottom: 0 }}><label>From month</label><input type="month" value={from || currentMonth()} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>To month</label><input type="month" value={to || currentMonth()} onChange={(e) => setTo(e.target.value)} /></div></>)}
          {meta?.range === 'date' && (<>
            <div className="field" style={{ marginBottom: 0 }}><label>From date</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>To date</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></>)}
          {name === 'payroll_sheet' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text)' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extra columns</label>)}
          <GlassButton onClick={() => load()} disabled={loading}>{loading ? 'Loading…' : 'Load data'}</GlassButton>
          {rows.length > 0 && <GlassButton variant="secondary" onClick={saveView}>Save view</GlassButton>}
        </GlassCard>
      )}

      {needsRows && rows.length > 0 && (
        <GlassCard className="panel">
          {tab === 'explore' && <Explore rows={rows} filters={filters} setFilters={setFilters} name={name} />}
          {tab === 'pivot' && <PivotTab rows={applyFilters(rows, filters)} cfg={pv} setCfg={setPv} name={name} />}
          {tab === 'stats' && <Stats rows={applyFilters(rows, filters)} />}
          {tab === 'code' && <CodeTab name={name} params={params()} />}
        </GlassCard>
      )}
      {needsRows && !rows.length && !loading && !error && <p className="sub">Choose a dataset and press <strong>Load data</strong> — or open a saved view below.</p>}

      <GlassCard className="panel">
        <h3 style={{ marginBottom: 8 }}>Saved views</h3>
        {views.length === 0 ? <p className="sub">Nothing saved yet. Load a dataset, set filters/pivot, then press “Save view”.</p> : (
          <table><thead><tr><th>Name</th><th>Dataset</th><th>By</th><th>Shared</th><th /></tr></thead>
            <tbody>{views.map((v) => (
              <tr key={v.id}><td>{v.name}</td><td>{v.config?.name}</td><td>{v.owner}{v.mine ? ' (you)' : ''}</td><td>{v.shared ? 'Yes' : 'No'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <GlassButton padding="5px 10px" style={{ fontSize: 12 }} onClick={() => openView(v)}>Open</GlassButton>
                  {(v.mine || role === 'super_admin') && <GlassButton variant="danger" padding="5px 10px" style={{ fontSize: 12 }} onClick={() => deleteView(v)}>Delete</GlassButton>}
                </td></tr>))}</tbody></table>)}
      </GlassCard>
    </div>
  );
}
