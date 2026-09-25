import { describe, it, expect } from 'vitest';
import { detectTokens, computeLineTotals, buildQuoteFieldValues, renderTemplate, buildQuoteMarkdown } from './quoteFields.js';

describe('detectTokens', () => {
  it('finds every distinct {{token}}, in first-seen order, no dupes', () => {
    expect(detectTokens('Hi {{company_name}}, total: {{total}}. Again: {{company_name}}'))
      .toEqual(['company_name', 'total']);
  });
  it('returns [] when there are none', () => {
    expect(detectTokens('<p>plain html</p>')).toEqual([]);
  });
  it('ignores malformed braces', () => {
    expect(detectTokens('{ not a token } {{also not')).toEqual([]);
  });
});

describe('computeLineTotals', () => {
  it('multiplies qty * unitCost * markupMultiplier', () => {
    const [row] = computeLineTotals([{ qty: 2, unitCost: 1000, markupMultiplier: 1.3 }]);
    expect(row.unitPrice).toBeCloseTo(1300);
    expect(row.lineTotal).toBeCloseTo(2600);
  });
});

describe('buildQuoteFieldValues', () => {
  const quote = { kind: 'Quote', quoteNumber: 'Q-1', currency: 'NGN', notes: 'thanks', createdAt: '2026-01-15T00:00:00Z' };
  const lineItems = [{ description: 'Drone Inspection', qty: 1, unitCost: 1000, markupMultiplier: 1.3 }];

  it('computes subtotal === total (no tax line in V1)', () => {
    const values = buildQuoteFieldValues({ quote, lineItems, companyName: 'Seplat' });
    expect(values.subtotal).toBe(values.total);
    expect(values.subtotal).toContain('1,300.00');
  });
  it('escapes the company name and notes', () => {
    const values = buildQuoteFieldValues({ quote: { ...quote, notes: '<script>x</script>' }, lineItems, companyName: '<b>X</b>' });
    expect(values.company_name).not.toContain('<b>');
    expect(values.notes).not.toContain('<script>');
  });
  it('items_table contains every line description', () => {
    const values = buildQuoteFieldValues({ quote, lineItems, companyName: '' });
    expect(values.items_table).toContain('Drone Inspection');
  });

  describe('format: "plain" (.docx templates)', () => {
    it('items_table is one plain line per item, not an HTML table', () => {
      const values = buildQuoteFieldValues({ quote, lineItems, companyName: 'Seplat', format: 'plain' });
      expect(values.items_table).not.toContain('<table');
      expect(values.items_table).toContain('Drone Inspection');
      expect(values.items_table).toContain('1,300.00');
    });
    it('does NOT HTML-escape scalar fields (docx.js XML-escapes at render time instead)', () => {
      const values = buildQuoteFieldValues({ quote, lineItems, companyName: 'Smith & Sons', format: 'plain' });
      expect(values.company_name).toBe('Smith & Sons'); // raw — would double-escape if this also HTML-escaped
    });
    it('joins multiple line items with \\n (docx.js turns this into a real Word line break)', () => {
      const twoItems = [
        { description: 'Item A', qty: 1, unitCost: 100, markupMultiplier: 1 },
        { description: 'Item B', qty: 2, unitCost: 200, markupMultiplier: 1 },
      ];
      const values = buildQuoteFieldValues({ quote, lineItems: twoItems, companyName: '', format: 'plain' });
      expect(values.items_table.split('\n')).toHaveLength(2);
    });
  });
});

describe('renderTemplate', () => {
  it('replaces every mapped token', () => {
    const out = renderTemplate('<h1>{{company_name}}</h1><p>{{total}}</p>', { company_name: 'company_name', total: 'total' }, { company_name: 'Seplat', total: 'NGN 1,300.00' });
    expect(out).toBe('<h1>Seplat</h1><p>NGN 1,300.00</p>');
  });
  it('leaves an unmapped token untouched', () => {
    const out = renderTemplate('{{mystery}}', {}, {});
    expect(out).toBe('{{mystery}}');
  });
});

describe('buildQuoteMarkdown', () => {
  it('includes the kind, client and total', () => {
    const md = buildQuoteMarkdown({
      quote: { kind: 'Proforma', quoteNumber: 'P-1', currency: 'USD', createdAt: '2026-01-01' },
      lineItems: [{ description: 'ROV Survey', qty: 1, unitCost: 500, markupMultiplier: 1.3 }],
      companyName: 'Aradel',
    });
    expect(md).toContain('# Proforma P-1');
    expect(md).toContain('Aradel');
    expect(md).toContain('ROV Survey');
    expect(md).toContain('650.00');
  });
});
