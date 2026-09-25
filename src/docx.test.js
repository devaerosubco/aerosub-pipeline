import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { detectDocxTokens, renderDocx } from './docx.js';

// Builds a minimal in-memory .docx-shaped zip — only word/document.xml is
// populated, which is all detectDocxTokens/renderDocx ever touch. A real
// Word file has several more parts (styles, rels, [Content_Types].xml),
// but neither function under test reads them.
function fakeDocx(bodyXml) {
  const zip = new PizZip();
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyXml}</w:body></w:document>`);
  return zip.generate({ type: 'uint8array' });
}

describe('detectDocxTokens', () => {
  it('finds {{token}}s inside <w:t> runs', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>Hello {{company_name}}, total {{total}}</w:t></w:r></w:p>');
    expect(detectDocxTokens(buf)).toEqual(['company_name', 'total']);
  });

  it('dedupes repeated tokens, first-seen order', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>{{total}} then {{company_name}} then {{total}} again</w:t></w:r></w:p>');
    expect(detectDocxTokens(buf)).toEqual(['total', 'company_name']);
  });

  it('returns [] when there are no tokens', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>No placeholders here.</w:t></w:r></w:p>');
    expect(detectDocxTokens(buf)).toEqual([]);
  });
});

describe('renderDocx', () => {
  it('substitutes a mapped token with its field value', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>Client: {{cust}}</w:t></w:r></w:p>');
    const out = renderDocx(buf, { cust: 'company_name' }, { company_name: 'Seplat Energy' });
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('Client: Seplat Energy');
    expect(xml).not.toContain('{{cust}}');
  });

  it('leaves an unmapped token as literal text', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>{{mapped}} and {{unmapped}}</w:t></w:r></w:p>');
    const out = renderDocx(buf, { mapped: 'company_name' }, { company_name: 'X' });
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('X and {{unmapped}}');
  });

  it('XML-escapes special characters in the substituted value', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>{{cust}}</w:t></w:r></w:p>');
    const out = renderDocx(buf, { cust: 'company_name' }, { company_name: 'Smith & Sons <Ltd>' });
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('Smith &amp; Sons &lt;Ltd&gt;');
    expect(xml).not.toContain('<Ltd>'); // would corrupt the XML if left unescaped
  });

  it('turns \\n in a value into a real Word line break, not a literal newline', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>{{items}}</w:t></w:r></w:p>');
    const out = renderDocx(buf, { items: 'items_table' }, { items_table: 'Line one\nLine two' });
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('<w:br/>');
    expect(xml).toContain('Line one');
    expect(xml).toContain('Line two');
  });

  it('round-trips through a real PizZip generate/reload (produces a valid zip)', () => {
    const buf = fakeDocx('<w:p><w:r><w:t>{{a}}</w:t></w:r></w:p>');
    const out = renderDocx(buf, { a: 'k' }, { k: 'v' });
    expect(() => new PizZip(out)).not.toThrow();
  });
});
