-- V2 HT-H: RSS feed connector, part 2 -- the scheduled poll (PRD-v2 §8/§9).
-- Browser-side RSS fetch doesn't work here (CORS -- the same reason the V1
-- README gives for the news feed being curated-only), so this is the one
-- place true backend compute is unavoidable: a Supabase Edge Function
-- (supabase/functions/rss-poll) on a pg_cron schedule. Deliberate, narrowly
-- scoped exception to "no backend server," not an accidental one.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- MANUAL, PER-ENVIRONMENT BOOTSTRAP (mirrors the admin-role bootstrap note in
-- 20260917120001_roles.sql -- a migration should never hardcode a real
-- project URL or service-role key, local or prod). Until both secrets exist
-- in Vault, net.http_post's url argument evaluates to null and every run
-- shows as a failure in `select * from cron.job_run_details order by
-- start_time desc` -- harmless (no other job is affected), just inert:
--   select vault.create_secret('<project URL, e.g. http://127.0.0.1:54321>', 'app_project_url');
--   select vault.create_secret('<service_role key>',                        'app_service_role_key');
select cron.schedule(
  'rss-poll-every-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_project_url' limit 1) || '/functions/v1/rss-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app_service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
