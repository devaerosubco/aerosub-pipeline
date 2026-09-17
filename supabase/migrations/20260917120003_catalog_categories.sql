-- V2 Phase 0: controlled-vocabulary category tables for the Store catalog
-- (Phase 1's products/services will FK into these via category_id). Read =
-- any member; write = admin only — "must be within what we offer at
-- aerosub.co" (PRD-v2.md §Phase 0). Seeded from aerosub.co's actual service
-- lines + the existing seeded `products` lines (PRD §6.7).

create table public.product_categories (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger product_categories_set_updated_at
  before update on public.product_categories
  for each row execute function public.set_updated_at();

create table public.service_categories (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function public.set_updated_at();

-- authenticated needs the base table grant too — the blanket "grant ... on
-- all tables in schema public" in 20260904120010 only covered tables that
-- existed at the time it ran. anon gets nothing (no grant given).
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.service_categories to authenticated;

alter table public.product_categories enable row level security;
alter table public.product_categories force row level security;
create policy "members read product categories" on public.product_categories
  for select to authenticated using ((select public.is_member()));
create policy "admins insert product categories" on public.product_categories
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update product categories" on public.product_categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete product categories" on public.product_categories
  for delete to authenticated using ((select public.is_admin()));

alter table public.service_categories enable row level security;
alter table public.service_categories force row level security;
create policy "members read service categories" on public.service_categories
  for select to authenticated using ((select public.is_member()));
create policy "admins insert service categories" on public.service_categories
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update service categories" on public.service_categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete service categories" on public.service_categories
  for delete to authenticated using ((select public.is_admin()));

insert into public.product_categories (id, name) values
  ('drone-uav-systems',    'Drone/UAV Systems'),
  ('rov-systems',          'ROV Systems'),
  ('crawler-systems',      'Crawler Systems'),
  ('cleaning-equipment',   'Cleaning Equipment'),
  ('inspection-platforms', 'Inspection Platforms'),
  ('surveillance-systems', 'Surveillance Systems'),
  ('other',                'Other')
on conflict (id) do nothing;

insert into public.service_categories (id, name) values
  ('drone-topside-inspection',      'Drone Topside Inspection'),
  ('crawler-ut-manual-ndt',         'Crawler UT & Manual NDT'),
  ('rov-subsea-hull-inspection',    'ROV Subsea & Hull Inspection'),
  ('engineering-grade-analysis',    'Engineering-Grade Analysis'),
  ('inspection-project-management', 'Inspection Project Management'),
  ('other',                         'Other')
on conflict (id) do nothing;
