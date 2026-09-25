// .docx quote template support (V2 addendum, item 2 — deferred out of HT-D,
// built later). Same closed {{token}} -> field-key mapping as the .html
// templates (src/quoteFields.js), applied to a Word file's raw
// word/document.xml instead of an HTML string. Deliberately plain
// substitution, not a docxtemplater-style loop/module system: a .docx is a
// zip (pizzip unpacks/repacks it), and doing a straight text-level
// {{token}} replace on the XML gets the same practical fidelity as
// docxtemplater's own default tag mode, for one fewer dependency and the
// same token syntax the .html path already uses.
//
// Known, accepted limitation (not silently broken): if Word's autocorrect
// splits a typed {{token}} across two <w:r> runs, this won't find it —
// same failure mode docxtemplater's own default mode has. Type tokens in
// one continuous action and this isn't an issue in practice.
import PizZip from 'pizzip';
import { detectTokens } from './quoteFields.js';

const DOCUMENT_XML = 'word/document.xml';

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// A real Word table needs docxtemplater-style loop tags authored into the
// template itself, which is a different (and much heavier) templating
// model than the fixed {{token}} list this app uses everywhere else. Line
// items render as one line per item instead — honest and simple, not a
// bordered table. \n here becomes a real Word line break (see below), not
// a paragraph break.
const WORD_LINE_BREAK = '</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">';

export function detectDocxTokens(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  const xml = zip.file(DOCUMENT_XML)?.asText() || '';
  const plainText = xml.replace(/<[^>]+>/g, '');
  return detectTokens(plainText);
}

// fieldValues values are plain text (already computed, not pre-escaped —
// unlike the .html path, which builds real HTML). \n in a value becomes a
// real Word line break via WORD_LINE_BREAK; everything else is XML-escaped.
export function renderDocx(arrayBuffer, fieldMap, fieldValues) {
  const zip = new PizZip(arrayBuffer);
  let xml = zip.file(DOCUMENT_XML)?.asText() || '';
  for (const [token, fieldKey] of Object.entries(fieldMap || {})) {
    if (!fieldKey) continue;
    const value = fieldValues[fieldKey] ?? '';
    const escaped = xmlEscape(value).replace(/\n/g, WORD_LINE_BREAK);
    xml = xml.split(`{{${token}}}`).join(escaped);
  }
  zip.file(DOCUMENT_XML, xml);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
