-- ===========================================================================
-- Row Level Security.  PRD section 7.
-- Every table: RLS enabled + forced. `anon` gets nothing anywhere. `authenticated`
-- gets only what these policies allow, all gated on public.is_member() (which is
-- true only for a caller that has a public.profiles row).
-- ===========================================================================

-- Table privileges: `authenticated` may attempt CRUD (RLS then decides row by
-- row); `anon` may not touch public at all.
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- --- the 15 flat tables: any member, any row, full CRUD ---------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','company_flags','contacts','products','company_products',
    'competitors','competitor_campaigns','tasks','research_clips','events',
    'event_attendees','connectors','news_items','app_settings','invites'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using ((select public.is_member()))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check ((select public.is_member()))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using ((select public.is_member()))', t);
  end loop;
end $$;

-- invites: you may only create an invite attributed to yourself. consumed_at /
-- consumed_by are only ever written by the handle_new_user() SECURITY DEFINER
-- trigger, which bypasses RLS.
drop policy "members insert" on public.invites;
create policy "members insert" on public.invites for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));

-- --- profiles: read as a member; update only your own row ------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy "members read profiles" on public.profiles
  for select to authenticated using ((select public.is_member()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- no insert policy (handle_new_user trigger only); no delete policy (dashboard only)

-- --- activity_log: append-only, self-attributed ---------------------------
alter table public.activity_log enable row level security;
alter table public.activity_log force row level security;
create policy "members read log" on public.activity_log
  for select to authenticated using ((select public.is_member()));
create policy "members insert log" on public.activity_log
  for insert to authenticated
  with check ((select public.is_member())
              and (actor_id = (select auth.uid()) or actor_id is null));
create policy "members clear log" on public.activity_log
  for delete to authenticated using ((select public.is_member()));
-- no update policy -> log rows are immutable

-- --- company_stage_changes: read-only history (written by trigger only) ---
alter table public.company_stage_changes enable row level security;
alter table public.company_stage_changes force row level security;
create policy "members read stage history" on public.company_stage_changes
  for select to authenticated using ((select public.is_member()));
-- no insert/update/delete policy
