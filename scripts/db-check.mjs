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
ok(rls.length === 29, `29 public tables (got ${rls.length})`);
for (const row of rls) {
  const [t, en, fo] = row.split('\t');
  ok(en === 't' && fo === 't', `${t}: RLS enabled+forced`);
}

// 2. policy count
const pol = Number(psql(`select count(*) from pg_policies where schemaname='public';`));
ok(pol === 110, `110 policies (got ${pol})`);

// 3. seed row counts
const want = {
  companies: 10, contacts: 59, company_flags: 3, company_products: 21, products: 6,
  competitors: 10, competitor_campaigns: 11, tasks: 12, news_items: 6, events: 6,
  event_attendees: 10, connectors: 3, app_settings: 1,
  product_categories: 7, service_categories: 6,
  services: 0, company_services: 0, store_item_shares: 0,
  quote_templates: 0, quotes: 0, quote_line_items: 0,
  rfqs: 0, rfq_items: 0, rss_sources: 0,
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

// 6. store-attachments bucket + its 4 storage.objects policies (V2 HT-B).
// Not in the public-schema policy count above — storage.objects lives in
// the `storage` schema.
const bucket = psql(`select public from storage.buckets where id='store-attachments';`);
ok(bucket === 'f', 'store-attachments bucket exists and is private');
const storagePol = Number(psql(`select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%store attachments%';`));
ok(storagePol === 4, `4 storage.objects policies for store-attachments (got ${storagePol})`);

// 7. tasks/companies (V2 HT-F): confirm "members read" is actually
// visibility-gated now, not still the flat is_member()-only predicate the
// standard loop originally gave every table (the policy count alone
// can't tell the two apart — it's still 4 policies either way).
for (const t of ['tasks', 'companies']) {
  const qual = psql(`select qual from pg_policies where schemaname='public' and tablename='${t}' and policyname='members read';`);
  ok(qual.includes('visibility'), `${t} "members read" policy is visibility-gated`);
  const cols = psql(`select column_name from information_schema.columns
    where table_schema='public' and table_name='${t}' and column_name in ('owner_id','assigned_to','visibility')
    order by column_name;`).split('\n');
  ok(cols.length === 3, `${t} has owner_id/assigned_to/visibility columns`);
}

// 8. V2 HT-H: profiles.event_alerts_enabled exists + defaults true; news_items.url
// has a unique index (idempotent RSS upsert key); the rss-poll cron job is
// registered and active. This can't prove the Edge Function itself runs
// end-to-end in this dev environment (no deployed function to invoke), but
// everything the migration is responsible for is checkable here.
const alertsCol = psql(`select column_default from information_schema.columns
  where table_schema='public' and table_name='profiles' and column_name='event_alerts_enabled';`);
ok(alertsCol.includes('true'), 'profiles.event_alerts_enabled exists, defaults true');

const urlUnique = psql(`select indexdef from pg_indexes where schemaname='public' and tablename='news_items' and indexname='news_items_url_key';`);
ok(urlUnique.includes('UNIQUE'), 'news_items has a unique index on url (idempotent RSS upsert key)');

const rssPolicies = Number(psql(`select count(*) from pg_policies where schemaname='public' and tablename='rss_sources';`));
ok(rssPolicies === 4, `rss_sources has 4 policies (got ${rssPolicies})`);

const cronJob = psql(`select active from cron.job where jobname='rss-poll-every-6h';`);
ok(cronJob === 't', 'rss-poll-every-6h cron job is registered and active');

// 9. Addendum item 2: quote_templates.file_type exists, defaults 'html'
// (existing .html-only templates never had to set it explicitly).
const fileTypeCol = psql(`select column_default from information_schema.columns
  where table_schema='public' and table_name='quote_templates' and column_name='file_type';`);
ok(fileTypeCol.includes('html'), "quote_templates.file_type exists, defaults 'html'");

console.log(`\ndb-check: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
