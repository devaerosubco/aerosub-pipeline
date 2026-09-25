// Unit tests for the row <-> app-shape mapping (PRD §6.20, HT4/HT5).
import { describe, it, expect } from 'vitest';
import {
  companyFromRow, companyToRow, flagFromRow, contactFromRow, contactToRow, recommendedFromRow,
  productFromRow, productToRow, taskFromRow, competitorFromRow, competitorToRow, campaignFromRow, campaignToRow,
  newsFromRow, newsToRow, researchFromRow, eventFromRow, eventToRow, attendeeFromRow, attendeeToRow,
  connectorFromRow, activityFromRow, categoryFromRow,
  serviceFromRow, serviceToRow, companyServiceFromRow,
  quoteTemplateFromRow, quoteTemplateToRow, quoteFromRow, quoteToRow, quoteLineItemFromRow, quoteLineItemToRow,
  rfqFromRow, rfqToRow, rfqItemFromRow, rfqItemToRow,
} from './store.js';

describe('companies', () => {
  it('round-trips the fields companyToRow writes', () => {
    const app = {
      id: 'seplat', name: 'Seplat Energy Plc', type: 'Indigenous', priority: 'high', stage: 'contact',
      sector: 'Oil & Gas — Upstream',
      summary: 'A summary', notes: 'Some notes',
      painPoints: ['pain one', 'pain two'], currentSolutions: ['vendor x'],
    };
    const row = companyToRow(app);
    expect(row.pain_points).toEqual(app.painPoints);
    expect(row.current_solutions).toEqual(app.currentSolutions);
    expect(row.sector).toBe(app.sector);
    const back = companyFromRow({ id: app.id, ...row });
    expect(back.name).toBe(app.name);
    expect(back.painPoints).toEqual(app.painPoints);
    expect(back.currentSolutions).toEqual(app.currentSolutions);
    expect(back.stage).toBe('contact');
    expect(back.sector).toBe(app.sector);
  });

  it('defaults sector to "" when missing (companyToRow nulls it; companyFromRow blanks it)', () => {
    const row = companyToRow({ name: 'X' });
    expect(row.sector).toBeNull();
    const back = companyFromRow({ id: 'x', name: 'X', sector: null });
    expect(back.sector).toBe('');
  });

  it('maps visibility/owner_id/assigned_to (V2 HT-F) — companyToRow never emits them (DB-defaulted/admin-set)', () => {
    const c = companyFromRow({ id: 'x', name: 'X', owner_id: 'u1', assigned_to: 'u2', visibility: 'personal' });
    expect(c.ownerId).toBe('u1');
    expect(c.assignedTo).toBe('u2');
    expect(c.visibility).toBe('personal');
    const row = companyToRow({ name: 'X', ownerId: 'u1', visibility: 'personal' });
    expect(row.owner_id).toBeUndefined();
    expect(row.visibility).toBeUndefined();
  });

  it('defaults text[] columns to [] when the DB returns null', () => {
    const c = companyFromRow({ id: 'x', name: 'X', pain_points: null, current_solutions: null });
    expect(c.painPoints).toEqual([]);
    expect(c.currentSolutions).toEqual([]);
  });
});

describe('nested company entities', () => {
  it('maps company_flags rows', () => {
    const f = flagFromRow({ id: 'f1', company_id: 'c1', type: 'critical', text: 'watch this' });
    expect(f).toEqual({ id: 'f1', companyId: 'c1', type: 'critical', text: 'watch this' });
  });

  it('maps contacts.position -> pos', () => {
    const ct = contactFromRow({
      id: 'ct1', company_id: 'c1', name: 'Jane', position: 'CFO', email: '', phone: '',
      linkedin: '', verified: true, last_contact: '2026-01-01', next_follow_up: null,
    });
    expect(ct.pos).toBe('CFO');
    expect(ct.verified).toBe(true);
    expect(ct.nextFollowUp).toBe('');
  });

  it('round-trips a contact through contactToRow -> contactFromRow', () => {
    const app = { name: 'Jane Doe', pos: 'CFO', email: 'jane@example.com', phone: '+1', linkedin: 'linkedin.com/in/jane', verified: true, lastContact: '2026-01-01', nextFollowUp: '2026-02-01' };
    const row = contactToRow(app);
    expect(row.position).toBe('CFO');
    expect(row.last_contact).toBe('2026-01-01');
    expect(row.next_follow_up).toBe('2026-02-01');
    const back = contactFromRow({ id: 'ct2', company_id: 'c1', ...row });
    expect(back.pos).toBe(app.pos);
    expect(back.verified).toBe(true);
    expect(back.nextFollowUp).toBe(app.nextFollowUp);
  });

  it('maps company_products -> {sol, why} (the "recommended" shape)', () => {
    const r = recommendedFromRow({ id: 'cp1', company_id: 'c1', product_id: 'drone', rationale: 'fits well' });
    expect(r.sol).toBe('drone');
    expect(r.why).toBe('fits well');
  });
});

