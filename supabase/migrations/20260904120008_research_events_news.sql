-- Research clips, Events + attendees, and the curated news feed.  PRD 6.12 / 6.13 / 6.14 / 6.15.

create table public.research_clips (
  id              text primary key default gen_random_uuid()::text,
  title           text not null check (char_length(title) <= 500),
  url             text,
  captured_at     timestamptz not null default now(),
  summary         text check (summary is null or char_length(summary) <= 4000),
  potential       text check (potential is null or char_length(potential) <= 4000),
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  contact_linkedin text,
  company_id      text references public.companies (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index research_clips_captured_at_idx on public.research_clips (captured_at desc);

create trigger research_clips_set_updated_at
  before update on public.research_clips
  for each row execute function public.set_updated_at();

create table public.events (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  organizer   text,
  location    text,
  start_date  date,
  end_date    date,
  cost        text,
  currency    text default 'USD',
  website     text,
  benefits    text[] not null default '{}'::text[],
  notes       text check (notes is null or char_length(notes) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_attendees (
  id          text primary key default gen_random_uuid()::text,
  event_id    text not null references public.events (id) on delete cascade,
  name        text not null,
  company_id  text references public.companies (id) on delete set null,
  status      text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index event_attendees_event_id_idx on public.event_attendees (event_id);

create trigger event_attendees_set_updated_at
  before update on public.event_attendees
  for each row execute function public.set_updated_at();

create table public.news_items (
  id            text primary key default gen_random_uuid()::text,
  title         text not null check (char_length(title) <= 500),
  source        text,
  url           text,
  date          date not null,
  kind          text check (kind is null or kind in ('company','product')),
  ref_id        text,                       -- company/product id, not FK (kind-polymorphic)
  live          boolean not null default false,
  dismissed_at  timestamptz,                -- soft delete (team-wide)
  dismissed_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index news_items_dismissed_at_idx on public.news_items (dismissed_at);

create trigger news_items_set_updated_at
  before update on public.news_items
  for each row execute function public.set_updated_at();
