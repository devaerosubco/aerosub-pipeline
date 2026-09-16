// RLS test matrix (PRD section 14).  Run against local: node scripts/rls-test.mjs
// Extended in HT2/HT13 with the member + profile-less + invite cases.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// load .env.test
for (const line of readFileSync(fileURLToPath(new URL('../.env.test', import.meta.url)), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALL_TABLES = [
  'profiles', 'invites', 'companies', 'company_flags', 'company_stage_changes',
  'contacts', 'products', 'company_products', 'competitors', 'competitor_campaigns',
  'tasks', 'research_clips', 'events', 'event_attendees', 'news_items',
  'connectors', 'activity_log', 'app_settings',
];

let pass = 0, fail = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); cond ? pass++ : fail++; };

// --- anon: can read nothing, write nothing ---------------------------------
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
for (const t of ALL_TABLES) {
  const { data, error } = await anon.from(t).select('*').limit(1);
  ok((data?.length ?? 0) === 0, `anon select ${t} -> 0 rows${error ? ' (denied)' : ''}`);
}
{
  const { error } = await anon.from('companies').insert({ id: 'x-anon', name: 'nope' });
  ok(!!error, 'anon insert companies -> denied');
}

// --- service_role: bypasses RLS (sanity) ----------------------------------
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
{
  const { count } = await svc.from('companies').select('*', { count: 'exact', head: true });
  ok(count === 10, `service_role sees all companies (${count})`);
}