describe('products', () => {
  it('maps highlights text[] 1:1', () => {
    const p = productFromRow({ id: 'drone', name: 'Drone', tag: 'Aerial', kind: 'Product', status: 'Active', blurb: '', highlights: ['a', 'b'] });
    expect(p.highlights).toEqual(['a', 'b']);
  });
  it('round-trips through productToRow -> productFromRow', () => {
    const app = { name: 'Flare Survey', tag: 'Aerial', kind: 'Offer', status: 'Pilot', blurb: 'b', highlights: ['h1', 'h2'] };
    const row = productToRow(app);
    expect(row.highlights).toEqual(app.highlights);
    const back = productFromRow({ id: 'x', ...row });
    expect(back.kind).toBe('Offer');
    expect(back.status).toBe('Pilot');
    expect(back.highlights).toEqual(app.highlights);
  });
  it('productToRow defaults kind/status when missing', () => {
    const row = productToRow({ name: 'X' });
    expect(row.kind).toBe('Product');
    expect(row.status).toBe('Active');
    expect(row.highlights).toEqual([]);
  });

  it('round-trips the V2 HT-B Store fields (category, vendor, price, oem, paths)', () => {
    const app = {
      name: 'ROV Kit', categoryId: 'rov-systems', vendorName: 'Acme ROV Co',
      datasheetPath: 'products/x/datasheet/abc.pdf', imagePaths: ['products/x/images/1.jpg'],
      priceAmount: 25000, priceCurrency: 'USD', oem: true,
    };
    const row = productToRow(app);
    expect(row.category_id).toBe('rov-systems');
    expect(row.oem).toBe(true);
    expect(row.price_amount).toBe(25000);
    const back = productFromRow({ id: 'p1', ...row });
    expect(back.categoryId).toBe(app.categoryId);
    expect(back.vendorName).toBe(app.vendorName);
    expect(back.datasheetPath).toBe(app.datasheetPath);
    expect(back.imagePaths).toEqual(app.imagePaths);
    expect(back.priceAmount).toBe(25000);
    expect(back.oem).toBe(true);
  });

  it('productFromRow treats a null price as null, not 0, and defaults oem/paths', () => {
    const p = productFromRow({ id: 'p2', name: 'X', price_amount: null, image_paths: null });
    expect(p.priceAmount).toBeNull();
    expect(p.oem).toBe(false);
    expect(p.imagePaths).toEqual([]);
  });
});

describe('services (V2 HT-B)', () => {
  it('round-trips through serviceToRow -> serviceFromRow', () => {
    const app = {
      name: 'Crawler UT Survey', categoryId: 'crawler-ut-manual-ndt', status: 'Pilot',
      blurb: 'b', highlights: ['h1'], priceAmount: 5000, priceCurrency: 'NGN', imagePaths: ['services/x/1.jpg'],
    };
    const row = serviceToRow(app);
    expect(row.category_id).toBe(app.categoryId);
    const back = serviceFromRow({ id: 's1', ...row });
    expect(back.name).toBe(app.name);
    expect(back.categoryId).toBe(app.categoryId);
    expect(back.status).toBe('Pilot');
    expect(back.priceAmount).toBe(5000);
    expect(back.imagePaths).toEqual(app.imagePaths);
  });

  it('maps company_services -> {svc, why} (the "recommendedServices" shape)', () => {
    const r = companyServiceFromRow({ id: 'cs1', company_id: 'c1', service_id: 's1', rationale: 'fits well' });
    expect(r.svc).toBe('s1');
    expect(r.why).toBe('fits well');
  });
});

