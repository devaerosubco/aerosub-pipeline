-- V2 Phase 5 (HT-F): personal vs. general Tasks & Companies. PRD-v2 §6.
-- The one genuinely net-new RLS design in this whole V2 effort — every
-- other table in the app (V1 and V2 alike) stays flat "any member, any
-- row". Confirmed with the user before building, per PRD-v2 §6's own
-- flag on this being the highest-risk phase.
--
-- Known, accepted scope limit: child tables of companies (contacts,
-- company_flags, company_products, company_stage_changes) are NOT gated by
-- their parent company's visibility — they keep the existing flat
-- "any member" policies untouched. A personal company's name/notes/stage
-- disappear from the Companies view for other members, but its contacts
-- would still turn up in a direct query. Documented, not silently missed —
-- matches this app's existing "member vs. not" security model (V1 PRD:
-- no fine-grained ownership was ever the threat model), and re-deriving
-- visibility through 4 more tables' RLS was out of this phase's scope.

-- owner_id defaults to auth.uid() (a stable function, evaluated per-row at
-- insert time in the inserting session's context) so a client never has to
-- remember to pass it — it just falls out of being authenticated. Stays
-- nullable: pre-existing seeded rows (backfilled below) have no real
-- "creator" and that's fine since they're general anyway; a service_role/
-- SQL-editor insert with no user session also gets null, same reasoning.
alter table public.tasks
  add column owner_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column visibility  text not null default 'personal' check (visibility in ('personal', 'general'));

alter table public.companies
  add column owner_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column visibility  text not null default 'personal' check (visibility in ('personal', 'general'));

-- Backward-compat: everything that existed before this migration becomes
-- general (matches today's "every member sees everything" reality) instead
-- of silently vanishing for everyone once the new RLS policies apply. Only
-- rows created *after* this migration default to personal.
update public.tasks set visibility = 'general';
update public.companies set visibility = 'general';

-- Sharing to general is one-way, and only the owner (not merely an
-- assignee, and not just anyone with update rights on a general row) can
-- do it. One shared function, reused on both tables — visibility/owner_id
-- are named identically on both, and TG_TABLE_NAME makes the error message
-- table-specific for free.
create or replace function public.lock_visibility()
returns trigger
language plpgsql
as $$
begin
  if new.visibility is distinct from old.visibility then
    if old.visibility = 'general' then
      raise exception '% cannot be made personal again once shared to general', TG_TABLE_NAME;
    end if;
    if new.owner_id is distinct from (select auth.uid())
       and current_user not in ('postgres', 'supabase_admin', 'service_role')
    then
      raise exception 'only the owner can share this % to general', TG_TABLE_NAME;
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_lock_visibility
  before update on public.tasks
  for each row execute function public.lock_visibility();
create trigger companies_lock_visibility
  before update on public.companies
  for each row execute function public.lock_visibility();

-- Replace the standard flat policies (from 20260904120010's DO-loop) with
-- visibility-aware ones. SELECT is the PRD-v2 §6 predicate exactly; UPDATE
-- and DELETE use the *same* predicate on their USING clause — not just
-- is_member() — specifically so a member can't blind-write a personal row
-- they aren't even allowed to read (Postgres RLS lets an UPDATE target any
-- row its USING clause admits, independent of whether a SELECT policy would
-- have allowed reading it first). INSERT requires the new row's owner_id to
-- be the inserting member, so nobody can fabricate a row "owned" by someone
-- else.
drop policy "members read" on public.tasks;
drop policy "members insert" on public.tasks;
drop policy "members update" on public.tasks;
drop policy "members delete" on public.tasks;

create policy "members read" on public.tasks
  for select to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())));
create policy "members insert" on public.tasks
  for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy "members update" on public.tasks
  for update to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())))
  with check ((select public.is_member()));
create policy "members delete" on public.tasks
  for delete to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())));

drop policy "members read" on public.companies;
drop policy "members insert" on public.companies;
drop policy "members update" on public.companies;
drop policy "members delete" on public.companies;

create policy "members read" on public.companies
  for select to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())));
create policy "members insert" on public.companies
  for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy "members update" on public.companies
  for update to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())))
  with check ((select public.is_member()));
create policy "members delete" on public.companies
  for delete to authenticated
  using ((select public.is_member()) and (visibility = 'general' or owner_id = (select auth.uid()) or assigned_to = (select auth.uid())));