// --- helpers to make a confirmed member without a browser ------------------
const MAILPIT = 'http://127.0.0.1:54324';
const uniq = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function makeMember(fullName) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = uniq('tok');
  const email = uniq('m') + '@example.com';
  const password = 'a-strong-password-1';
  await svc.from('invites').insert({ id: crypto.randomUUID(), token });
  const since = new Date().toISOString();
  await c.auth.signUp({ email, password, options: { data: { full_name: fullName, invite_token: token }, emailRedirectTo: 'http://localhost:5173' } });
  let link = null;
  for (let i = 0; i < 25 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=30`)).json();
    const hit = list.messages.find((m) => m.To?.some((t) => t.Address === email) && m.Created > since);
    if (hit) { const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json(); const m = (full.Text || '').match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/); if (m) link = m[0]; }
    if (!link) await new Promise((r) => setTimeout(r, 200));
  }
  const loc = (await fetch(link, { redirect: 'manual' })).headers.get('location') || '';
  const p = new URLSearchParams(loc.split('#')[1] || '');
  const client = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  await client.auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
  const uid = (await svc.from('profiles').select('id').eq('email', email).single()).data.id;
  return { client, uid, email };
}

const memberA = await makeMember('Member A');
const memberB = await makeMember('Member B');

// --- member: full CRUD on the 15 flat tables ------------------------------
const FLAT = ['companies', 'company_flags', 'contacts', 'products', 'company_products',
  'competitors', 'competitor_campaigns', 'tasks', 'research_clips', 'events',
  'event_attendees', 'news_items', 'connectors', 'app_settings', 'invites'];
{
  let readOk = 0;
  for (const t of FLAT) {
    const { error } = await memberA.client.from(t).select('*').limit(1);
    if (!error) readOk++;
  }
  ok(readOk === FLAT.length, `member can select every flat table (${readOk}/${FLAT.length})`);

  const cid = 'rls-co-' + Date.now();
  const insC = await memberA.client.from('companies').insert({ id: cid, name: 'RLS test co', priority: 'low', stage: 'research' });
  ok(!insC.error, 'member can insert a company');
  const updC = await memberA.client.from('companies').update({ notes: 'edited by member' }).eq('id', cid);
  ok(!updC.error, 'member can update any company (flat model, no per-row owner)');
  const delC = await memberA.client.from('companies').delete().eq('id', cid);
  ok(!delC.error, 'member can delete a company');
}

// --- profiles: read all, update ONLY your own row, id/email locked --------
{
  const { data: all } = await memberA.client.from('profiles').select('id').limit(10);
  ok((all?.length ?? 0) >= 2, 'member can read every profile (team list)');

  const okOwn = await memberA.client.from('profiles').update({ department: 'Eng' }).eq('id', memberA.uid).select();
  ok((okOwn.data?.length ?? 0) === 1, 'member can update their own profile row');

  const other = await memberA.client.from('profiles').update({ department: 'hijack' }).eq('id', memberB.uid).select();
  ok((other.data?.length ?? 0) === 0, "member CANNOT update another member's profile row");

  const idChange = await memberA.client.from('profiles').update({ id: crypto.randomUUID() }).eq('id', memberA.uid);
  ok(!!idChange.error, 'changing profiles.id is rejected (column-lock trigger)');
  const emailChange = await memberA.client.from('profiles').update({ email: 'new@example.com' }).eq('id', memberA.uid);
  ok(!!emailChange.error, 'changing profiles.email is rejected (column-lock trigger)');

  const insP = await memberA.client.from('profiles').insert({ id: crypto.randomUUID(), email: 'x@x.com' });
  ok(!!insP.error, 'member CANNOT insert a profiles row directly (trigger-only)');
  const delP = await memberA.client.from('profiles').delete().eq('id', memberB.uid);
  ok((await svc.from('profiles').select('id').eq('id', memberB.uid).maybeSingle()).data !== null, 'member CANNOT delete a profiles row');
}

// --- company_stage_changes: select only, no client writes ----------------
{
  const { error: selErr } = await memberA.client.from('company_stage_changes').select('*').limit(1);
  ok(!selErr, 'member can select company_stage_changes (history)');
  const ins = await memberA.client.from('company_stage_changes').insert({ id: crypto.randomUUID(), company_id: 'seplat', to_stage: 'won' });
  ok(!!ins.error, 'member CANNOT insert company_stage_changes (trigger-only)');
  const upd = await memberA.client.from('company_stage_changes').update({ to_stage: 'won' }).neq('id', '');
  ok(!!upd.error || (upd.data?.length ?? 0) === 0, 'member CANNOT update company_stage_changes');

  // a real stage move DOES write a history row (BYPASSRLS in effect)
  const cur = (await svc.from('companies').select('stage').eq('id', 'seplat').single()).data.stage;
  const next = cur === 'discussion' ? 'proposal' : 'discussion';
  const before = (await svc.from('company_stage_changes').select('id', { count: 'exact', head: true })).count;
  await memberA.client.from('companies').update({ stage: next }).eq('id', 'seplat');
  const after = (await svc.from('company_stage_changes').select('id', { count: 'exact', head: true })).count;
  ok(after === before + 1, 'a member stage move writes exactly one company_stage_changes row via the trigger');
}

// --- invites: consumed_at / consumed_by are not client-writable ----------
{
  const iid = crypto.randomUUID();
  await memberA.client.from('invites').insert({ id: iid, created_by: memberA.uid });
  const tamper = await memberA.client.from('invites').update({ consumed_at: new Date().toISOString(), consumed_by: memberA.uid }).eq('id', iid).select();
  const row = (await svc.from('invites').select('consumed_at, consumed_by').eq('id', iid).single()).data;
  ok(row.consumed_at === null && row.consumed_by === null,
    'a member writing invites.consumed_at/consumed_by has no effect (signup-trigger-only in practice)');
  await svc.from('invites').delete().eq('id', iid);
}

// --- profile-less session: valid JWT, no profile row -> sees nothing -----
{
  await svc.from('profiles').delete().eq('id', memberB.uid); // simulate offboarding
  const rpc = await memberB.client.rpc('is_member');
  ok(rpc.data === false, 'a profile-less session: is_member() returns false');
  let empty = 0;
  for (const t of ALL_TABLES) {
    const { data } = await memberB.client.from(t).select('*').limit(1);
    if ((data?.length ?? 0) === 0) empty++;
  }
  ok(empty === ALL_TABLES.length, `a profile-less session reads 0 rows from every table (${empty}/${ALL_TABLES.length})`);
  const w = await memberB.client.from('companies').insert({ id: crypto.randomUUID(), name: 'nope', priority: 'low', stage: 'research' });
  ok(!!w.error, 'a profile-less session cannot write');
}

console.log(`\nrls-test: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
