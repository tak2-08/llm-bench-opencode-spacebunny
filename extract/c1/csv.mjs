// Robust RFC4180-ish CSV parser (handles quoted fields with embedded newlines/commas).
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  text = text.replace(/^\uFEFF/, '');
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // drop fully-empty trailing rows
  while (rows.length && rows[rows.length - 1].every((f) => f === '')) rows.pop();
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((f) => f !== ''))
    .map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] === undefined ? '' : r[k]])));
}
