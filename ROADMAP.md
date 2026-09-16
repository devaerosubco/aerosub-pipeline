# Aerosub Pipeline — V2 Roadmap

Design-only. Nothing here is built in V1. Each item lists the **V1 hook** (the
schema or code already in place so the V2 work is additive, not a migration)
and the **V2 delivery** (new tables, Edge Functions, schedules, external
services). Source: PRD §12 + the deferred items in PRD §16.

V1's shape makes this cheap to extend: one Supabase project, PostgREST + RLS,
all data (including all text) already in Postgres, stable `text` primary keys,
and an append-only `company_stage_changes` history that starts accumulating on
day one. V2 features are mostly "add a table + an Edge Function on a schedule",
not "re-architect".

**Ground rules that carry into V2:**
- Still **no RBAC** unless a concrete need forces it — the only boundary stays
  "signed-in member" vs. not.
- New tables get the same treatment: `enable` + `force row level security`,
  every policy predicate `(select public.is_member())`, default-deny.
- Secrets (Resend API key, any enrichment provider key) live in Edge Function
  secrets / GitHub Actions secrets — **never** in the client bundle. The
  browser and the extension keep shipping the anon key only.
- Edge Functions are the first piece of server-side code; V1 deliberately has
  none (PostgREST + 3 Postgres auth functions cover everything today).

---

## 1. Live news / competitor feeds

**Today:** the news ticker and competitor campaigns are curated — members add
rows by hand or via the Chrome extension. `news_items` already has `live`
(boolean) and `dismissed_at` (team-wide soft-delete) columns that no V1 code
sets to anything but their defaults.

**V1 hook:** `news_items` (with `live`, `dismissed_at`, `ref_id`, `kind`);
`competitors` / `competitor_campaigns` tables.

**V2 delivery:**
- An Edge Function on `pg_cron` (e.g. every 6 h) that pulls a small allowlist of
  RSS/Atom feeds and vendor blog/press pages, dedupes on `url`, and upserts
  `news_items` with `live = true`. It skips anything whose `url` already has a
  `dismissed_at` so a dismissed item never comes back.
- Optional `feed_sources` table (`id`, `label`, `url`, `kind`, `active`) so the
  allowlist is data, editable in Settings, not code.
- `app_settings.last_news_refresh` (already exists, already rendered as the
  "last refreshed" badge — currently always null) gets stamped each run.
- Competitor-campaign auto-discovery is a later, messier phase (scraping /
  news-API classification); the feed job above is the first, safe slice.

**External services:** none required (public feeds). A news API (e.g. a free
tier) optional for broader coverage.

---

## 2. Task reminders / notifications

**Today:** `tasks` have `due` and `priority`; the Plan view groups them
overdue/this-week/later/done and the Dashboard counts overdue + due-soon. There
is no push, no email, no in-app bell.

**V1 hook:** `tasks` table; `profiles` (per-person addressing); the activity-log
pattern for "things that happened".

**V2 delivery:**
- Add `tasks.remind_at timestamptz` (nullable).
- A `notifications` table (`id`, `user_id`, `kind`, `title`, `body`, `ref_type`,
  `ref_id`, `read_at`, `created_at`) — RLS: a member reads/updates **only their
  own** rows (this is the first place per-row ownership matters, and it's still
  not RBAC — just "your notifications are yours").
- An Edge Function on `pg_cron` (every 15 min) that finds tasks past
  `remind_at` / newly overdue and inserts `notifications` rows.
- A header bell in the app polls `notifications` on load + on navigate (same
  refetch model as everything else — no realtime needed).
- Email delivery of reminders reuses the §3 send pipeline once it exists.

**External services:** Resend (shared with §3) if reminders go to email.

---

## 3. Email send / track

**Today:** the contact drawer's "Draft email" opens a `mailto:` link. Nothing
is sent or recorded by the app; the activity log notes that a draft was opened.

**V1 hook:** the "Draft email" modal and its `logActivity` call; `contacts`
with `email`; Resend is already the Auth SMTP provider in prod (§5.6), so the
account and the verified `send.aerosub.co` domain exist.

**V2 delivery:**
- `email_messages` table (`id`, `contact_id`, `company_id`, `sent_by`,
  `subject`, `body`, `status`, `provider_id`, `sent_at`, `opened_at`,
  `clicked_at`, timestamps). RLS: members read all, insert own-attributed.
