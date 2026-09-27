-- Attach the client's actual RFQ document (PDF/Word/Excel/image) to an RFQ.
-- Stored in the existing private `store-attachments` bucket under
-- rfq-documents/, read back via a short-lived signed URL -- same pattern as
-- product datasheets (20260917130003). document_name keeps the original
-- filename for display/download, since the storage path is a random UUID.
-- rfqs RLS is flat member access, and lock_rfq_admin_fields only guards
-- status/assigned_to, so no policy or trigger change is needed.

alter table public.rfqs
  add column document_path text,
  add column document_name text check (document_name is null or char_length(document_name) <= 300);