describe('tasks', () => {
  it('maps a general task (company_id null) to companyId ""', () => {
    const t = taskFromRow({ id: 't1', title: 'Do a thing', company_id: null, due: '2026-01-01', priority: 'high', done: false });
    expect(t.companyId).toBe('');
  });

  it('maps visibility/owner_id/assigned_to (V2 HT-F)', () => {
    const t = taskFromRow({ id: 't2', title: 'X', owner_id: 'u1', assigned_to: 'u2', visibility: 'personal' });
    expect(t.ownerId).toBe('u1');
    expect(t.assignedTo).toBe('u2');
    expect(t.visibility).toBe('personal');
  });

  it('defaults visibility to "general" when missing (matches the DB default for pre-migration rows)', () => {
    const t = taskFromRow({ id: 't3', title: 'X', visibility: undefined });
    expect(t.visibility).toBe('general');
  });
});

describe('competitors + campaigns', () => {
  it('maps campaign field names, including sweet_spot -> sweetSpot and source_url -> sourceUrl', () => {
    const cp = campaignFromRow({
      id: 'c1', competitor_id: 'co1', title: 'A campaign', type: 'Current', date: '2026-01-01',
      source_url: 'https://example.com', relevance: 'Direct overlap', summary: 's', performance: 'p',
      gap: 'g', sweet_spot: 'ss', verdict: 'compete',
    });
    expect(cp.sourceUrl).toBe('https://example.com');
    expect(cp.sweetSpot).toBe('ss');
    expect(cp.verdict).toBe('compete');
  });

  it('round-trips a campaign through campaignToRow -> campaignFromRow (regression: sourceUrl, not url)', () => {
    const app = { title: 'A campaign', type: 'Current', date: '2026-01-01', sourceUrl: 'https://example.com', relevance: 'Watch', summary: 's', performance: 'p', gap: 'g', sweetSpot: 'ss', verdict: 'watch' };
    const row = campaignToRow(app);
    expect(row.source_url).toBe(app.sourceUrl);
    expect(row.sweet_spot).toBe(app.sweetSpot);
    const back = campaignFromRow({ id: 'c2', competitor_id: 'co1', ...row });
    expect(back.sourceUrl).toBe(app.sourceUrl);
  });

  it('round-trips a competitor through competitorToRow -> competitorFromRow', () => {
    const app = { name: 'Rival', hq: 'Lagos', website: 'rival.com', notes: 'n', modality: 'Drone', threat: 'Direct' };
    const row = competitorToRow(app);
    const back = competitorFromRow({ id: 'co2', ...row });
    expect(back.name).toBe(app.name);
    expect(back.website).toBe(app.website);
  });

  it('maps a competitor row', () => {
    const co = competitorFromRow({ id: 'co1', name: 'Rival', hq: 'Lagos', website: 'rival.com', notes: '', modality: 'Drone', threat: 'Direct' });
    expect(co.campaigns).toEqual([]);
    expect(co.modality).toBe('Drone');
  });
});

describe('news', () => {
  it('maps a null kind (General) through unchanged, and toRow turns "" back into null', () => {
    const n = newsFromRow({ id: 'n1', title: 'Headline', source: 'Src', url: '', date: '2026-01-01', kind: null, ref_id: null, live: false });
    expect(n.kind).toBeFalsy();
    const row = newsToRow({ title: 'Headline', source: 'Src', url: '', date: '2026-01-01', kind: '', refId: '' });
    expect(row.kind).toBeNull();
    expect(row.ref_id).toBeNull();
  });

  it('maps company/product kind + ref_id -> refId', () => {
    const n = newsFromRow({ id: 'n2', title: 'H', source: '', url: '', date: '2026-01-01', kind: 'company', ref_id: 'seplat', live: true });
    expect(n.kind).toBe('company');
    expect(n.refId).toBe('seplat');
    expect(n.live).toBe(true);
  });
});

describe('research clips', () => {
  it('maps snake_case contact_* fields to camelCase', () => {
    const r = researchFromRow({
      id: 'r1', title: 'Clip', url: '', captured_at: '2026-01-01T00:00:00Z', summary: '', potential: '',
      contact_name: 'Jane', contact_email: 'jane@example.com', contact_phone: '', contact_linkedin: '', company_id: null,
    });
    expect(r.contactName).toBe('Jane');
    expect(r.contactEmail).toBe('jane@example.com');
    expect(r.companyId).toBe('');
  });
});

