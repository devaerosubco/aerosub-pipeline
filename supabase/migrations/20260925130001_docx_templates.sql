-- V2 addendum, item 2: .docx quote templates (deferred out of HT-D per
-- PRD-v2 §4, built now). quote_templates gains file_type so the app knows
-- which render path to use (src/quoteFields.js's HTML token-replace for
-- 'html', src/docx.js's pizzip-based XML token-replace for 'docx') without
-- re-deriving it from file_path's extension on every read.

alter table public.quote_templates
  add column file_type text not null default 'html' check (file_type in ('html', 'docx'));
