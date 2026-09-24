-- V2 Phase 3 (HT-D): the Create tab — Quotes/Proforma/Commercials built
-- from a user-uploaded template. PRD-v2 §4. .html templates only for now
-- (see PRD-v2 §4 for why .docx is deferred, not built half-way). Flat
-- member RLS throughout, matching products/services — no role gating here
-- either; any member can upload a template or build a quote.

create table public.quote_templates (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  kind        text not null default 'Quote' check (kind in ('Quote', 'Proforma', 'Commercial')),
  file_path   text not null,                        -- storage path in store-attachments (quote-templates/<id>/…)
  field_map   jsonb not null default '{}'::jsonb,    -- {"{{token}}": "field_key"} — see src/quoteFields.js
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger quote_templates_set_updated_at
  before update on public.quote_templates
  for each row execute function public.set_updated_at();

create table public.quotes (
  id              text primary key default gen_random_uuid()::text,
  template_id     text references public.quote_templates (id) on delete set null,
  company_id      text references public.companies (id) on delete set null,
  kind            text not null default 'Quote' check (kind in ('Quote', 'Proforma', 'Commercial')),
  quote_number    text check (quote_number is null or char_length(quote_number) <= 100),
  markup_percent  numeric(6,2) not null default 30 check (markup_percent >= 0),
  currency        text not null default 'NGN' check (currency in ('NGN', 'USD')),
  notes           text check (notes is null or char_length(notes) <= 4000),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index quotes_company_id_idx on public.quotes (company_id);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- item_id deliberately has no FK — item_type says which table it *would*
-- reference (products or services), and a line item snapshots
-- description/unit_cost at add-time anyway, so a quote survives the source
-- catalog item later being edited, archived or deleted (item_id just dangles
-- harmlessly, kept for "what gets quoted" analytics, same spirit as the
-- search_count/added_to_quote_count dashboard counters from HT-C).
create table public.quote_line_items (
  id                 text primary key default gen_random_uuid()::text,
  quote_id           text not null references public.quotes (id) on delete cascade,
  item_type          text not null check (item_type in ('product', 'service')),
  item_id            text,
  description        text not null check (char_length(description) <= 500),
  qty                numeric(10,2) not null default 1 check (qty > 0),
  unit_cost          numeric(14,2) not null default 0 check (unit_cost >= 0),
  markup_multiplier  numeric(6,3) not null default 1.3 check (markup_multiplier >= 0),
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index quote_line_items_quote_id_idx on public.quote_line_items (quote_id);

create trigger quote_line_items_set_updated_at
  before update on public.quote_line_items
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.quote_templates to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_line_items to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['quote_templates', 'quotes', 'quote_line_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy "members read" on public.%I for select to authenticated using ((select public.is_member()))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check ((select public.is_member()))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using ((select public.is_member()))', t);
  end loop;
end $$;
