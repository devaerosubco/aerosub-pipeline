-- V2 Phase 1 (HT-B): the services side of the Store catalog. Mirrors
-- `products` (PRD §6.7) as closely as makes sense — no vendor/datasheet/oem
-- (services aren't OEM parts) — plus `company_services`, mirroring
-- `company_products` (PRD §6.8) exactly. Flat member RLS, same as products.

create table public.services (
  id                    text primary key default gen_random_uuid()::text,
  name                  text not null,
  category_id           text not null references public.service_categories (id),
  status                text not null default 'Active' check (status in ('Active', 'Pilot', 'Planned', 'Pending Review')),
  blurb                 text check (blurb is null or char_length(blurb) <= 4000),
  highlights            text[] not null default '{}'::text[],
  price_amount          numeric(14,2) check (price_amount is null or price_amount >= 0),
  price_currency        text not null default 'NGN' check (price_currency in ('NGN', 'USD')),
  image_paths           text[] not null default '{}'::text[],
  archived_at           timestamptz,
  search_count          integer not null default 0,
  added_to_quote_count  integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index services_category_id_idx on public.services (category_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create table public.company_services (
  id          text primary key default gen_random_uuid()::text,
  company_id  text not null references public.companies (id) on delete cascade,
  service_id  text not null references public.services (id) on delete cascade,
  rationale   text check (rationale is null or char_length(rationale) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, service_id)
);

create index company_services_company_id_idx on public.company_services (company_id);
create index company_services_service_id_idx on public.company_services (service_id);

create trigger company_services_set_updated_at
  before update on public.company_services
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.company_services to authenticated;

alter table public.services enable row level security;
alter table public.services force row level security;
create policy "members read services" on public.services for select to authenticated using ((select public.is_member()));
create policy "members insert services" on public.services for insert to authenticated with check ((select public.is_member()));
create policy "members update services" on public.services for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete services" on public.services for delete to authenticated using ((select public.is_member()));

alter table public.company_services enable row level security;
alter table public.company_services force row level security;
create policy "members read company services" on public.company_services for select to authenticated using ((select public.is_member()));
create policy "members insert company services" on public.company_services for insert to authenticated with check ((select public.is_member()));
create policy "members update company services" on public.company_services for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members delete company services" on public.company_services for delete to authenticated using ((select public.is_member()));
