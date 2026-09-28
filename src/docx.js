// .docx quote template support (V2 addendum item 2; extended addendum
// 2026-09-28 after the shipped version failed on a real user template —
// see the two notes below). Same closed {{token}} -> field-key mapping as
// the .html templates (src/quoteFields.js), applied to a Word file's raw
// word/document.xml instead of an HTML string.
//
// Note 1 (run-splitting): Word frequently splits one visible run of text,
// including a {{token}} a user typed, across multiple adjacent <w:t>
// elements (autocorrect, spell-check, or just incremental edits). A naive
// whole-string search for the literal substring "{{token}}" then finds
// nothing, because it never appears intact in the raw XML. Every function
// below walks the *concatenated* text across all <w:t> runs to find
// tokens, then maps each match back onto whichever run(s) it spans — see
// extractRuns()/substituteRunTokens().
//
// Note 2 (real invoice templates have no {{tokens}} in them at all): a
// real user template (an AEROSUB invoice) turned out to have zero {{}}
// placeholders anywhere — it's a native Word table (S/N | Description |
// UoM | Qty | Unit Price | Amount) with one blank row meant to be filled
// in by hand. No substitution engine can guess where to inject data into
// unmarked static text; the user still has to type {{tokens}} into their
// document once (same as any mail-merge tool). What WAS a real gap: even
// with tokens added to that row, plain substitution can only fill *one*
// row, never repeat it per line item. renderDocx's repeating-row support
// (below) fixes that: map any token inside a table row to one of
// QUOTE_FIELDS' item_* fields, and that row is cloned once per line item.
import PizZip from 'pizzip';
import { detectTokens } from './quoteFields.js';

const DOCUMENT_XML = 'word/document.xml';

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// A real Word table needs docxtemplater-style loop tags authored into the
// template itself for anything beyond one repeated row; the items_table
// scalar field (single line per item, no borders) stays available for
// templates that don't use a native table. \n in a value becomes a real
// Word line break via WORD_LINE_BREAK, not a paragraph break.
const WORD_LINE_BREAK = '</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">';

// Every <w:t>...</w:t> in document order within `xml`, with enough
// position info to reconstruct it after substitution.
const T_TAG_RE = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;
function extractRuns(xml) {
  const runs = [];
  let m;
  T_TAG_RE.lastIndex = 0;
  while ((m = T_TAG_RE.exec(xml))) {
    runs.push({ matchStart: m.index, matchEnd: m.index + m[0].length, attrs: m[1], text: m[2] });
  }
  return runs;
}

export function detectDocxTokens(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  const xml = zip.file(DOCUMENT_XML)?.asText() || '';
  const runs = extractRuns(xml);
  return detectTokens(runs.map(r => r.text).join(''));
}

// Substitutes every {{token}} found in `xmlFragment` (a whole document.xml,
// or just one <w:tr>...</w:tr> row) per fieldMap/fieldValues, tolerant of
// tokens split across runs. An unmapped token is left as literal text.
function substituteRunTokens(xmlFragment, fieldMap, fieldValues) {
  const runs = extractRuns(xmlFragment);
  if (!runs.length) return xmlFragment;

  const concatText = runs.map(r => r.text).join('');
  const runOfChar = new Array(concatText.length);
  { let pos = 0; runs.forEach((r, ri) => { for (let i = 0; i < r.text.length; i++) runOfChar[pos++] = ri; }); }

  const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const matches = [];
  let mm;
  while ((mm = TOKEN_RE.exec(concatText))) matches.push({ start: mm.index, end: mm.index + mm[0].length, token: mm[1] });
  if (!matches.length) return xmlFragment;

  const newRunText = runs.map(() => []);
  let mi = 0;
  for (let ci = 0; ci < concatText.length; ci++) {
    while (mi < matches.length && ci >= matches[mi].end) mi++;
    const match = mi < matches.length ? matches[mi] : null;
    const ri = runOfChar[ci];
    if (match && ci >= match.start && ci < match.end) {
      if (ci === match.start) {
        const fieldKey = (fieldMap || {})[match.token];
        if (fieldKey) {
          const value = fieldValues[fieldKey] ?? '';
          newRunText[ri].push(xmlEscape(value).replace(/\n/g, WORD_LINE_BREAK));
        } else {
          newRunText[ri].push(`{{${match.token}}}`); // unmapped -> leave as literal text
        }
      }
      // else: character already consumed by the match's substitution above
    } else {
      newRunText[ri].push(concatText[ci]);
    }
  }

  let out = xmlFragment;
  for (let ri = runs.length - 1; ri >= 0; ri--) {
    const r = runs[ri];
    const newInner = newRunText[ri].join('');
    // Force xml:space="preserve" when the new text has leading/trailing
    // whitespace the run's own attrs might not already declare-safe.
    const attrs = (newInner !== newInner.trim() && !/xml:space=/.test(r.attrs)) ? r.attrs + ' xml:space="preserve"' : r.attrs;
    out = out.slice(0, r.matchStart) + `<w:t${attrs}>${newInner}</w:t>` + out.slice(r.matchEnd);
  }
  return out;
}

// QUOTE_FIELDS keys that mark a table row as "repeat this once per line
// item" when the user maps a token inside it to one of these (src/quoteFields.js).
const ITEM_ROW_FIELDS = new Set(['item_n', 'item_description', 'item_qty', 'item_unit_cost', 'item_unit_price', 'item_line_total']);

// itemRows: quoteFields.js's buildQuoteItemRows() output — one
// pre-formatted {item_n, item_description, item_qty, item_unit_cost,
// item_unit_price, item_line_total} object per line item.
export function renderDocx(arrayBuffer, fieldMap, fieldValues, itemRows) {
  const zip = new PizZip(arrayBuffer);
  let xml = zip.file(DOCUMENT_XML)?.asText() || '';

  xml = xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, (rowXml) => {
    const rowTokens = detectTokens(extractRuns(rowXml).map(r => r.text).join(''));
    const isItemRow = rowTokens.some(t => ITEM_ROW_FIELDS.has((fieldMap || {})[t]));
    if (!isItemRow) return rowXml;
    const rows = itemRows && itemRows.length ? itemRows : [{}]; // no items -> one row, tokens blank
    return rows.map(item => substituteRunTokens(rowXml, fieldMap, { ...fieldValues, ...item })).join('');
  });

  xml = substituteRunTokens(xml, fieldMap, fieldValues);

  zip.file(DOCUMENT_XML, xml);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
