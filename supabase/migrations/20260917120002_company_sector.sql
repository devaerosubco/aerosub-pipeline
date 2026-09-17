-- V2 Phase 0: company sector (item 2 — "let users specify their sector").
-- A plain field with a client-side suggested list (SECTOR_OPTIONS in
-- main.js), not a controlled taxonomy like product/service categories —
-- see PRD-v2.md §Phase 0 for why the two are treated differently.

alter table public.companies
  add column sector text check (sector is null or char_length(sector) <= 200);
