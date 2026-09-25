// Create tab — the data side of uploaded-template token replacement (V2
// HT-D). Pure/framework-agnostic, same reason store.js/validate.js/csv.js
// are: unit-testable without a DOM or a network call. main.js owns the
// DOM-facing bits (file reads, storage upload, rendering the mapping UI).

// The fixed set of fields a template's {{token}} can be mapped to. Kept
// small and closed rather than free-form, so the mapping UI is a dropdown,
// not an open text field a user could typo.
export const QUOTE_FIELDS = [
  { key: 'kind_label', label: 'Document type (Quote / Proforma / Commercial)' },
  { key: 'company_name', label: 'Client / company name' },
  { key: 'quote_number', label: 'Quote number' },
  { key: 'quote_date', label: 'Date' },
  { key: 'items_table', label: 'Line items table (auto-generated)' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
  { key: 'notes', label: 'Notes' },
  { key: 'prepared_by', label: 'Prepared by' },
];

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Every distinct {{token}} in a template's raw text, in first-seen order.
export function detectTokens(rawText) {
  const seen = new Set();
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(String(rawText || '')))) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount, currency) {
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// qty × unit_cost × markup_multiplier, per line — the "already calculated"
// part of item 3's request. No separate tax line in V1: total === subtotal.
export function computeLineTotals(lineItems) {
  return lineItems.map(li => {
    const unitPrice = li.unitCost * li.markupMultiplier;
    const lineTotal = unitPrice * li.qty;
    return { ...li, unitPrice, lineTotal };
  });
}

// format: 'html' (default — an HTML <table>, for .html templates) or
// 'plain' (.docx templates — a Word table needs docxtemplater-style loop
// tags authored into the file itself, a heavier model this app doesn't use
// elsewhere, so .docx instead gets one plain text line per item, joined by
// \n; src/docx.js turns those \n into real Word line breaks on render).
export function buildQuoteFieldValues({ quote, lineItems, companyName, preparedBy, format = 'html' }) {
  const rows = computeLineTotals(lineItems);
  const subtotal = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const itemsTable = format === 'plain'
    ? rows.map(r => `${r.description} — ${r.qty} x ${money(r.unitPrice, quote.currency)} = ${money(r.lineTotal, quote.currency)}`).join('\n')
    : `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:6px;">Description</th>
        <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">Qty</th>
        <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">Unit price</th>
        <th style="text-align:right;border-bottom:1px solid #ccc;padding:6px;">Total</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="padding:6px;border-bottom:1px solid #eee;">${escapeHtml(r.description)}</td>
          <td style="text-align:right;padding:6px;border-bottom:1px solid #eee;">${r.qty}</td>
          <td style="text-align:right;padding:6px;border-bottom:1px solid #eee;">${money(r.unitPrice, quote.currency)}</td>
          <td style="text-align:right;padding:6px;border-bottom:1px solid #eee;">${money(r.lineTotal, quote.currency)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  return {
    kind_label: quote.kind,
    company_name: format === 'plain' ? (companyName || '') : escapeHtml(companyName || ''),
    quote_number: format === 'plain' ? (quote.quoteNumber || '') : escapeHtml(quote.quoteNumber || ''),
    quote_date: new Date(quote.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    items_table: itemsTable,
    subtotal: money(subtotal, quote.currency),
    total: money(subtotal, quote.currency),
    notes: format === 'plain' ? (quote.notes || '') : escapeHtml(quote.notes || ''),
    prepared_by: format === 'plain' ? (preparedBy || '') : escapeHtml(preparedBy || ''),
  };
}

// Replaces every {{token}} per field_map ({token: fieldKey}). An unmapped
// token (fieldKey falsy, or simply absent from field_map) is left as
// literal text — so a freshly-uploaded, not-yet-mapped template still
// previews as valid HTML instead of throwing.
export function renderTemplate(rawText, fieldMap, fieldValues) {
  let out = String(rawText || '');
  for (const [token, fieldKey] of Object.entries(fieldMap || {})) {
    if (!fieldKey) continue;
    const value = fieldValues[fieldKey] ?? '';
    out = out.split(`{{${token}}}`).join(value);
  }
  return out;
}

export function buildQuoteMarkdown({ quote, lineItems, companyName }) {
  const rows = computeLineTotals(lineItems);
  const subtotal = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const lines = [
    `# ${quote.kind}${quote.quoteNumber ? ' ' + quote.quoteNumber : ''}`,
    companyName ? `**Client:** ${companyName}` : '',
    `**Date:** ${new Date(quote.createdAt || Date.now()).toLocaleDateString('en-GB')}`,
    '',
    '| Description | Qty | Unit price | Total |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r.description} | ${r.qty} | ${money(r.unitPrice, quote.currency)} | ${money(r.lineTotal, quote.currency)} |`),
    '',
    `**Total: ${money(subtotal, quote.currency)}**`,
    quote.notes ? `\n${quote.notes}` : '',
  ];
  return lines.filter(l => l !== '').join('\n');
}
