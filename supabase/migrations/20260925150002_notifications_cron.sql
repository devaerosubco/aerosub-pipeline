-- Addendum item 3: schedule event-alerts-poll on pg_cron, same mechanism as
-- rss-poll (20260925120003_rss_cron.sql) -- reuses the same two Vault
-- secrets (app_project_url, app_service_role_key), no new DB-level secret
-- needed. (RESEND_API_KEY, used only for the optional email digest, is a
-- separate Edge Function secret set via `supabase secrets set` -- it never
-- needs to exist in Postgres/Vault at all.)

select cron.schedule(
  'event-alerts-poll-every-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_project_url' limit 1) || '/functions/v1/event-alerts-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'app_service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
