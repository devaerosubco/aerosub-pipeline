-- Competitors + their campaign timeline, and the Plan (tasks).  PRD 6.9 / 6.10 / 6.11.

create table public.competitors (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  hq          text,
  website     text,
  notes       text check (notes is null or char_length(notes) <= 8000),
  modality    text not null
                check (modality in ('Drone','ROV','Crawler','Multi-domain','Other')),
  threat      text not null check (threat in ('Direct','Adjacent','Watch')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger competitors_set_updated_at
  before update on public.competitors
  for each row execute function public.set_updated_at();

create table public.competitor_campaigns (
  id            text primary key default gen_random_uuid()::text,
  competitor_id text not null references public.competitors (id) on delete cascade,
  title         text not null check (char_length(title) <= 500),
  type          text check (type in ('Past','Current','Future')),
  date          date,
  source_url    text,
  relevance     text,
  summary       text check (summary is null or char_length(summary) <= 4000),
  performance   text check (performance is null or char_length(performance) <= 4000),
  gap           text check (gap is null or char_length(gap) <= 4000),
  sweet_spot    text check (sweet_spot is null or char_length(sweet_spot) <= 4000),
  verdict       text not null default 'watch'
                  check (verdict in ('compete','complement','partner','avoid','watch')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index competitor_campaigns_competitor_id_idx
  on public.competitor_campaigns (competitor_id);

create trigger competitor_campaigns_set_updated_at
  before update on public.competitor_campaigns
  for each row execute function public.set_updated_at();

-- Plan. A general (non-account) task has company_id IS NULL. Deleting a company
-- deletes its tasks (matches the prototype).
create table public.tasks (
  id          text primary key default gen_random_uuid()::text,
  title       text not null check (char_length(title) <= 500),
  company_id  text references public.companies (id) on delete cascade,
  due         date,
  priority    text not null default 'medium' check (priority in ('high','medium','low')),
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_company_id_idx on public.tasks (company_id);
create index tasks_done_due_idx on public.tasks (done, due);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
