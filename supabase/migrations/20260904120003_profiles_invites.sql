-- Identity + the invite-link signup gate.  See PRD sections 5 and 7.

-- ---------------------------------------------------------------------------
-- profiles : one row per member. Membership == having a row here. A row is
-- created ONLY by public.handle_new_user() when a valid invite is redeemed.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  department  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- id and email are not user-editable; only full_name / department are.
create or replace function public.lock_profile_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'profiles.id and profiles.email are not editable';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_identity
  before update on public.profiles
  for each row execute function public.lock_profile_identity();

-- ---------------------------------------------------------------------------
-- invites : single-use, expiring, revocable signup tokens.
-- ---------------------------------------------------------------------------
create table public.invites (
  id          text primary key default gen_random_uuid()::text,
  token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  email       text,                                   -- optional; locked to this address when set
  created_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  consumed_at timestamptz,
  consumed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint invites_expiry_max check (expires_at <= created_at + interval '30 days')
);

create index invites_token_idx on public.invites (token);
create index invites_consumed_at_idx on public.invites (consumed_at);

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- is_member() : the predicate every RLS policy calls.
-- SECURITY DEFINER + owned by a BYPASSRLS role (postgres, in migrations) so the
-- internal select does not re-enter the profiles SELECT policy -> no recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()));
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user() : the whole signup gate, in one AFTER INSERT trigger.
-- Consumes a valid invite (atomically) then creates the profile. Any failure
-- RAISEs, which rolls back the entire signup transaction (no auth.users row,
-- no confirmation email). GoTrue surfaces this as a generic error; the client
-- shows one catch-all message.
--
-- Order matters: the profile is inserted BEFORE the invite is marked
-- consumed, because invites.consumed_by references profiles(id) — updating
-- it first would violate that FK (no profiles row exists yet for new.id).
-- Safe either way: an invite-check failure still rolls back the whole
-- transaction, profile insert included.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token    text := new.raw_user_meta_data ->> 'invite_token';
  v_consumed integer;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));

  update public.invites
     set consumed_at = now(),
         consumed_by = new.id
   where token = v_token
     and consumed_at is null
     and expires_at > now()
     and (email is null or lower(email) = lower(new.email));

  get diagnostics v_consumed = row_count;
  if v_consumed = 0 then
    raise exception 'signup rejected: invite missing, invalid, expired, email-mismatched, or already used';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
