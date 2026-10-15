// Small, dependency-free CSV reader. Handles a UTF-8 BOM, quoted fields,
// "" escaped quotes, commas/newlines inside quotes, and CRLF / LF line ends.
function parseCsv(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // drop completely blank lines
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

// -> { headers: [...], records: [{ header: value }, ...], lines: [csvLineNumber, ...] }
function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [], lines: [] };
  const headers = rows[0].map((h) => String(h).trim());
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] === undefined ? '' : String(r[i]).trim()])));
  return { headers, records, lines: rows.slice(1).map((_, i) => i + 2) };
}

module.exports = { parseCsv, parseCsvObjects };
