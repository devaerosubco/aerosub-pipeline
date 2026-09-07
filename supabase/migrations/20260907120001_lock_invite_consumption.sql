-- HT13 security review: the standard "members update" policy on public.invites
-- let any member set consumed_at / consumed_by directly (e.g. un-consume a
-- spent invite). PRD §7.2 says those columns are only ever written by the
-- signup trigger. Enforce it with a BEFORE UPDATE trigger, mirroring
-- lock_profile_identity(). handle_new_user() runs SECURITY DEFINER as the
-- migration owner, so `current_user` is a superuser there and the change is
-- allowed; a member's direct update runs as `authenticated` and is rejected.

create or replace function public.lock_invite_consumption()
returns trigger
language plpgsql
as $$
begin
  if (new.consumed_at is distinct from old.consumed_at
      or new.consumed_by is distinct from old.consumed_by)
     and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'invites.consumed_at / consumed_by are set only by the signup trigger';
  end if;
  return new;
end;
$$;

create trigger invites_lock_consumption
  before update on public.invites
  for each row execute function public.lock_invite_consumption();
