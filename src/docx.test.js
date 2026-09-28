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

// Word (autocorrect/spell-check) commonly splits one visible token across
// several adjacent <w:t> runs — the exact failure mode a real user's
// upload hit (found while diagnosing "data isn't added to the doc").
describe('detectDocxTokens / renderDocx — tokens split across runs', () => {
  const SPLIT = '<w:p><w:r><w:t>Client: {{co</w:t></w:r><w:r><w:t>mpany_name}}, total {{to</w:t></w:r><w:r><w:t>tal}}</w:t></w:r></w:p>';

  it('detects a token even when the {{ }} pair spans two <w:t> runs', () => {
    const buf = fakeDocx(SPLIT);
    expect(detectDocxTokens(buf)).toEqual(['company_name', 'total']);
  });

  it('substitutes a token split across runs (this is what the naive whole-string replace missed)', () => {
    const buf = fakeDocx(SPLIT);
    const out = renderDocx(buf, { company_name: 'company_name', total: 'total' }, { company_name: 'Seplat', total: 'NGN 500,000.00' });
    const xml = new PizZip(out).file('word/document.xml').asText();
    // The substituted text legitimately spans 2 adjacent <w:t> runs (still
    // renders as one continuous line in Word) — compare tag-stripped text.
    expect(xml.replace(/<[^>]+>/g, '')).toBe('Client: Seplat, total NGN 500,000.00');
    expect(xml).not.toMatch(/\{\{|\}\}/);
  });

  it('leaves the run structure valid (still N <w:t> tags, reparses as a zip)', () => {
    const buf = fakeDocx(SPLIT);
    const out = renderDocx(buf, { company_name: 'company_name', total: 'total' }, { company_name: 'X', total: 'Y' });
    expect(() => new PizZip(out)).not.toThrow();
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect((xml.match(/<w:t\b/g) || []).length).toBe(3);
  });
});

// The real fix for "items are not yet added to the doc": a native Word
// table row, mapped to item_* fields, must repeat once per line item.
describe('renderDocx — repeating table rows (item_* fields)', () => {
  const TABLE = `<w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>S/N</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>{{n}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{desc}} qty {{q}} = {{amt}}</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>TOTAL: {{total}}</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>`;
  const fieldMap = { n: 'item_n', desc: 'item_description', q: 'item_qty', amt: 'item_line_total', total: 'total' };
  const itemRows = [
    { item_n: '1', item_description: 'Drone Inspection', item_qty: '2', item_unit_cost: 'NGN 1,000.00', item_unit_price: 'NGN 1,300.00', item_line_total: 'NGN 2,600.00' },
    { item_n: '2', item_description: 'ROV Survey', item_qty: '1', item_unit_cost: 'NGN 5,000.00', item_unit_price: 'NGN 6,500.00', item_line_total: 'NGN 6,500.00' },
  ];

  it('clones the item row once per line item, substituting each row\'s own values', () => {
    const buf = fakeDocx(TABLE);
    const out = renderDocx(buf, fieldMap, { total: 'NGN 9,100.00' }, itemRows);
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('Drone Inspection qty 2 = NGN 2,600.00');
    expect(xml).toContain('ROV Survey qty 1 = NGN 6,500.00');
    // header row (no item_* tokens) is untouched, appears exactly once
    expect((xml.match(/S\/N/g) || []).length).toBe(1);
  });

  it('leaves non-item rows (scalar tokens) untouched by the row-cloning pass', () => {
    const buf = fakeDocx(TABLE);
    const out = renderDocx(buf, fieldMap, { total: 'NGN 9,100.00' }, itemRows);
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).toContain('TOTAL: NGN 9,100.00');
    expect((xml.match(/TOTAL:/g) || []).length).toBe(1);
  });

  it('with zero line items, keeps exactly one row with its tokens blanked (not left as literal {{}})', () => {
    const buf = fakeDocx(TABLE);
    const out = renderDocx(buf, fieldMap, { total: 'NGN 0.00' }, []);
    const xml = new PizZip(out).file('word/document.xml').asText();
    expect(xml).not.toMatch(/\{\{n\}\}|\{\{desc\}\}|\{\{q\}\}|\{\{amt\}\}/);
    expect((xml.match(/qty/g) || []).length).toBe(1); // exactly one (blanked) row survives
  });

  it('produces a valid, reparseable zip after row cloning', () => {
    const buf = fakeDocx(TABLE);
    const out = renderDocx(buf, fieldMap, { total: 'NGN 9,100.00' }, itemRows);
    expect(() => new PizZip(out)).not.toThrow();
  });
});
