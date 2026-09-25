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
  'product_categories', 'service_categories', 'services', 'company_services',
  'store_item_shares', 'quote_templates', 'quotes', 'quote_line_items',
  'rfqs', 'rfq_items',
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

// --- member: full CRUD on the (mostly) flat tables ------------------------
// companies/tasks are no longer flat as of V2 HT-F (personal-by-default,
// visibility-gated) — kept in this array anyway because a plain
// `select().limit(1)` never *errors* under row-filtering RLS (it just
// returns fewer/zero rows), so the read-coverage loop below is still a
// valid check; the companies-specific CRUD asserts right after it are
// updated to test "the owner can edit their own row", not flatness.
const FLAT = ['companies', 'company_flags', 'contacts', 'products', 'company_products',
  'competitors', 'competitor_campaigns', 'tasks', 'research_clips', 'events',
  'event_attendees', 'news_items', 'connectors', 'app_settings', 'invites',
  'services', 'company_services', 'quote_templates', 'quotes', 'quote_line_items',
  'rfqs', 'rfq_items'];
{
  let readOk = 0;
  for (const t of FLAT) {
    const { error } = await memberA.client.from(t).select('*').limit(1);
    if (!error) readOk++;
  }
  ok(readOk === FLAT.length, `member can select every table without an RLS error (${readOk}/${FLAT.length})`);

  const cid = 'rls-co-' + Date.now();
  const insC = await memberA.client.from('companies').insert({ id: cid, name: 'RLS test co', priority: 'low', stage: 'research' });
  ok(!insC.error, 'member can insert a company (V2 HT-F: lands personal, owned by them)');
  const updC = await memberA.client.from('companies').update({ notes: 'edited by member' }).eq('id', cid);
  ok(!updC.error, 'the owner can update their own (personal) company');
  const delC = await memberA.client.from('companies').delete().eq('id', cid);
  ok(!delC.error, 'the owner can delete their own (personal) company');
}

// --- services (V2 HT-B): flat member CRUD, same as products --------------
{
  const sid = 'rls-svc-' + Date.now();
  const insS = await memberA.client.from('services').insert({ id: sid, name: 'RLS test service', category_id: 'other' });
  ok(!insS.error, 'member can insert a service');
  const updS = await memberA.client.from('services').update({ status: 'Pilot' }).eq('id', sid);
  ok(!updS.error, 'member can update any service (flat model)');

  const cid2 = 'rls-co2-' + Date.now();
  await memberA.client.from('companies').insert({ id: cid2, name: 'RLS test co 2', priority: 'low', stage: 'research' });
  const insCs = await memberA.client.from('company_services').insert({ id: crypto.randomUUID(), company_id: cid2, service_id: sid });
  ok(!insCs.error, 'member can tag a service to a company (company_services)');

  await memberA.client.from('company_services').delete().eq('company_id', cid2).eq('service_id', sid);
  await memberA.client.from('companies').delete().eq('id', cid2);
  const delS = await memberA.client.from('services').delete().eq('id', sid);
  ok(!delS.error, 'member can delete a service');
}

// --- store_item_shares (V2 HT-C): per-row visibility, not flat ----------
{
  const sid2 = 'rls-svc2-' + Date.now();
  await memberA.client.from('services').insert({ id: sid2, name: 'RLS share test service', category_id: 'other' });

  const shareId = crypto.randomUUID();
  const insShare = await memberA.client.from('store_item_shares')
    .insert({ id: shareId, item_type: 'service', item_id: sid2, shared_by: memberA.uid, shared_with: memberB.uid });
  ok(!insShare.error, 'member can share an item they created the share for (shared_by = self)');

  const spoofShare = await memberB.client.from('store_item_shares')
    .insert({ id: crypto.randomUUID(), item_type: 'service', item_id: sid2, shared_by: memberA.uid, shared_with: memberB.uid });
  ok(!!spoofShare.error, 'member CANNOT insert a share claiming shared_by = someone else');

  const readAsSharedWith = await memberB.client.from('store_item_shares').select('id').eq('id', shareId);
  ok((readAsSharedWith.data?.length ?? 0) === 1, 'the recipient (shared_with) can read the share');
  const readAsSharedBy = await memberA.client.from('store_item_shares').select('id').eq('id', shareId);
  ok((readAsSharedBy.data?.length ?? 0) === 1, 'the sharer (shared_by) can read their own share');

  const revoke = await memberA.client.from('store_item_shares').delete().eq('id', shareId);
  ok(!revoke.error, 'the sharer can revoke (delete) their own share');
  const gone = (await svc.from('store_item_shares').select('id').eq('id', shareId).maybeSingle()).data;
  ok(gone === null, 'the share is actually gone after revoke');

  await memberA.client.from('services').delete().eq('id', sid2);
}

