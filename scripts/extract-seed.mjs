// Generates supabase/seed.sql from the prototype's seedData() (via
// scripts/seed-source.generated.mjs — run scripts/gen-seed-source.mjs first).
//
// - text[] columns become ARRAY[...]::text[] literals
// - company.recommended[] -> company_products (product_id, rationale)
// - relative dates (task.due, news.date) are rebased to current_date + <offset>
// - every INSERT is ON CONFLICT (id) DO NOTHING, so re-running is a no-op
//
//   node scripts/extract-seed.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { seedData, SOLUTIONS, STAGES } =
  await import(pathToFileURL(join(ROOT, 'scripts', 'seed-source.generated.mjs')).href);

const GEN_TODAY = new Date();
const genTodayMs = Date.UTC(GEN_TODAY.getUTCFullYear(), GEN_TODAY.getUTCMonth(), GEN_TODAY.getUTCDate());
const d = seedData();

// ---- helpers ---------------------------------------------------------------
const q = (v) => {
  if (v === null || v === undefined || v === '') return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const bool = (v) => (v ? 'true' : 'false');
const arr = (a) => {
  if (!a || a.length === 0) return `'{}'::text[]`;
  return `array[${a.map((x) => q(x)).join(', ')}]::text[]`;
};
// a plain 'YYYY-MM-DD' date literal, or null
const dateLit = (s) => (s ? `'${s}'::date` : 'null');
// relative date -> current_date + N  (N derived from the value seedData() produced today)
const relDate = (s) => {
  if (!s) return 'null';
  const [y, m, dd] = s.split('-').map(Number);
  const offset = Math.round((Date.UTC(y, m - 1, dd) - genTodayMs) / 86400000);
  return offset === 0 ? 'current_date' : `current_date + ${offset}`;
};

const problems = [];
const companyIds = new Set(d.companies.map((c) => c.id));
const productIds = new Set(SOLUTIONS.map((s) => s.id));
const stageIds = new Set(STAGES.map((s) => s.id));

const chunks = [];
const table = (name, cols, rows) => {
  if (!rows.length) return;
  chunks.push(
    `insert into public.${name} (${cols.join(', ')}) values\n` +
      rows.map((r) => `  (${r.join(', ')})`).join(',\n') +
      `\non conflict (id) do nothing;\n`
  );
};

// ---- products (prototype `solutions`) ------------------------------------
// category_id isn't part of the prototype's seedData() (a V2 HT-B-only
// column) — mapped here to mirror the same product-id -> category-id
// backfill the 20260917130001 migration does for an already-seeded DB.
// products.category_id is NOT NULL, so every id needs an entry (falls back
// to 'other' if a future product id isn't in this map).
const PRODUCT_CATEGORY_ID = {
  drone: 'drone-uav-systems', rov: 'rov-systems', crawler: 'crawler-systems',
  cleaning: 'cleaning-equipment', platform: 'inspection-platforms', surveillance: 'surveillance-systems',
};
table('products', ['id', 'name', 'tag', 'kind', 'status', 'blurb', 'highlights', 'category_id'],
  d.solutions.map((s) => [q(s.id), q(s.name), q(s.tag), q(s.kind), q(s.status), q(s.blurb), arr(s.highlights), q(PRODUCT_CATEGORY_ID[s.id] || 'other')]));

// ---- companies ----------------------------------------------------------
for (const c of d.companies) if (!stageIds.has(c.stage)) problems.push(`company ${c.id}: bad stage "${c.stage}"`);
table('companies',
  ['id', 'name', 'type', 'priority', 'stage', 'summary', 'notes', 'pain_points', 'current_solutions'],
  d.companies.map((c) => [
    q(c.id), q(c.name), q(c.type), q(c.priority), q(c.stage),
    q(c.summary), q(c.notes || ''), arr(c.painPoints), arr(c.currentSolutions),
  ]));

// ---- company_flags ----------------------------------------------------
const flagRows = [];
for (const c of d.companies)
  (c.flags || []).forEach((f, i) =>
    flagRows.push([q(`${c.id}-flag${i}`), q(c.id), q(f.type), q(f.text), String(i)]));
table('company_flags', ['id', 'company_id', 'type', 'text', 'position'], flagRows);

// ---- contacts ---------------------------------------------------------
const contactRows = [];
for (const c of d.companies)
  for (const ct of c.contacts)
    contactRows.push([
      q(ct.id), q(c.id), q(ct.name), q(ct.pos), q(ct.email), q(ct.phone), q(ct.linkedin),
      bool(ct.verified), dateLit(ct.lastContact), dateLit(ct.nextFollowUp),
    ]);
table('contacts',
  ['id', 'company_id', 'name', 'position', 'email', 'phone', 'linkedin', 'verified', 'last_contact', 'next_follow_up'],
  contactRows);

// ---- company_products (from recommended[]) --------------------------
const cpRows = [];
for (const c of d.companies)
  (c.recommended || []).forEach((r, i) => {
    if (!productIds.has(r.sol)) problems.push(`company ${c.id}: recommended product "${r.sol}" not in catalog`);
    cpRows.push([q(`${c.id}-cp-${r.sol}`), q(c.id), q(r.sol), q(r.why)]);
    void i;
  });
table('company_products', ['id', 'company_id', 'product_id', 'rationale'], cpRows);

// ---- competitors ----------------------------------------------------
table('competitors', ['id', 'name', 'hq', 'website', 'notes', 'modality', 'threat'],
  d.competitors.map((c) => [q(c.id), q(c.name), q(c.hq), q(c.website), q(c.notes), q(c.modality), q(c.threat)]));

// ---- competitor_campaigns ----------------------------------------
const campRows = [];
for (const co of d.competitors)
  for (const cp of co.campaigns)
    campRows.push([
      q(cp.id), q(co.id), q(cp.title), q(cp.type), dateLit(cp.date), q(cp.sourceUrl), q(cp.relevance),
      q(cp.summary), q(cp.performance), q(cp.gap), q(cp.sweetSpot), q(cp.verdict || 'watch'),
    ]);
table('competitor_campaigns',
  ['id', 'competitor_id', 'title', 'type', 'date', 'source_url', 'relevance', 'summary', 'performance', 'gap', 'sweet_spot', 'verdict'],
  campRows);

// ---- tasks (relative due dates) ---------------------------------
for (const t of d.tasks)
  if (t.companyId && !companyIds.has(t.companyId)) problems.push(`task ${t.id}: company "${t.companyId}" missing`);
table('tasks', ['id', 'title', 'company_id', 'due', 'priority', 'done'],
  d.tasks.map((t) => [q(t.id), q(t.title), q(t.companyId), relDate(t.due), q(t.priority), bool(t.done)]));

// ---- news_items (relative dates) ------------------------------
table('news_items', ['id', 'title', 'source', 'url', 'date', 'kind', 'ref_id', 'live'],
  d.news.map((n) => [q(n.id), q(n.title), q(n.source), q(n.url), relDate(n.date), q(n.kind), q(n.refId), 'false']));

// ---- events -----------------------------------------------------
table('events',
  ['id', 'name', 'organizer', 'location', 'start_date', 'end_date', 'cost', 'currency', 'website', 'benefits', 'notes'],
  d.events.map((e) => [
    q(e.id), q(e.name), q(e.organizer), q(e.location), dateLit(e.startDate), dateLit(e.endDate),
    q(e.cost), q(e.currency || 'USD'), q(e.website), arr(e.benefits), q(e.notes || ''),
  ]));

// ---- event_attendees ------------------------------------------
const attRows = [];
for (const e of d.events)
  for (const a of e.attendees) {
    if (a.companyId && !companyIds.has(a.companyId)) problems.push(`event ${e.id}: attendee company "${a.companyId}" missing`);
    attRows.push([q(a.id), q(e.id), q(a.name), q(a.companyId), q(a.status), String(e.attendees.indexOf(a))]);
  }
table('event_attendees', ['id', 'event_id', 'name', 'company_id', 'status', 'position'], attRows);

// ---- connectors ---------------------------------------------
table('connectors', ['id', 'name', 'type', 'url', 'notes'],
  (d.settings.connectors || []).map((c) => [q(c.id), q(c.name), q(c.type), q(c.url), q(c.notes)]));

// ---- emit --------------------------------------------------
if (problems.length) {
  console.error('SEED INTEGRITY PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const header = `-- GENERATED by scripts/extract-seed.mjs — do not edit.
-- Baseline dataset from the prototype's seedData(). Idempotent (on conflict do nothing).
-- Relative dates (tasks.due, news.date) were rebased to current_date +/- <n> at generation.
-- Not seeded: profiles, invites, activity_log, company_stage_changes, app_settings (migration).

`;
writeFileSync(join(ROOT, 'supabase', 'seed.sql'), header + chunks.join('\n'));
console.log(`wrote supabase/seed.sql  (${chunks.length} tables)`);
console.log(`  companies ${d.companies.length}, contacts ${contactRows.length}, flags ${flagRows.length}, ` +
  `tags ${cpRows.length}, products ${d.solutions.length}, competitors ${d.competitors.length}, ` +
  `campaigns ${campRows.length}, tasks ${d.tasks.length}, news ${d.news.length}, ` +
  `events ${d.events.length}, attendees ${attRows.length}, connectors ${(d.settings.connectors || []).length}`);
