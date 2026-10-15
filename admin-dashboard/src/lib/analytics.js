// Pure data helpers for the Analytics Studio (no React, no network).

export const isNum = (v) => v !== '' && v !== null && v !== undefined && typeof v !== 'boolean' && !Number.isNaN(Number(v));
const blank = (v) => v === '' || v === null || v === undefined;

export function columnsOf(rows) { return rows[0] ? Object.keys(rows[0]) : []; }

// A column is numeric if every non-blank value is a number (ids excluded).
export function numericColumns(rows) {
  return columnsOf(rows).filter((c) => {
    if (/(^|\s)id$/i.test(c) || /^(month|date|weekday)$/i.test(c)) return false;
    const vals = rows.map((r) => r[c]).filter((v) => !blank(v));
    return vals.length > 0 && vals.every(isNum);
  });
}

export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Same figures as pandas df.describe() / df.isnull().sum().
export function describe(rows) {
  const missing = columnsOf(rows).map((column) => ({ column, missing: rows.filter((r) => blank(r[column])).length }));
  const numeric = numericColumns(rows).map((column) => {
    const v = rows.map((r) => r[column]).filter((x) => !blank(x)).map(Number).sort((a, b) => a - b);
    const n = v.length; const mean = v.reduce((a, b) => a + b, 0) / n;
    const std = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
    return { column, count: n, mean, std, min: v[0], q25: quantile(v, 0.25), q50: quantile(v, 0.5), q75: quantile(v, 0.75), max: v[n - 1], sum: v.reduce((a, b) => a + b, 0) };
  });
  return { numeric, missing };
}

export function correlationMatrix(rows, cols) {
  const data = cols.map((c) => rows.map((r) => Number(r[c])));
  const mean = data.map((v) => v.reduce((a, b) => a + b, 0) / (v.length || 1));
  return cols.map((_, i) => cols.map((__, j) => {
    let num = 0; let di = 0; let dj = 0;
    for (let k = 0; k < rows.length; k += 1) {
      const a = data[i][k] - mean[i]; const b = data[j][k] - mean[j];
      num += a * b; di += a * a; dj += b * b;
    }
    return di && dj ? num / Math.sqrt(di * dj) : 0;
  }));
}

export const OPS = [
  ['=', 'equals'], ['!=', 'not equals'], ['>', 'greater than'], ['>=', 'at least'], ['<', 'less than'], ['<=', 'at most'],
  ['contains', 'contains'], ['empty', 'is empty'], ['notempty', 'is not empty'],
];

export function applyFilters(rows, filters) {
  const active = filters.filter((f) => f.column && (f.op === 'empty' || f.op === 'notempty' || f.value !== ''));
  if (!active.length) return rows;
  return rows.filter((r) => active.every((f) => {
    const v = r[f.column];
    switch (f.op) {
      case 'empty': return blank(v);
      case 'notempty': return !blank(v);
      case 'contains': return String(v).toLowerCase().includes(String(f.value).toLowerCase());
      case '=': return isNum(v) && isNum(f.value) ? Number(v) === Number(f.value) : String(v).toLowerCase() === String(f.value).toLowerCase();
      case '!=': return isNum(v) && isNum(f.value) ? Number(v) !== Number(f.value) : String(v).toLowerCase() !== String(f.value).toLowerCase();
      default: {
        const a = Number(v); const b = Number(f.value);
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        return f.op === '>' ? a > b : f.op === '>=' ? a >= b : f.op === '<' ? a < b : a <= b;
      }
    }
  }));
}

export const AGGS = [['sum', 'Sum'], ['mean', 'Average'], ['count', 'Count'], ['min', 'Min'], ['max', 'Max'], ['median', 'Median']];

export function aggregate(values, agg) {
  const v = values.filter((x) => !blank(x)).map(Number).filter((x) => !Number.isNaN(x));
  if (agg === 'count') return values.length;
  if (!v.length) return 0;
  const sum = v.reduce((a, b) => a + b, 0);
  const r = agg === 'sum' ? sum : agg === 'mean' ? sum / v.length : agg === 'min' ? Math.min(...v) : agg === 'max' ? Math.max(...v)
    : quantile([...v].sort((a, b) => a - b), 0.5);
  return Math.round(r * 100) / 100;
}

// rowBy (+ optional colBy) -> table. With colBy the result is a matrix.
export function pivot(rows, { rowBy, colBy, measure, agg }) {
  if (!rowBy) return { columns: [], data: [] };
  const rowKeys = [...new Set(rows.map((r) => String(r[rowBy] ?? '—')))].sort();
  if (!colBy) {
    const groups = {};
    rows.forEach((r) => { const k = String(r[rowBy] ?? '—'); (groups[k] = groups[k] || []).push(measure ? r[measure] : 1); });
    return { columns: ['value'], data: rowKeys.map((k) => ({ key: k, value: aggregate(groups[k], measure ? agg : 'count') })) };
  }
  const colKeys = [...new Set(rows.map((r) => String(r[colBy] ?? '—')))].sort();
  const cell = {};
  rows.forEach((r) => { const k = `${String(r[rowBy] ?? '—')}||${String(r[colBy] ?? '—')}`; (cell[k] = cell[k] || []).push(measure ? r[measure] : 1); });
  return {
    columns: colKeys,
    data: rowKeys.map((rk) => ({ key: rk, ...Object.fromEntries(colKeys.map((ck) => [ck, cell[`${rk}||${ck}`] ? aggregate(cell[`${rk}||${ck}`], measure ? agg : 'count') : 0])) })),
  };
}

export function outliers(rows, column, label, threshold = 2.5) {
  const vals = rows.map((r) => Number(r[column])).filter((x) => !Number.isNaN(x));
  if (vals.length < 5) return [];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  if (!std) return [];
  return rows.map((r) => ({ label: r[label], value: Number(r[column]), z: (Number(r[column]) - mean) / std }))
    .filter((x) => Math.abs(x.z) >= threshold).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export function toCsvText(rows) {
  const cols = columnsOf(rows);
  const esc = (v) => { const s = blank(v) ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function downloadText(filename, text, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

export const fmt = (x) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(2)).toLocaleString('en-IN') : x === undefined || x === null || Number.isNaN(x) ? '—' : String(x));