// --- quotes (V2 HT-D): flat member CRUD, line items cascade -------------
{
  const tplId = 'rls-tpl-' + Date.now();
  const insTpl = await memberA.client.from('quote_templates').insert({ id: tplId, name: 'RLS test template', file_path: 'quote-templates/x/y.html' });
  ok(!insTpl.error, 'member can insert a quote_template');

  const quoteId = 'rls-quote-' + Date.now();
  const insQuote = await memberA.client.from('quotes').insert({ id: quoteId, template_id: tplId });
  ok(!insQuote.error, 'member can insert a quote');

  const liId = crypto.randomUUID();
  const insLi = await memberA.client.from('quote_line_items').insert({ id: liId, quote_id: quoteId, item_type: 'product', item_id: 'drone', description: 'Test line', unit_cost: 100 });
  ok(!insLi.error, 'member can insert a quote_line_item');

  const delQuote = await memberA.client.from('quotes').delete().eq('id', quoteId);
  ok(!delQuote.error, 'member can delete a quote');
  const liGone = (await svc.from('quote_line_items').select('id').eq('id', liId).maybeSingle()).data;
  ok(liGone === null, 'deleting a quote cascades its line items');

  await memberA.client.from('quote_templates').delete().eq('id', tplId);
}

// --- storage (V2 HT-B): store-attachments is member-only, anon denied ----
{
  const path = `rls-test/${Date.now()}.txt`;
  const blob = new Blob(['rls test'], { type: 'text/plain' });

  const anonUpload = await anon.storage.from('store-attachments').upload(path, blob);
  ok(!!anonUpload.error, 'anon CANNOT upload to store-attachments');

  const memberUpload = await memberA.client.storage.from('store-attachments').upload(path, blob);
  ok(!memberUpload.error, 'member can upload to store-attachments');

  const anonRead = await anon.storage.from('store-attachments').download(path);
  ok(!!anonRead.error, 'anon CANNOT read a store-attachments object');

  const memberRead = await memberA.client.storage.from('store-attachments').download(path);
  ok(!memberRead.error, 'member can read a store-attachments object');

  await memberA.client.storage.from('store-attachments').remove([path]);
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

// --- roles (V2 Phase 0): admin-only category writes + role changes -------
{
  // Bootstrap: promote memberA to admin directly via service_role (bypasses
  // RLS; the column-lock trigger explicitly allows current_user='service_role'
  // too, same as the postgres/supabase_admin SQL-editor bootstrap path).
  await svc.from('profiles').update({ role: 'admin' }).eq('id', memberA.uid);

  for (const t of ['product_categories', 'service_categories']) {
    const { error: selErr } = await memberB.client.from(t).select('*').limit(1);
    ok(!selErr, `member can select ${t}`);
    const insMember = await memberB.client.from(t).insert({ id: crypto.randomUUID(), name: uniq('cat') });
    ok(!!insMember.error, `member CANNOT insert into ${t}`);

    const cid = crypto.randomUUID();
    const insAdmin = await memberA.client.from(t).insert({ id: cid, name: uniq('cat') });
    ok(!insAdmin.error, `admin can insert into ${t}`);
    const updAdmin = await memberA.client.from(t).update({ name: uniq('cat-renamed') }).eq('id', cid);
    ok(!updAdmin.error, `admin can update ${t}`);
    const delAdmin = await memberA.client.from(t).delete().eq('id', cid);
    ok(!delAdmin.error, `admin can delete ${t}`);
  }

  const selfPromote = await memberB.client.from('profiles').update({ role: 'admin' }).eq('id', memberB.uid);
  ok(!!selfPromote.error, 'member CANNOT change their own role (column-lock trigger)');
  const promoteOther = await memberA.client.from('profiles').update({ role: 'admin' }).eq('id', memberB.uid).select();
  ok((promoteOther.data?.length ?? 0) === 1, "admin can change another member's role");
  await svc.from('profiles').update({ role: 'member' }).eq('id', memberB.uid); // reset
}

// --- rfqs (V2 HT-E): flat read/insert/items, admin-only status/assigned_to -
// (memberA is admin from the roles block just above; memberB was reset back
// to plain member.)
{
  const rfqId = 'rls-rfq-' + Date.now();
  const insDraft = await memberB.client.from('rfqs').insert({ id: rfqId, title: 'RLS test RFQ' });
  ok(!insDraft.error, 'member can create a draft RFQ (status defaults to draft)');

  const sneakyPublish = await memberB.client.from('rfqs')
    .insert({ id: 'rls-rfq-sneaky-' + Date.now(), title: 'sneaky', status: 'published' });
  ok(!!sneakyPublish.error, 'member CANNOT insert an RFQ with a non-draft status');

  const memberEditsTitle = await memberB.client.from('rfqs').update({ title: 'RLS test RFQ (edited)' }).eq('id', rfqId);
  ok(!memberEditsTitle.error, "member can edit an RFQ's ordinary fields (title)");

  const memberPublishes = await memberB.client.from('rfqs').update({ status: 'published' }).eq('id', rfqId);
  ok(!!memberPublishes.error, "member CANNOT change an RFQ's status (admin-lock trigger)");
  const memberAssigns = await memberB.client.from('rfqs').update({ assigned_to: memberB.uid }).eq('id', rfqId);
  ok(!!memberAssigns.error, 'member CANNOT set assigned_to (admin-lock trigger)');

  const adminPublishes = await memberA.client.from('rfqs').update({ status: 'published', assigned_to: memberB.uid }).eq('id', rfqId).select();
  ok((adminPublishes.data?.length ?? 0) === 1, 'admin CAN publish and assign an RFQ');

  const itemId = crypto.randomUUID();
  const insItem = await memberB.client.from('rfq_items').insert({ id: itemId, rfq_id: rfqId, item_type: 'product', item_id: 'drone', description: 'Test item', vendor_name: 'Acme', vendor_verified: true });
  ok(!insItem.error, 'member can add an rfq_item (research a vendor)');

  const delRfq = await memberA.client.from('rfqs').delete().eq('id', rfqId);
  ok(!delRfq.error, 'admin can delete an RFQ');
  const itemGone = (await svc.from('rfq_items').select('id').eq('id', itemId).maybeSingle()).data;
  ok(itemGone === null, 'deleting an RFQ cascades its items');
}

// --- tasks/companies visibility (V2 HT-F) — the one non-flat RLS design --
{
  const memberC = await makeMember('Member C');

  // --- tasks ---
  const taskId = 'rls-task-' + Date.now();
  const insTask = await memberB.client.from('tasks').insert({ id: taskId, title: 'Personal task' });
  ok(!insTask.error, 'member can create a task');
  const taskRow = (await svc.from('tasks').select('visibility, owner_id').eq('id', taskId).single()).data;
  ok(taskRow.visibility === 'personal' && taskRow.owner_id === memberB.uid, 'new task defaults to personal, owned by its creator');

  const spoofOwner = await memberC.client.from('tasks').insert({ id: crypto.randomUUID(), title: 'spoof', owner_id: memberB.uid });
  ok(!!spoofOwner.error, 'member CANNOT insert a task claiming someone else as owner');

  const cCannotSee = await memberC.client.from('tasks').select('id').eq('id', taskId);
  ok((cCannotSee.data?.length ?? 0) === 0, "a personal task is invisible to a member who isn't its owner or assignee");
  const cBlindUpdate = await memberC.client.from('tasks').update({ title: 'hijacked' }).eq('id', taskId).select();
  ok((cBlindUpdate.data?.length ?? 0) === 0, 'that member also cannot blind-update it (UPDATE is gated the same as SELECT)');

  await memberB.client.from('tasks').update({ assigned_to: memberC.uid }).eq('id', taskId);
  const cNowSees = await memberC.client.from('tasks').select('id').eq('id', taskId);
  ok((cNowSees.data?.length ?? 0) === 1, 'once assigned to them, that member CAN see the personal task');

  const assigneeShares = await memberC.client.from('tasks').update({ visibility: 'general' }).eq('id', taskId);
  ok(!!assigneeShares.error, "the assignee (not the owner) CANNOT share the task to general");

  const ownerShares = await memberB.client.from('tasks').update({ visibility: 'general' }).eq('id', taskId).select();
  ok((ownerShares.data?.length ?? 0) === 1, 'the owner CAN share their task to general');

  const anyoneSeesGeneral = await memberA.client.from('tasks').select('id').eq('id', taskId);
  ok((anyoneSeesGeneral.data?.length ?? 0) === 1, 'once general, any member can see it');

  const unshare = await memberB.client.from('tasks').update({ visibility: 'personal' }).eq('id', taskId);
  ok(!!unshare.error, 'a general task CANNOT be made personal again (one-way)');

  await svc.from('tasks').delete().eq('id', taskId);

  // --- companies (same rules, abbreviated) ---
  const coId = 'rls-vis-co-' + Date.now();
  const insCo = await memberB.client.from('companies').insert({ id: coId, name: 'RLS visibility test co', priority: 'low', stage: 'research' });
  ok(!insCo.error, 'member can create a company');
  const coRow = (await svc.from('companies').select('visibility, owner_id').eq('id', coId).single()).data;
  ok(coRow.visibility === 'personal' && coRow.owner_id === memberB.uid, 'new company defaults to personal, owned by its creator');

  const coCannotSee = await memberC.client.from('companies').select('id').eq('id', coId);
  ok((coCannotSee.data?.length ?? 0) === 0, "a personal company is invisible to a member who isn't its owner or assignee");

  // Assign memberC first — otherwise RLS's own USING clause silently filters
  // the UPDATE to 0 rows (no error) before the trigger ever runs, and this
  // assertion would prove nothing about the trigger specifically (the task
  // test above avoids the same trap the same way).
  await memberB.client.from('companies').update({ assigned_to: memberC.uid }).eq('id', coId);
  const coShareByNonOwner = await memberC.client.from('companies').update({ visibility: 'general' }).eq('id', coId);
  ok(!!coShareByNonOwner.error, "an assignee who isn't the owner cannot share the company to general");

  const coShareByOwner = await memberB.client.from('companies').update({ visibility: 'general' }).eq('id', coId).select();
  ok((coShareByOwner.data?.length ?? 0) === 1, 'the owner can share their company to general');

  const coNowVisible = await memberA.client.from('companies').select('id').eq('id', coId);
  ok((coNowVisible.data?.length ?? 0) === 1, 'once general, any member can see the company');

  await svc.from('companies').delete().eq('id', coId);
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
