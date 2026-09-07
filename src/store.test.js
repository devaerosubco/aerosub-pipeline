// Unit tests for the row <-> app-shape mapping (PRD §6.20, HT4/HT5).
import { describe, it, expect } from 'vitest';
import {
  companyFromRow, companyToRow, flagFromRow, contactFromRow, contactToRow, recommendedFromRow,
  productFromRow, taskFromRow, competitorFromRow, competitorToRow, campaignFromRow, campaignToRow,
  newsFromRow, newsToRow, researchFromRow, eventFromRow, attendeeFromRow,
  connectorFromRow, activityFromRow,
} from './store.js';

describe('companies', () => {
  it('round-trips the fields companyToRow writes', () => {
    const app = {
      id: 'seplat', name: 'Seplat Energy Plc', type: 'Indigenous', priority: 'high', stage: 'contact',
      summary: 'A summary', notes: 'Some notes',
      painPoints: ['pain one', 'pain two'], currentSolutions: ['vendor x'],
    };
    const row = companyToRow(app);
    expect(row.pain_points).toEqual(app.painPoints);
    expect(row.current_solutions).toEqual(app.currentSolutions);
    const back = companyFromRow({ id: app.id, ...row });
    expect(back.name).toBe(app.name);
    expect(back.painPoints).toEqual(app.painPoints);
    expect(back.currentSolutions).toEqual(app.currentSolutions);
    expect(back.stage).toBe('contact');
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
});

describe('tasks', () => {
  it('maps a general task (company_id null) to companyId ""', () => {
    const t = taskFromRow({ id: 't1', title: 'Do a thing', company_id: null, due: '2026-01-01', priority: 'high', done: false });
    expect(t.companyId).toBe('');
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