describe('events + attendees', () => {
  it('maps benefits text[] and nests attendees separately', () => {
    const e = eventFromRow({
      id: 'ev1', name: 'ADIPEC', organizer: '', location: '', start_date: '2026-11-09', end_date: '2026-11-12',
      cost: '', currency: 'USD', website: '', benefits: ['b1', 'b2'], notes: '',
    });
    expect(e.benefits).toEqual(['b1', 'b2']);
    expect(e.attendees).toEqual([]);
    const a = attendeeFromRow({ id: 'a1', event_id: 'ev1', name: 'Someone', company_id: null, status: 'Likely attends' });
    expect(a.eventId).toBe('ev1');
    expect(a.companyId).toBe('');
  });

  it('round-trips an event through eventToRow -> eventFromRow', () => {
    const app = {
      name: 'ADIPEC', organizer: 'dmg events', location: 'Abu Dhabi',
      startDate: '2026-11-09', endDate: '2026-11-12', cost: '~$1,500', currency: 'USD',
      website: 'adipec.com', benefits: ['reach', 'partners'], notes: 'go early',
    };
    const back = eventFromRow({ id: 'ev9', ...eventToRow(app) });
    expect(back.name).toBe(app.name);
    expect(back.startDate).toBe(app.startDate);
    expect(back.benefits).toEqual(app.benefits);
    expect(back.notes).toBe(app.notes);
  });

  it('eventToRow nulls empty optionals but keeps name, defaults currency', () => {
    const row = eventToRow({ name: 'X', benefits: [] });
    expect(row.name).toBe('X');
    expect(row.organizer).toBeNull();
    expect(row.start_date).toBeNull();
    expect(row.currency).toBe('USD');
    expect(row.benefits).toEqual([]);
  });

  it('attendeeToRow maps companyId -> company_id and nulls the blanks', () => {
    expect(attendeeToRow({ name: 'A', companyId: 'seplat', status: 'Confirmed' }))
      .toEqual({ name: 'A', company_id: 'seplat', status: 'Confirmed' });
    expect(attendeeToRow({ name: 'B' }))
      .toEqual({ name: 'B', company_id: null, status: null });
  });
});

describe('connectors + activity log', () => {
  it('maps a connector row', () => {
    const c = connectorFromRow({ id: 'con1', name: 'LinkedIn', type: 'Contact research', url: 'linkedin.com', notes: '' });
    expect(c.name).toBe('LinkedIn');
  });
  it('maps an activity_log row to the prototype {ts, user, action, detail} shape', () => {
    const a = activityFromRow({ id: 'act1', created_at: '2026-01-01T00:00:00Z', actor_name: 'Jane Doe', action: 'Signed in', detail: '' });
    expect(a.ts).toBe('2026-01-01T00:00:00Z');
    expect(a.user).toBe('Jane Doe');
  });
  it('falls back to "Unattributed" when actor_name is null', () => {
    const a = activityFromRow({ id: 'act2', created_at: '2026-01-01T00:00:00Z', actor_name: null, action: 'Did a thing', detail: null });
    expect(a.user).toBe('Unattributed');
  });
});

describe('categories (V2 Phase 0 — same shape for product_categories and service_categories)', () => {
  it('maps a category row', () => {
    const c = categoryFromRow({ id: 'drone-uav-systems', name: 'Drone/UAV Systems', created_at: '2026-01-01', updated_at: '2026-01-01' });
    expect(c).toEqual({ id: 'drone-uav-systems', name: 'Drone/UAV Systems' });
  });
});

