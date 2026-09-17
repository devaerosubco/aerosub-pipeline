// Minimal RFC4180-ish CSV parser for the Store bulk-upload flow (V2 HT-B).
//
// Deliberately hand-rolled, not a library: the npm `xlsx` package (SheetJS)
// has two unpatched high-severity advisories (prototype pollution + ReDoS,
// "no fix available") that matter a lot here specifically, because this
// parses untrusted, user-uploaded files. The actively-maintained alternative
// (`exceljs`) pulls in ~100 Node-oriented packages (archiver, tmp, unzipper…)
// for a small browser app. So: CSV-only. The bulk-upload modal tells users
// to Save As / Export as CSV from Excel or Google Sheets first — one click
// on their end, zero new attack surface or bundle weight on ours.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      // ignore — \n (below) closes the row for both \n and \r\n
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) pushRow();
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// Header row -> lower-cased keys; every other row -> {header: value}.
export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}
