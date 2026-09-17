// Structural checks against the local DB (schema + seed).  node scripts/db-check.mjs
import { execFileSync } from 'node:child_process';

const CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_Aerosub_Pipeline';
const psql = (sql) =>
  execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8' }).trim();

let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); c ? pass++ : fail++; };

// 1. RLS enabled + forced on every public table
const rls = psql(`select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1;`).split('\n');
ok(rls.length === 20, `20 public tables (got ${rls.length})`);
for (const row of rls) {
  const [t, en, fo] = row.split('\t');
  ok(en === 't' && fo === 't', `${t}: RLS enabled+forced`);
}

// 2. policy count
const pol = Number(psql(`select count(*) from pg_policies where schemaname='public';`));
ok(pol === 75, `75 policies (got ${pol})`);

// 3. seed row counts
const want = {
  companies: 10, contacts: 59, company_flags: 3, company_products: 21, products: 6,
  competitors: 10, competitor_campaigns: 11, tasks: 12, news_items: 6, events: 6,
  event_attendees: 10, connectors: 3, app_settings: 1,
  product_categories: 7, service_categories: 6,
  profiles: 0, invites: 0, activity_log: 0, company_stage_changes: 0, research_clips: 0,
};
for (const [t, n] of Object.entries(want)) {
  const got = Number(psql(`select count(*) from public.${t};`));
  ok(got === n, `${t} rows = ${n} (got ${got})`);
}

// 4. the two append-only tables really have no updated_at
for (const t of ['activity_log', 'company_stage_changes']) {
  const cols = psql(`select column_name from information_schema.columns
    where table_schema='public' and table_name='${t}';`).split('\n');
  ok(!cols.includes('updated_at'), `${t} has no updated_at (append-only)`);
}

// 5. auth triggers exist
const trg = psql(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='users' and not t.tgisinternal;`).split('\n');
ok(trg.includes('on_auth_user_created'), 'auth.users has on_auth_user_created trigger');

console.log(`\ndb-check: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
