// Replaces the localStorage `Store` (HT4). Loads every table from Supabase
// into the prototype's in-memory `DATA` shape (PRD §6.20) so the render code
// barely changes. Only Companies + News have real Supabase-backed writes as
// of this task — everything else (contacts, tasks, competitors, research,
// events, connectors, activity log) is still read here but keeps being
// mutated in-memory by the old `persist()`-based code until its own Heavy
// Task (HT5-HT9/HT11) adds a matching api/*.js module; those edits are
// session-only and won't survive a reload or "Refresh" until then.
import { supabase } from './supabase.js';

const arr = (v) => (Array.isArray(v) ? v : []);

/* ============================================================
   row -> app-shape (fromRow)
   ============================================================ */

export function companyFromRow(row) {
  return {
    id: row.id, name: row.name, type: row.type || '',
    priority: row.priority, stage: row.stage,
    summary: row.summary || '', notes: row.notes || '',
    painPoints: arr(row.pain_points), currentSolutions: arr(row.current_solutions),
    flags: [], contacts: [], recommended: [], // filled in by assembleCompanies()
  };
}
export function flagFromRow(row) {
  return { id: row.id, companyId: row.company_id, type: row.type, text: row.text };
}
export function contactFromRow(row) {
  return {
    id: row.id, companyId: row.company_id, name: row.name, pos: row.position || '',
    email: row.email || '', phone: row.phone || '', linkedin: row.linkedin || '',
    verified: !!row.verified, lastContact: row.last_contact || '', nextFollowUp: row.next_follow_up || '',
  };
}
export function recommendedFromRow(row) {
  return { id: row.id, companyId: row.company_id, sol: row.product_id, why: row.rationale || '' };
}
export function productFromRow(row) {
  return {
    id: row.id, name: row.name, tag: row.tag || '', kind: row.kind, status: row.status,
    blurb: row.blurb || '', highlights: arr(row.highlights),
  };
}
export function taskFromRow(row) {
  return { id: row.id, title: row.title, companyId: row.company_id || '', due: row.due || '', priority: row.priority, done: !!row.done };
}
export function competitorFromRow(row) {
  return {
    id: row.id, name: row.name, hq: row.hq || '', website: row.website || '', notes: row.notes || '',
    modality: row.modality, threat: row.threat, campaigns: [],
  };
}
export function campaignFromRow(row) {
  return {
    id: row.id, competitorId: row.competitor_id, title: row.title, type: row.type || '',
    date: row.date || '', sourceUrl: row.source_url || '', relevance: row.relevance || '',
    summary: row.summary || '', performance: row.performance || '', gap: row.gap || '',
    sweetSpot: row.sweet_spot || '', verdict: row.verdict,
  };
}
export function campaignToRow(cp) {
  return {
    title: cp.title, type: cp.type || null, date: cp.date || null,
    source_url: cp.sourceUrl || null, relevance: cp.relevance || null,
    summary: cp.summary || null, performance: cp.performance || null,
    gap: cp.gap || null, sweet_spot: cp.sweetSpot || null, verdict: cp.verdict || 'watch',
  };
}
export function competitorToRow(co) {
  return {
    name: co.name, hq: co.hq || null, website: co.website || null,
    notes: co.notes || null, modality: co.modality, threat: co.threat,
  };
}
export function newsFromRow(row) {
  return { id: row.id, title: row.title, source: row.source || '', url: row.url || '', date: row.date, kind: row.kind, refId: row.ref_id || '', live: !!row.live };
}
export function researchFromRow(row) {
  return {
    id: row.id, title: row.title, url: row.url || '', capturedAt: row.captured_at,
    summary: row.summary || '', potential: row.potential || '',
    contactName: row.contact_name || '', contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '', contactLinkedin: row.contact_linkedin || '',
    companyId: row.company_id || '',
  };
}
export function eventFromRow(row) {
  return {
    id: row.id, name: row.name, organizer: row.organizer || '', location: row.location || '',
    startDate: row.start_date || '', endDate: row.end_date || '', cost: row.cost || '',
    currency: row.currency || 'USD', website: row.website || '', benefits: arr(row.benefits),
    notes: row.notes || '', attendees: [],
  };
}
export function attendeeFromRow(row) {
  return { id: row.id, eventId: row.event_id, name: row.name, companyId: row.company_id || '', status: row.status || '' };
}
export function connectorFromRow(row) {
  return { id: row.id, name: row.name, type: row.type || '', url: row.url || '', notes: row.notes || '' };
}
export function activityFromRow(row) {
  return { id: row.id, ts: row.created_at, user: row.actor_name || 'Unattributed', action: row.action, detail: row.detail || '' };
}

/* ============================================================
   app-shape -> row (toRow) — only for the entities with a real api/*.js
   ============================================================ */

export function companyToRow(c) {
  return {
    name: c.name, type: c.type || null, priority: c.priority, stage: c.stage,
    summary: c.summary || null, notes: c.notes || null,
    pain_points: c.painPoints || [], current_solutions: c.currentSolutions || [],
  };
}
export function newsToRow(n) {
  return { title: n.title, source: n.source || null, url: n.url || null, date: n.date, kind: n.kind || null, ref_id: n.refId || null };
}
export function contactToRow(ct) {
  return {
    name: ct.name, position: ct.pos || null, email: ct.email || null, phone: ct.phone || null,
    linkedin: ct.linkedin || null, verified: !!ct.verified,
    last_contact: ct.lastContact || null, next_follow_up: ct.nextFollowUp || null,
  };
}
export function productToRow(p) {
  return {
    name: p.name, tag: p.tag || null, kind: p.kind || 'Product',
    status: p.status || 'Active', blurb: p.blurb || null, highlights: p.highlights || [],
  };
}
export function connectorToRow(c) {
  return { name: c.name, type: c.type || null, url: c.url || null, notes: c.notes || null };
}

