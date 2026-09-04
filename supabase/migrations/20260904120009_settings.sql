-- Settings: connectors reference list, the activity log, and the singleton app_settings row.
-- PRD 6.16 / 6.17 / 6.18.

create table public.connectors (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  type        text,
  url         text,
  notes       text check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger connectors_set_updated_at
  before update on public.connectors
  for each row execute function public.set_updated_at();

-- activity_log is append-only: insert + select + delete ("Clear log"), never update.
-- No updated_at.
create table public.activity_log (
  id          text primary key default gen_random_uuid()::text,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,                          -- denormalised snapshot at write time
  action      text not null check (char_length(action) <= 200),
  detail      text check (detail is null or char_length(detail) <= 500),
  created_at  timestamptz not null default now()
);

create index activity_log_created_at_idx on public.activity_log (created_at desc);

-- Singleton. Holds what the prototype kept in `settings` minus accessCode (gone)
-- and connectors (own table).
create table public.app_settings (
  id                 integer primary key default 1 check (id = 1),
  last_news_refresh  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
