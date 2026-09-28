-- Quick fix item 3b: a branched RFQ (parent_rfq_id set) is private to its
-- creator + admins -- everyone else only ever sees the non-branch
-- ("General") RFQs. Same reasoning as HT-F's tasks/companies visibility
-- (bespoke policy replacing the flat is_member()-only one), scoped much
-- narrower here: only branches are gated, not every RFQ.
--
-- created_by never had a default (unlike companies.owner_id/tasks.owner_id,
-- which do) -- fixed here so RLS actually has something to compare against
-- for new branches; existing rows keep created_by = null, which only
-- matters if one of them is somehow a branch (parent_rfq_id set) with no
-- creator on record -- falls back to admin-only, never silently public.

-- No subquery wrapper here -- unlike the (select auth.uid()) used inside
-- RLS policies for planner/caching reasons, a column DEFAULT expression
-- can't contain a subquery at all (companies.owner_id/tasks.owner_id use
-- the same bare form).
alter table public.rfqs
  alter column created_by set default auth.uid();

create or replace function public.rfq_visible(r public.rfqs)
returns boolean
language sql
stable
as $$
  -- is_member() first, unconditionally -- without it a profile-less
  -- authenticated session (no profiles row, i.e. not a real team member)
  -- could read every non-branch RFQ, since parent_rfq_id is null was
  -- otherwise the only thing gating the common case.
  select (select public.is_member())
    and (
      r.parent_rfq_id is null
      or (select public.is_admin())
      or r.created_by = (select auth.uid())
    );
$$;

drop policy "members read" on public.rfqs;
create policy "members read" on public.rfqs
  for select to authenticated using (public.rfq_visible(rfqs.*));

-- update/delete must match select's own visibility, not just is_member() --
-- otherwise a member could blind-write a branch RLS already hides them
-- from seeing (same "UPDATE/DELETE gated the same as SELECT" rule HT-F's
-- tasks/companies policies already established).
drop policy "members update" on public.rfqs;
create policy "members update" on public.rfqs
  for update to authenticated using (public.rfq_visible(rfqs.*)) with check (public.rfq_visible(rfqs.*));
drop policy "members delete" on public.rfqs;
create policy "members delete" on public.rfqs
  for delete to authenticated using (public.rfq_visible(rfqs.*));

-- rfq_items inherit their parent RFQ's visibility -- a branch's line items
-- (vendor research, pricing) are exactly the private content this exists
-- to protect, so they can't be left readable via a direct rfq_items query.
drop policy "members read" on public.rfq_items;
create policy "members read" on public.rfq_items
  for select to authenticated using (
    exists (select 1 from public.rfqs r where r.id = rfq_items.rfq_id and public.rfq_visible(r.*))
  );
drop policy "members insert" on public.rfq_items;
create policy "members insert" on public.rfq_items
  for insert to authenticated with check (
    (select public.is_member())
    and exists (select 1 from public.rfqs r where r.id = rfq_items.rfq_id and public.rfq_visible(r.*))
  );
drop policy "members update" on public.rfq_items;
create policy "members update" on public.rfq_items
  for update to authenticated
  using (exists (select 1 from public.rfqs r where r.id = rfq_items.rfq_id and public.rfq_visible(r.*)))
  with check (exists (select 1 from public.rfqs r where r.id = rfq_items.rfq_id and public.rfq_visible(r.*)));
drop policy "members delete" on public.rfq_items;
create policy "members delete" on public.rfq_items
  for delete to authenticated using (
    exists (select 1 from public.rfqs r where r.id = rfq_items.rfq_id and public.rfq_visible(r.*))
  );