/* ============================================================
   assembling nested shapes
   ============================================================ */

function assembleCompanies(companyRows, flagRows, contactRows, recRows) {
  const byId = new Map(companyRows.map(r => [r.id, companyFromRow(r)]));
  flagRows.forEach(r => { const c = byId.get(r.company_id); if (c) c.flags.push(flagFromRow(r)); });
  contactRows.forEach(r => { const c = byId.get(r.company_id); if (c) c.contacts.push(contactFromRow(r)); });
  recRows.forEach(r => { const c = byId.get(r.company_id); if (c) c.recommended.push(recommendedFromRow(r)); });
  return [...byId.values()];
}
function assembleCompetitors(competitorRows, campaignRows) {
  const byId = new Map(competitorRows.map(r => [r.id, competitorFromRow(r)]));
  campaignRows.forEach(r => { const co = byId.get(r.competitor_id); if (co) co.campaigns.push(campaignFromRow(r)); });
  return [...byId.values()];
}
function assembleEvents(eventRows, attendeeRows) {
  const byId = new Map(eventRows.map(r => [r.id, eventFromRow(r)]));
  attendeeRows.forEach(r => { const e = byId.get(r.event_id); if (e) e.attendees.push(attendeeFromRow(r)); });
  return [...byId.values()];
}

/* ============================================================
   fetch helpers
   ============================================================ */

async function sel(table, cols, opts) {
  let q = supabase.from(table).select(cols);
  if (opts?.order) q = q.order(opts.order.col, { ascending: !!opts.order.asc });
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchCompanies() {
  const [companyRows, flagRows, contactRows, recRows] = await Promise.all([
    sel('companies', '*'),
    sel('company_flags', '*'),
    sel('contacts', '*'),
    sel('company_products', '*'),
  ]);
  return assembleCompanies(companyRows, flagRows, contactRows, recRows);
}
async function fetchNews() {
  const rows = await sel('news_items', '*');
  return rows.filter(r => !r.dismissed_at).map(newsFromRow);
}
async function fetchAppSettings() {
  const rows = await sel('app_settings', '*');
  return { lastNewsRefresh: rows[0]?.last_news_refresh || '' };
}

// Research clips are bounded (PRD §16 S-2). loadAll() pulls the newest page;
// the Research view's "Load older clips" button calls loadMoreResearch()
// with the oldest capturedAt it already has.
export const RESEARCH_PAGE = 200;
async function fetchResearchPage(before) {
  let q = supabase.from('research_clips').select('*').order('captured_at', { ascending: false }).limit(RESEARCH_PAGE);
  if (before) q = q.lt('captured_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(researchFromRow);
}
export async function loadMoreResearch(before) {
  const page = await fetchResearchPage(before);
  return { clips: page, end: page.length < RESEARCH_PAGE };
}

// Activity log is bounded the same way (PRD §16 S-2/S-12): newest 100 on
// boot, "Load more" pages older by created_at.
export const ACTIVITY_PAGE = 100;
async function fetchActivityPage(before) {
  let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(ACTIVITY_PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(activityFromRow);
}
export async function loadMoreActivity(before) {
  const page = await fetchActivityPage(before);
  return { rows: page, end: page.length < ACTIVITY_PAGE };
}

/* ============================================================
   loadAll() — the full boot load (PRD §9: "on boot, load every table")
   ============================================================ */

export async function loadAll() {
  const [
    companies, tasks, productRows, competitors, news, research,
    events, connectorRows, activityLog, appSettings,
  ] = await Promise.all([
    fetchCompanies(),
    sel('tasks', '*').then(rows => rows.map(taskFromRow)),
    sel('products', '*'),
    (async () => assembleCompetitors(await sel('competitors', '*'), await sel('competitor_campaigns', '*')))(),
    fetchNews(),
    fetchResearchPage(null),
    (async () => assembleEvents(await sel('events', '*'), await sel('event_attendees', '*')))(),
    sel('connectors', '*'),
    fetchActivityPage(null),
    fetchAppSettings(),
  ]);

  return {
    companies,
    tasks,
    solutions: productRows.map(productFromRow),
    competitors,
    news,
    research,
    events,
    activityLog,
    settings: {
      connectors: connectorRows.map(connectorFromRow),
      lastNewsRefresh: appSettings.lastNewsRefresh,
    },
  };
}

/* ============================================================
   refetchView(name) — re-pull one view's slice on navigate (PRD §9).
   Only companies/dashboard/news are Supabase-backed as of HT4; every other
   view name is a no-op until its own Heavy Task adds a real refetch here.
   ============================================================ */

export async function refetchView(name) {
  if (name === 'companies' || name === 'dashboard') {
    const [companies, news] = await Promise.all([fetchCompanies(), fetchNews()]);
    return { companies, news };
  }
  return null;
}