- An Edge Function `send-email` (invoked from the app with the user's JWT):
  validates membership, calls the Resend API with the server-held API key,
  writes the `email_messages` row.
- A second Edge Function `resend-webhook` (public, HMAC-verified) receives
  delivery/open/click events and updates `status` / `opened_at` / `clicked_at`.
- The contact drawer gains a "Sent" history section reading `email_messages`.

**External services:** Resend API (key in Edge Function secrets). A dedicated
Resend webhook signing secret.

---

## 4. Contact / company enrichment

**Today:** `contacts` have `verified` (boolean, seed-time only) and stable ids.
No external lookup.

**V1 hook:** stable `text` PKs on `contacts` / `companies`; `contacts.verified`;
the changed-fields-only `validate.js` model (so a proposed diff can be applied
field by field).

**V2 delivery:**
- `enrichment_runs` table (`id`, `target_type`, `target_id`, `provider`,
  `status`, `raw_response jsonb`, `proposed jsonb`, `applied_at`,
  `applied_by`, `created_at`).
- An Edge Function that, given a contact/company, calls an enrichment provider,
  stores the raw response, and computes a **proposed diff** — it never writes
  to `contacts`/`companies` directly.
- A Settings / drawer "Review enrichment" UI: a member sees the proposed diff,
  accepts/rejects per field, and accepted changes go through the normal
  `api/*.js` write path (so validation + activity logging still apply).
- `contacts.verified` flips to true when a human confirms enriched data.

**External services:** an enrichment API (Clearbit-style / Apollo-style — free
tier or paid). Key in Edge Function secrets. Rate-limit + cache via
`enrichment_runs` so the same target isn't re-queried needlessly.

---

## 5. PDF / DOCX export + scheduled delivery

**Today:** reports and event briefs export as branded `.html` (Word-openable,
with a CSP `<meta>`) and plain `.md`, built client-side by pure
`buildReportHtml` / `buildEventReportHtml` functions from `DATA`.

**V1 hook:** those builders are pure and take `(entity, sections)` — they can
run unchanged inside an Edge Function against a service-role read.

**V2 delivery:**
- An Edge Function `render-report` that runs the existing HTML builder and pipes
  it through a headless renderer (Chromium / a WASM PDF lib) → PDF; a DOCX path
  via a template library if native `.docx` is needed.
- `report_snapshots` table (`id`, `company_id`, `sections`, `format`,
  `storage_path`, `generated_by`, `created_at`) + a Supabase Storage bucket
  (private, RLS-guarded) for the rendered files.
- Scheduled delivery: a `report_schedules` table (`company_id`, `sections`,
  `cadence`, `recipients`) + a `pg_cron` Edge Function that renders on cadence
  and emails via the §3 pipeline.

**External services:** none mandatory (render in-function); Resend for delivery.

---

## 6. Forecasting dashboard

**Today:** every pipeline stage move writes a `company_stage_changes` row
(`from_stage`, `to_stage`, `changed_by`, `created_at`) via an AFTER UPDATE
trigger. The data is accumulating now; nothing reads it yet.

**V1 hook:** `company_stage_changes` **ships in V1** (OQ-5) precisely so V2
forecasting has real history to work with instead of starting from zero.

**V2 delivery:**
- SQL **views** over `company_stage_changes` + `companies`: time-in-stage,
  stage-to-stage conversion rates, velocity, a weighted pipeline value if a
  `companies.deal_value` column is added.
- A new "Forecast" screen reading those views (still refetch-on-navigate).
- **No new table** — this is views + a screen.

**External services:** none.

---

## 7. Full-text search

**Today:** search is client-side substring matching over the loaded `DATA`
(company name/type/summary, contact fields, etc.). `research_clips` (200) and
`activity_log` (100) are bounded loads with "load more".

**V1 hook:** all text — companies, contacts, competitors, campaigns, research
clips, notes — is already in Postgres.

**V2 delivery:**
- `tsvector` columns (generated) + GIN indexes on the searchable tables, or a
  single materialized `search_index` (`ref_type`, `ref_id`, `title`, `body`,
  `tsv`) refreshed by trigger.
- A `search(query text)` RPC (SECURITY INVOKER, so RLS still applies) returning
  ranked hits across types.
- A global search box in the header.
- This also **removes the need for the bounded `research_clips` / `activity_log`
  loads** — you search instead of scroll.

**External services:** none (Postgres FTS).

---

## 8. Realtime / presence

**Today:** deliberately none (PRD §9, S-3). Data syncs by refetch-on-navigate +
a manual header Refresh. Last-write-wins at the row level, no merge UI.

**V1 hook:** Supabase Realtime is available on the project; the kanban already
re-renders as a unit after any write.

**V2 delivery (only if co-use actually grows):**
- One Realtime channel subscribed to `companies` — enough to make the kanban
  board live for the "two people triaging the pipeline together" case.
- Presence (who else is viewing) is a further small step on the same channel.
- Requires: echo suppression (ignore your own writes), guarding re-render
  against clobbering a focused input, and a two-client test harness — the
  reasons it's not in V1.
- `connect-src` in the deployed CSP would need `wss://*.supabase.co` added.

**External services:** none.

---

## 9. Self-serve offboarding

**Today:** removing a person = an admin deletes their `auth.users` row in the
Supabase dashboard (cascades `profiles`; `activity_log.actor_name` snapshots
survive). Rare event.

**V1 hook:** `profiles` exists and is the single membership record;
`is_member()` is the one gate.

**V2 delivery:**
- Add `profiles.active boolean not null default true`.
- `is_member()` becomes `exists (… where id = auth.uid() and active)`.
- A `set_member_active(target uuid, active boolean)` RPC (still not RBAC — any
  member can deactivate any member, matching the flat model; or restrict to
  self-deactivate only).
- A Settings "Team" toggle.
- Deactivation keeps the row (and all attributed history) instead of a
  cascading hard delete.

**External services:** none.

---

## 10. Read-auditing caveat (not planned — a known limitation)

RLS controls **who can read what** but Supabase/Postgres does not log **who read
what** on the free tier, and V1 adds no read-audit layer. Every member can read
every row (the flat model), and those reads leave no trail. `activity_log`
records **writes and explicit actions**, not views.

If read-auditing ever becomes a requirement (e.g. "who looked at this
contact"), it needs either Postgres statement logging (heavy, noisy) or an
explicit "log this view" call from the client on sensitive drawers writing to a
dedicated `access_log` table — an app-level convention, not something RLS
provides. Called out here so it's a conscious future decision, not a surprise.

---

## Sequencing suggestion

Rough order of value-for-effort, once V1 is in real use:

1. **Forecasting dashboard** — pure views over data already accumulating, no new
   infrastructure, no external service.
2. **Full-text search** — Postgres-only, removes the bounded-load limitation.
3. **Live news feeds** — first Edge Function + `pg_cron`; public feeds only.
4. **Email send / track** — reuses the Resend account; unlocks reminders.
5. **Task reminders** — builds on §4's send pipeline + a `notifications` table.
6. **Enrichment**, **PDF/DOCX**, **realtime**, **self-serve offboarding** — as
   specific demand appears.
