-- V2 Phase 4 (HT-E): RFQ Manager. PRD-v2 §5. rfqs/rfq_items are flat member
-- read/write like everything else in Store/Create — EXCEPT `status` and
-- `assigned_to`, which only an admin may set (mirrors the profiles.role
-- column-lock trigger from HT-A exactly, extended to also cover INSERT so a
-- member can't sidestep the lock by creating a row with a non-draft status
-- or a pre-set assignee).

create table public.rfqs (
  id           text primary key default gen_random_uuid()::text,
  title        text not null check (char_length(title) <= 300),
  reference    text check (reference is null or char_length(reference) <= 100),  -- e.g. an external "RFQ 7972"
  company_id   text references public.companies (id) on delete set null,
  status       text not null default 'draft' check (status in ('draft', 'published', 'in_progress', 'bidding', 'won', 'lost')),
  assigned_to  uuid references public.profiles (id) on delete set null,
  parent_rfq_id text references public.rfqs (id) on delete set null,   -- set when this row is a "Branch" of another
  notes        text check (notes is null or char_length(notes) <= 4000),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index rfqs_company_id_idx on public.rfqs (company_id);
create index rfqs_parent_rfq_id_idx on public.rfqs (parent_rfq_id);

create trigger rfqs_set_updated_at
  before update on public.rfqs
  for each row execute function public.set_updated_at();

create or replace function public.lock_rfq_admin_fields()
returns trigger
language plpgsql
as $$
begin
  if (
    (TG_OP = 'INSERT' and (new.status is distinct from 'draft' or new.assigned_to is not null))
    or (TG_OP = 'UPDATE' and (new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to))
  ) and current_user not in ('postgres', 'supabase_admin', 'service_role')
    and not coalesce((select public.is_admin()), false)
  then
    raise exception 'rfqs.status and rfqs.assigned_to can only be set by an admin';
  end if;
  return new;
end;
$$;

create trigger rfqs_lock_admin_fields
  before insert or update on public.rfqs
  for each row execute function public.lock_rfq_admin_fields();

-- Same shape as quote_line_items, plus the vendor-research fields (item 4:
-- "products with verified vendors are seen marked, though this will not be
-- included in the Quote export"). No FK on item_id for the same reason as
-- quote_line_items: item_type says which table it *would* reference, and
-- description/unit_cost are snapshotted at add-time.
create table public.rfq_items (
  id                 text primary key default gen_random_uuid()::text,
  rfq_id             text not null references public.rfqs (id) on delete cascade,
  item_type          text not null check (item_type in ('product', 'service')),
  item_id            text,
  description        text not null check (char_length(description) <= 500),
  vendor_name        text check (vendor_name is null or char_length(vendor_name) <= 200),
  vendor_verified    boolean not null default false,
  qty                numeric(10,2) not null default 1 check (qty > 0),
  unit_cost          numeric(14,2) not null default 0 check (unit_cost >= 0),
  markup_multiplier  numeric(6,3) not null default 1.3 check (markup_multiplier >= 0),
  position           integer not null default 0,
  notes              text check (notes is null or char_length(notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index rfq_items_rfq_id_idx on public.rfq_items (rfq_id);

create trigger rfq_items_set_updated_at
  before update on public.rfq_items
  for each row execute function public.set_updated_at();

-- The RFQ -> exported quote link (PRD-v2 §5: "an RFQ-quote is a quotes row
-- with source_rfq_id set — reuses Phase 3's export engine rather than
-- duplicating it").
alter table public.quotes
  add column source_rfq_id text references public.rfqs (id) on delete set null;
create index quotes_source_rfq_id_idx on public.quotes (source_rfq_id);

grant select, insert, update, delete on public.rfqs to authenticated;
grant select, insert, update, delete on public.rfq_items to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['rfqs', 'rfq_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using ((select public.is_member()))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check ((select public.is_member()))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using ((select public.is_member()))', t);
  end loop;
end $$;
