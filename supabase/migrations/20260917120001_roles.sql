-- V2 Phase 0: a small role system. Reverses V1's deliberate "no RBAC" call
-- (PRD D-3/S-8) for a narrow set of V2 gates (category taxonomy management
-- now; RFQ publish/assign and bulk catalog actions in later phases). See
-- PRD-v2.md §Phase 0.

alter table public.profiles
  add column role text not null default 'member' check (role in ('member', 'admin'));

-- is_admin() : mirrors is_member() exactly (20260904120003), SECURITY DEFINER
-- + owned by a BYPASSRLS role (postgres, in migrations) so the internal
-- select does not re-enter the profiles SELECT policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admins may update any profile row (additive to the existing own-row-only
-- policy from 20260904120010 — Postgres OR's multiple permissive policies
-- together, so members keep their own-row-only access unchanged).
create policy "admins update any profile" on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Extend the identity lock (20260904120003): role is only ever changeable by
-- an admin, or by postgres/service_role (SQL-editor bootstrap, migrations,
-- and service-key ops scripts) — prevents a member from self-promoting via
-- their own "update own profile" policy.
create or replace function public.lock_profile_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'profiles.id and profiles.email are not editable';
  end if;
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not coalesce((select public.is_admin()), false)
  then
    raise exception 'profiles.role can only be changed by an admin';
  end if;
  return new;
end;
$$;

-- Bootstrap: no member starts as admin. Promote the founder once, manually
-- (SQL editor locally / Supabase dashboard SQL editor in prod — mirrors the
-- manual first-member bootstrap in PRD §5.3):
--   update public.profiles set role = 'admin' where email = '<founder-email>';
