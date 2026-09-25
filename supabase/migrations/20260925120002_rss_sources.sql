-- V2 HT-H: RSS feed connector, part 1 -- the admin-managed source list
-- (PRD-v2 §8). Same shape as `connectors` (20260904120009): a plain
-- reference table, but write-gated to admins like product/service
-- categories (20260917120003), since these URLs feed a scheduled job that
-- runs unattended -- not something any member should be able to repoint.

create table public.rss_sources (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  url             text not null unique,
  category        text,
  last_polled_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger rss_sources_set_updated_at
  before update on public.rss_sources
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.rss_sources to authenticated;

alter table public.rss_sources enable row level security;
alter table public.rss_sources force row level security;
create policy "members read rss sources" on public.rss_sources
  for select to authenticated using ((select public.is_member()));
create policy "admins insert rss sources" on public.rss_sources
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update rss sources" on public.rss_sources
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete rss sources" on public.rss_sources
  for delete to authenticated using ((select public.is_admin()));

-- Idempotent re-polling: the Edge Function (supabase/functions/rss-poll)
-- upserts on this url constraint, so re-fetching the same feed never creates
-- duplicate news_items rows. Safe against the existing curated seed rows --
-- every seeded url is already distinct (supabase/seed.sql), and a plain
-- unique btree index never treats two NULLs as equal, so a future curated
-- item with no url still inserts freely.
create unique index news_items_url_key on public.news_items (url);
