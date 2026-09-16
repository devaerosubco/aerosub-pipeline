-- Companies (target accounts) + their flags.  PRD 6.3 / 6.4.

create table public.companies (
  id                 text primary key default gen_random_uuid()::text,
  name               text not null,
  type               text,
  priority           text not null default 'medium'
                       check (priority in ('high','medium','low')),
  stage              text not null default 'research'
                       check (stage in ('research','contact','outreach','discussion',
                                        'proposal','negotiation','won','hold')),
  summary            text check (summary is null or char_length(summary) <= 4000),
  notes              text check (notes is null or char_length(notes) <= 20000),
  pain_points        text[] not null default '{}'::text[],
  current_solutions  text[] not null default '{}'::text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create table public.company_flags (
  id          text primary key default gen_random_uuid()::text,
  company_id  text not null references public.companies (id) on delete cascade,
  type        text not null check (type in ('critical','info')),
  text        text not null check (char_length(text) <= 500),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index company_flags_company_id_idx on public.company_flags (company_id);

create trigger company_flags_set_updated_at
  before update on public.company_flags
  for each row execute function public.set_updated_at();
