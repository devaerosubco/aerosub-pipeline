-- Addendum items 3+4: true scheduled event-alert notifications + per-item
-- dismissal. Extends the pattern ROADMAP.md's §2 "Task reminders" already
-- documented (a notifications table + an Edge Function on pg_cron + a
-- header bell polling it), scoped here to event alerts specifically (the
-- HT-H bell), not task reminders (still out of scope, unchanged).
--
-- This is the first place per-row ownership matters outside HT-F, and it's
-- still not RBAC -- just "your notifications are yours" (ROADMAP.md's own
-- words for the identical design). Rows are written only by the
-- event-alerts-poll Edge Function (service_role, bypasses RLS); a member
-- may read and dismiss (update read_at on) their own rows, nothing else --
-- no insert/delete grant to authenticated at all.

create table public.notifications (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'event_alert' check (kind in ('event_alert')),
  title       text not null check (char_length(title) <= 500),
  body        text check (body is null or char_length(body) <= 2000),
  ref_type    text,
  ref_id      text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id);

-- Idempotent re-poll: one notification per (user, event), not one per poll
-- run. The Edge Function upserts on this and never touches read_at on
-- conflict, so re-polling can't un-dismiss something the user already
-- cleared.
create unique index notifications_user_ref_key on public.notifications (user_id, ref_type, ref_id);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy "own notifications read" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
-- Dismissal only: read_at is the one column a member may change on their
-- own row. (No column-lock trigger needed -- the WITH CHECK already scopes
-- every field of every allowed row to user_id = self, and nothing here is
-- sensitive enough to need finer-grained column locking the way
-- profiles.role does.)
create policy "own notifications dismiss" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A fresh table actually inherits Supabase's own platform-level default
-- privileges (full CRUD to anon/authenticated/service_role) independent of
-- anything in this migration history -- confirmed by inspecting
-- information_schema.role_table_grants directly, which contradicts the
-- "needs the base table grant too" comment in 20260917120003 (that one
-- happened to still be true for what it granted, but the premise "a fresh
-- table has no privileges" does not hold here). RLS is therefore the only
-- real boundary for insert/delete on this table, same as anon's access
-- everywhere else in this project (RLS policies are `to authenticated`
-- only, so an anon session never matches any of them regardless of table
-- grants) -- there is no insert or delete policy above, so both commands
-- are denied to every authenticated row, full stop; select/update below is
-- for clarity/defense-in-depth, not because it changes anything RLS
-- doesn't already enforce.
grant select, update on public.notifications to authenticated;
