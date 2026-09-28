-- Quick fixes 1+2: Contacts filtering by Location/Sector/With Website, and
-- the contacts bulk-upload CSV needing a country-code + sector column.
-- Both are company-level attributes (contacts belong to a company, and the
-- real client-list export this was tested against has one company per
-- group of contacts) — same reasoning company.sector already used
-- (20260917120002), not a per-contact column.
-- Loosely validated (<=3 chars, not a strict ISO-3166 enum) so a stray
-- 3-letter code (NGA) or lowercase input doesn't hard-reject a whole bulk
-- upload row — the app uppercases on the way in, this is just a backstop.
alter table public.companies
  add column country text check (country is null or char_length(country) <= 3),
  add column website text check (website is null or char_length(website) <= 300);
