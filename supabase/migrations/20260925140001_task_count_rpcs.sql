-- Addendum item 5: org-wide task-count aggregates for Insights (HT-G's
-- documented scope limit). The sector/owner panels only ever reflected what
-- the *viewer* could see under HT-F's per-row visibility RLS -- correct,
-- but not the true org-wide total the tab's name implies. These two
-- SECURITY DEFINER functions return only grouped counts, never individual
-- task rows, so they don't leak anything HT-F was built to hide (who owns
-- which specific personal task) while still answering "how many, total".
-- Same SECURITY DEFINER + is_member()-gated pattern as is_member()/
-- is_admin() themselves (20260904120003 / 20260917120001).

create or replace function public.task_counts_by_sector()
returns table(sector text, task_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.sector, 'No sector') as sector, count(*) as task_count
  from public.tasks t
  left join public.companies c on c.id = t.company_id
  where (select public.is_member())
  group by coalesce(c.sector, 'No sector')
  order by task_count desc;
$$;

create or replace function public.task_counts_by_owner()
returns table(owner_id uuid, task_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.owner_id, count(*) as task_count
  from public.tasks t
  where (select public.is_member())
  group by t.owner_id
  order by task_count desc;
$$;

revoke all on function public.task_counts_by_sector() from public, anon;
revoke all on function public.task_counts_by_owner() from public, anon;
grant execute on function public.task_counts_by_sector() to authenticated;
grant execute on function public.task_counts_by_owner() to authenticated;
