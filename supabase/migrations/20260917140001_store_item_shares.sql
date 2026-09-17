-- V2 Phase 2 (HT-C): members-only Store sharing (item 5 — "shared as a
-- link", scoped to members per PRD-v2 §0; the no-login external link is
-- explicitly deferred, not built here). A share is a pointer + a "shared
-- with me" inbox, not a new access grant — every member can already read
-- every product/service (flat RLS, unchanged) — so this table only needs to
-- gate who can SEE a share record, not who can see the underlying item.

create table public.store_item_shares (
  id          text primary key default gen_random_uuid()::text,
  item_type   text not null check (item_type in ('product', 'service')),
  item_id     text not null,
  shared_by   uuid not null references public.profiles (id) on delete cascade,
  shared_with uuid not null references public.profiles (id) on delete cascade,
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (item_type, item_id, shared_with)
);

create index store_item_shares_item_idx on public.store_item_shares (item_type, item_id);
create index store_item_shares_shared_with_idx on public.store_item_shares (shared_with);

grant select, insert, update, delete on public.store_item_shares to authenticated;

alter table public.store_item_shares enable row level security;
alter table public.store_item_shares force row level security;

-- Read: only the two people party to the share (not a flat "any member"
-- table — this is the one place in the Store where visibility is per-row).
create policy "members read own shares" on public.store_item_shares
  for select to authenticated
  using ((select public.is_member()) and (shared_by = (select auth.uid()) or shared_with = (select auth.uid())));

create policy "members create shares" on public.store_item_shares
  for insert to authenticated
  with check ((select public.is_member()) and shared_by = (select auth.uid()));

-- Revoke = delete, by whoever created the share. No update policy — a share
-- is immutable; re-sharing after a delete just inserts a new row.
create policy "members delete own shares" on public.store_item_shares
  for delete to authenticated
  using ((select public.is_member()) and shared_by = (select auth.uid()));
