-- Extensions.
-- pgcrypto provides gen_random_bytes() (used for invite tokens). On Supabase it
-- lives in the `extensions` schema and ships enabled; this is a safety net for a
-- from-scratch local database. gen_random_uuid() is core (pg_catalog) since PG13.
create extension if not exists pgcrypto with schema extensions;