describe('quotes (V2 HT-D)', () => {
  it('round-trips a quote template through quoteTemplateToRow -> quoteTemplateFromRow', () => {
    const app = { name: 'Standard Quote', kind: 'Quote', filePath: 'quote-templates/t1/a.html', fieldMap: { '{{total}}': 'total' } };
    const row = quoteTemplateToRow(app);
    expect(row.file_path).toBe(app.filePath);
    const back = quoteTemplateFromRow({ id: 't1', ...row });
    expect(back.filePath).toBe(app.filePath);
    expect(back.fieldMap).toEqual(app.fieldMap);
  });

  it('quoteTemplateToRow/FromRow defaults fileType to html, round-trips docx explicitly', () => {
    const htmlApp = { name: 'HTML tpl', kind: 'Quote', filePath: 'a.html', fieldMap: {} };
    expect(quoteTemplateToRow(htmlApp).file_type).toBe('html');
    expect(quoteTemplateFromRow({ id: 't1', ...quoteTemplateToRow(htmlApp) }).fileType).toBe('html');

    const docxApp = { name: 'Word tpl', kind: 'Quote', filePath: 'b.docx', fieldMap: {}, fileType: 'docx' };
    expect(quoteTemplateToRow(docxApp).file_type).toBe('docx');
    expect(quoteTemplateFromRow({ id: 't2', ...quoteTemplateToRow(docxApp) }).fileType).toBe('docx');
  });

  it('round-trips a quote through quoteToRow -> quoteFromRow', () => {
    const app = { templateId: 't1', companyId: 'seplat', kind: 'Proforma', quoteNumber: 'Q-001', markupPercent: 25, currency: 'USD', notes: 'n' };
    const row = quoteToRow(app);
    expect(row.markup_percent).toBe(25);
    const back = quoteFromRow({ id: 'q1', ...row });
    expect(back.companyId).toBe(app.companyId);
    expect(back.kind).toBe('Proforma');
    expect(back.markupPercent).toBe(25);
    expect(back.currency).toBe('USD');
  });

  it('quoteFromRow defaults markupPercent to 30 when null', () => {
    const q = quoteFromRow({ id: 'q2', kind: 'Quote', markup_percent: null });
    expect(q.markupPercent).toBe(30);
  });

  it('round-trips a line item through quoteLineItemToRow -> quoteLineItemFromRow', () => {
    const app = { quoteId: 'q1', itemType: 'product', itemId: 'drone', description: 'Aerial Drone Inspection', qty: 2, unitCost: 1000, markupMultiplier: 1.3, position: 0 };
    const row = quoteLineItemToRow(app);
    expect(row.unit_cost).toBe(1000);
    const back = quoteLineItemFromRow({ id: 'li1', ...row });
    expect(back.itemType).toBe('product');
    expect(back.qty).toBe(2);
    expect(back.markupMultiplier).toBe(1.3);
  });

  it('round-trips sourceRfqId (V2 HT-E — the RFQ -> quote link)', () => {
    const row = quoteToRow({ kind: 'Quote', sourceRfqId: 'rfq1' });
    expect(row.source_rfq_id).toBe('rfq1');
    const back = quoteFromRow({ id: 'q3', kind: 'Quote', source_rfq_id: 'rfq1' });
    expect(back.sourceRfqId).toBe('rfq1');
  });
});

describe('rfqs (V2 HT-E)', () => {
  it('round-trips an RFQ through rfqToRow -> rfqFromRow', () => {
    const app = { title: 'Amni RFQ 7972', reference: 'RFQ 7972', companyId: 'amni', parentRfqId: '', notes: 'n' };
    const row = rfqToRow(app);
    expect(row.title).toBe(app.title);
    expect(row.company_id).toBe('amni');
    const back = rfqFromRow({ id: 'rfq1', status: 'draft', ...row });
    expect(back.title).toBe(app.title);
    expect(back.reference).toBe(app.reference);
    expect(back.status).toBe('draft');
  });

  it('rfqToRow never emits status or assigned_to (admin-only, set via dedicated setters)', () => {
    const row = rfqToRow({ title: 'X', status: 'won', assignedTo: 'someone' });
    expect(row.status).toBeUndefined();
    expect(row.assigned_to).toBeUndefined();
  });

  it('round-trips an rfq_item through rfqItemToRow -> rfqItemFromRow, incl. vendor fields', () => {
    const app = { rfqId: 'rfq1', itemType: 'service', itemId: 's1', description: 'ROV Survey', vendorName: 'Acme ROV', vendorVerified: true, qty: 1, unitCost: 5000, markupMultiplier: 1.3 };
    const row = rfqItemToRow(app);
    expect(row.vendor_verified).toBe(true);
    const back = rfqItemFromRow({ id: 'ri1', ...row });
    expect(back.vendorName).toBe('Acme ROV');
    expect(back.vendorVerified).toBe(true);
    expect(back.itemType).toBe('service');
  });
});
