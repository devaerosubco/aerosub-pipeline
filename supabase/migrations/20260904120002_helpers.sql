-- Shared helpers.

-- Touch updated_at on every mutable table. Attached per-table in later migrations.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- is_member() is defined in 20260904120003 (it selects from public.profiles,
-- which does not exist yet at this point).
