-- V2 HT-H: client-side event alerts (PRD-v2 §8). Per-user opt-in, stored on
-- the profile row exactly like full_name/department -- no lock-trigger
-- change needed, lock_profile_identity() only ever inspects id/email/role.

alter table public.profiles
  add column event_alerts_enabled boolean not null default true;
