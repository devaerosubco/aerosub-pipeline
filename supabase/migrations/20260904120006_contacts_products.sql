-- Contacts, the product catalog, and the company<->product tag join.  PRD 6.6 / 6.7 / 6.8.

create table public.contacts (
  id             text primary key default gen_random_uuid()::text,
  company_id     text not null references public.companies (id) on delete cascade,
  name           text not null,
  position       text,                        -- `pos` in the prototype
  email          text,
  phone          text,
  linkedin       text,                        -- stored scheme-less
  verified       boolean not null default false,
  last_contact   date,
  next_follow_up date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index contacts_company_id_idx on public.contacts (company_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.products (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  tag         text,
  kind        text not null default 'Product' check (kind in ('Product','Offer')),
  status      text not null default 'Active'  check (status in ('Active','Pilot','Planned')),
  blurb       text check (blurb is null or char_length(blurb) <= 4000),
  highlights  text[] not null default '{}'::text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- The "recommended / tagged" relation, bidirectional. `rationale` == the prototype `why`.
create table public.company_products (
  id          text primary key default gen_random_uuid()::text,
  company_id  text not null references public.companies (id) on delete cascade,
  product_id  text not null references public.products (id) on delete cascade,
  rationale   text check (rationale is null or char_length(rationale) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, product_id)
);

create index company_products_company_id_idx on public.company_products (company_id);
create index company_products_product_id_idx on public.company_products (product_id);

create trigger company_products_set_updated_at
  before update on public.company_products
  for each row execute function public.set_updated_at();
