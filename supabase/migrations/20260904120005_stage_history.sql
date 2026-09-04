-- Pipeline stage history (append-only).  PRD 6.5.  Feeds a possible V2 forecasting view.
-- No updated_at: rows are never modified. Written only by the trigger below.

create table public.company_stage_changes (
  id          text primary key default gen_random_uuid()::text,
  company_id  text not null references public.companies (id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index company_stage_changes_company_created_idx
  on public.company_stage_changes (company_id, created_at desc);

create or replace function public.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.company_stage_changes (company_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger companies_log_stage_change
  after update on public.companies
  for each row execute function public.log_stage_change();
