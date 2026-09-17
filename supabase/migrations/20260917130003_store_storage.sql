-- V2 Phase 1 (HT-B): the app's first use of Supabase Storage — product
-- datasheets (OEM products only) and product/service images. The bucket is
-- **private** (public=false): access is signed-URL-on-read, gated by the
-- same is_member() every other table uses, not a public bucket URL — the
-- no-login share link from item 5 was explicitly deferred (PRD-v2 §0), and a
-- public bucket would have quietly reintroduced exactly that.

insert into storage.buckets (id, name, public)
values ('store-attachments', 'store-attachments', false)
on conflict (id) do nothing;

create policy "members read store attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'store-attachments' and (select public.is_member()));
create policy "members upload store attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-attachments' and (select public.is_member()));
create policy "members update store attachments" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-attachments' and (select public.is_member()))
  with check (bucket_id = 'store-attachments' and (select public.is_member()));
create policy "members delete store attachments" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-attachments' and (select public.is_member()));
