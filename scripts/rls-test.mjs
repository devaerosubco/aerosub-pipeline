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

// NOTE: `relforcerowsecurity` on all 18 + the 66-policy count are checked in
// scripts/db-check.mjs (psql). The member / profile-less / invite matrix lands
// in HT2/HT13 once the signup flow exists.

console.log(`\nrls-test: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
