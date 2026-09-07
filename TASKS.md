# Aerosub Pipeline — Execution Plan (Heavy Tasks)

Work top to bottom. Don't start a Heavy Task until every subtask of the previous one is `- [x]` and its acceptance criteria are met. Check boxes off the moment a subtask is done. Add a one-line `↳ note:` under any subtask where something non-obvious happened.

Companion docs: [PRD.md](PRD.md), [AUDIT.md](AUDIT.md). Refs like "PRD §16 S-3" point into the PRD.

> **This plan is deliberately small.** The tool will be used infrequently, mostly by one person at a time. No realtime, no optimistic UI, no child tables for scalar lists, no DB sanitisation triggers, no self-serve offboarding (PRD §16). What's here is the irreducible core.

### Status board

| Step | State |
|---|---|
| 1 — Audit (`AUDIT.md`) | ✅ |
| 2 — PRD (`PRD.md`) | ✅ (re-scoped down after the "not over-engineered?" review — 18 tables, no realtime) |
| 3 — Heavy Tasks (`TASKS.md`) | ✅ + build-readiness pass done (2026-09-04) |
| 4 — Execute | 🟢 **HT0–HT9 done (HT0-5: 2026-09-04; HT6-9: 2026-09-07).** Next: HT10 (Reports & Exports). HT13–HT15 (deploy) need OQ-1 + OQ-3. |
| 5 — Final report | pending |

Local stack is up (`supabase start`, PG 17.6). `npm run db:reset` = clean schema + seed; `npm run db:check` = 41/41 structural; `npm run test:rls` = anon fully denied; `npm run test:invite` = 25/25 invite/signup matrix; `npm run check:secrets` = clean; `npm run smoke` = real-browser sign-in + dashboard render (now against real Supabase-sourced companies/news, not the localStorage seed); `npx vitest run` = 30/30 (store.js mapping + validate.js).

**What's needed, and when:**
- **Now** — HT0. Needs Node + npm (present).
- **HT1–HT12** — `supabase start` (Docker — the owner has it). Local Supabase = Postgres + Auth + a catch-all mailbox at `localhost:54324`. Everything built and tested here, $0, nothing external.
- **HT13–HT15 (deploy) only** — **OQ-1**: one free Supabase prod project (URL + anon key + DB password). **OQ-3**: a free Resend account + `send.aerosub.co` DNS. Free Cloudflare + GitHub accounts.

**Resolved:** OQ-2 (invite signup) · OQ-3 (Resend) · OQ-4 (seed is the only data) · OQ-5 (`company_stage_changes` in V1) · OQ-6 (Cloudflare Pages) · OQ-7 ($0/mo) · OQ-8 (Docker present → local dev).

---

## 0. Wrap the app in Vite — ZERO behaviour change

**Why first:** get the build tool in place while still on `localStorage`, so the Supabase swap that follows is a clean diff. The module split (`store.js`, `api.js`, …) happens naturally in HT4+ *as those pieces are rewired* — don't force it now. **Needs no Supabase — start now.**

**Acceptance criteria:** `npm run dev` and `npm run build` produce an app that behaves *identically* to `app/aerosub_crm.html` today — same seed, same `localStorage` key (`aerosub_pipeline_v1`), every feature, the passcode gate still works. The only change is packaging.

- [x] `npm init`; `vite`@8 + `vitest` + `jsdom` + `playwright` (dev deps). Branch `supabase-rebuild` off `main`. `.gitignore` (env, node_modules, dist, screenshots).
- [x] `index.html` at repo root is now the real entry (was a redirect stub): head with `<title>`/charset/viewport + `<link>` to `/src/style.css`, `<script type="module" src="/src/main.js">`, and the 5 body divs (`#app`, `#scrim`, `#drawer`, `#modalScrim`>`#modalBody`, `#toast`).
- [x] `src/style.css` = the prototype's `<style>` verbatim **minus one malformed no-op rule** (D-13 — `lightningcss` build minifier rejected it). `src/main.js` = the `<script>` body verbatim, one file, loaded as an ES module (no imports/exports yet). Split out of `app/aerosub_crm.html` by string slicing on the `<style>`/`<script>` tags — byte-identical content.
- [x] `app/aerosub_crm.html` frozen as reference until HT15.
- [x] Verified: `npm run build` clean (192 kB JS / 24 kB CSS); `node --check src/main.js` OK; only inline handler is `onclick="event.stopPropagation()"` **inside an exported report string**, not the app DOM → ES-module scope is safe. `npm run smoke` = jsdom boot test (dashboard + seeded companies + no errors) **and** a headless-Chromium test (nav, tiles, seeded data, zero console errors) + screenshot. Both green; screenshot matches the original.
- [x] Committed.
  - ↳ note: Vite 8 uses `lightningcss`; it rejects an empty `.flag-critical{}` dark-mode rule in the prototype CSS — removed it (D-13, provably zero styles). `npm i` is slow in this env (ran in background); `package-lock.json` committed.

---

## 1. Supabase Schema & RLS (local)

**Acceptance criteria:** All **18** tables (PRD §6) via committed timestamped migrations; `enable` + `force row level security` on all 18; functions `is_member`, `set_updated_at`, `handle_new_user`, `log_stage_change` + the `profiles` column-lock trigger exist, owned by the `BYPASSRLS` migration role (`postgres` locally); `config.toml` + migrations committed; no secrets committed. **`supabase db reset` (local) applies the schema clean on an empty DB** (the seed is HT3 — a deliberate forward reference; HT1's last subtask and this clause complete once HT3's `seed.sql` exists).

- [x] `supabase init`; `config.toml` committed with `[auth] enable_confirmations = true`, `minimum_password_length = 10`, `site_url`/`additional_redirect_urls` = `http://localhost:5173`, `[db.seed] enabled` (default). `.env` / `.env.test` (git-ignored, local demo keys) + `.env.example` committed.
- [x] `20260904120001_extensions.sql` — `pgcrypto` in `extensions`.
- [x] `20260904120002_helpers.sql` — `set_updated_at()`. (`is_member()` moved to 0003 — a `language sql` fn can't reference `public.profiles` before it exists.)
- [x] `20260904120003_profiles_invites.sql` — `profiles` (+ `set_updated_at` + the id/email lock trigger); `invites` (token default `encode(extensions.gen_random_bytes(16),'hex')`, `≤ +30d` CHECK, token/consumed_at indexes); `is_member()` (`language sql`, definer, `search_path=''`, revoke anon/public); `handle_new_user()` (one AFTER INSERT trigger — consume invite via conditional `UPDATE … row_count`, `RAISE` on 0, then `INSERT profiles`).
- [x] `20260904120004_companies.sql` — `companies` (+ `text[]` lists, CHECKs, length caps) + `company_flags` (+ index).
- [x] `20260904120005_stage_history.sql` — `company_stage_changes` (append-only) + `log_stage_change()` AFTER UPDATE trigger.
- [x] `20260904120006_contacts_products.sql` — `contacts`, `products`, `company_products` (`unique (company_id, product_id)`).
- [x] `20260904120007_competition_plan.sql` — `competitors`, `competitor_campaigns`, `tasks` (`company_id` FK **on delete cascade**).
- [x] `20260904120008_research_events_news.sql` — `research_clips`, `events`, `event_attendees`, `news_items` (`kind` nullable CHECK).
- [x] `20260904120009_settings.sql` — `connectors`, `activity_log` (append-only), `app_settings` (singleton + seeds its row).
- [x] `20260904120010_rls.sql` — DO-loop applies enable+force+4 policies to the 15 flat tables; `invites` insert tightened to `created_by = auth.uid()`; explicit `profiles` / `activity_log` / `company_stage_changes` policies; `grant … to authenticated` + `revoke all … from anon`. **66 policies.**
- [x] `supabase db reset` → schema + seed apply clean. `scripts/db-check.mjs` = 41/41 (18 tables RLS enabled+forced, 66 policies, seed counts, append-only cols, auth trigger). `scripts/rls-test.mjs` = anon denied on all 18 (select + insert), service_role bypasses.
- [x] `scripts/check-no-secrets.sh` — decodes JWT payloads, flags only `role:service_role`; PEM blocks; `SERVICE_ROLE_KEY=` assignments in code. Clean on the tree; catches a planted key. Wired via `core.hooksPath=.githooks` (`.githooks/pre-commit`).
  - ↳ note: local PG is **17.6** (not 15). `is_member()` had to move from 0002→0003. `handle_new_user` uses `get diagnostics … row_count` for the atomic single-use check. `force row level security` is inert here (postgres has BYPASSRLS) but kept per PRD §7.4.

---

## 2. Auth & Invite Flow (local)

**Acceptance criteria:** With a valid invite link, name+email+password signup → confirm (via `localhost:54324`) → `profiles` row with `full_name`, invite consumed → sign in. No / expired / consumed / mismatched / revoked token → rejected at the DB; `>30d` expiry → CHECK rejects. Concurrent redemption → one winner. Profile-less session → "get a new link" screen, no data access. Password reset + "set new password" works. Any member can create/list/revoke invites in Settings. Shell driven by `onAuthStateChange` + profile check; sign-out clears `DATA`.

- [x] Bootstrap: `insert into public.invites (email) values ('you@example.com') returning token;` → `http://localhost:5173/?invite=<token>` → sign up → grab the confirm link from `localhost:54324`.
- [x] `src/auth.js`: `createClient` (PKCE, `persistSession`, `autoRefreshToken`, `detectSessionInUrl:true`). Exports `getSession`, `onAuthChange`, `signIn`, `signUpWithInvite({fullName,email,password,token})` (passes `options.data = {full_name, invite_token}` + `emailRedirectTo = location.origin`), `signOut`, `resetPassword`, `updatePassword`, `myProfile()`.
- [x] `signUpWithInvite` error handling: GoTrue returns a generic *"Database error saving new user"* on any `handle_new_user` `RAISE` — **don't try to parse the reason**. Show one catch-all: "Sign-up failed — your invite link may be invalid, expired, or already used. Ask a teammate for a new one." (PRD §5.2).
- [x] Replace `renderGate()` → `renderAuth()`: **Sign in** / **Forgot password**; **Complete signup** (name+email+password) when `?invite=<token>` (email prefilled+locked if the invite pins one); **Set new password** state; "check your inbox" states; "invite not valid / access removed" state for a profile-less session (+ sign out).
- [x] Boot: `getSession()` → session? `myProfile()` → profile? load app : profile-less screen. No session → auth screen. `onAuthChange` handles **`PASSWORD_RECOVERY`** (→ Set-new-password screen *even though a session now exists*), `SIGNED_OUT` / `TOKEN_REFRESHED` failure / a `USER_UPDATED` that drops the profile (→ clear `DATA` + auth screen), and `SIGNED_IN`.
- [x] `src/api/invites.js` + Settings panel: `create({email?, expiresDays?≤30})` → copyable `?invite=` link (`created_by = auth.uid()`); `list()`; `revoke(id)`.
- [x] Settings "Team" list = `profiles`; edit own `full_name`/`department`.
- [x] Delete dead auth code: `accessCode`, `passcode`, `genPasscode`, `teamHasIndividualLogins`, `isUnlocked`, `maybePromptForName`, `sessionStorage`/`localStorage` keys, gate copy, "Show passcodes"/"Set code"/regen UI.
- [x] Run the PRD §14 invite/signup test matrix; record here.
  - ↳ note: `scripts/invite-test.mjs` (new) drives real signups against local Supabase + Mailpit — **25/25 pass**: no/garbage/expired/mismatched/revoked token all rejected; `>30d` expiry CHECK rejects; valid signup → confirm → `profiles` row correct → invite consumed; concurrent redemption → exactly one winner; a member reading `profiles` doesn't recurse (BYPASSRLS confirmed); password reset → recovery session → new password works, old one doesn't; a profile-less session reads 0 rows everywhere. `scripts/browser-smoke.mjs` rewritten (the old jsdom `smoke-ht0.mjs` can't run ES modules, so it's retired) to bootstrap a real member and drive sign-in through a headless-Chromium dashboard render — 7/7 pass, screenshots match. Settings UI (profile save, team list, invite create/copy/revoke) hand-verified in a real browser.
  - ↳ **bug found + fixed (pre-existing, from HT1):** `handle_new_user()` set `invites.consumed_by = new.id` *before* inserting the matching `profiles` row, but `consumed_by` FK-references `profiles(id)` — every real signup 500'd with a FK violation. Fixed by inserting the profile first (migration `20260904120003`, re-verified 41/41 `db:check` + 20/20 `rls-test` + 25/25 `invite-test`). Neither prior script exercised an actual signup, which is why it wasn't caught until now.
  - ↳ **bug found + fixed (introduced this task):** `bindSettingsControls()` called `loadSettingsData()` unconditionally; its completion re-renders Settings (to show the fetched rows), which re-binds controls, which called it again — an infinite render loop (caught by a real-browser click test, not the API tests). Fixed: load once per visit (`if (!SETTINGS.loaded)`), "Refresh"/create/revoke trigger it explicitly.

---

## 3. Seed Migration (seed → SQL)

**Acceptance criteria:** `supabase/seed.sql` loads the baseline (10 companies + flags/contacts/tags, 6 products, 10 competitors + campaigns, 12 tasks, 6 news, 6 events + attendees, 3 connectors) with FK integrity; `pain_points`/`current_solutions`/`highlights`/`benefits` as `text[]` literals; task + news dates land relative to today. `supabase db reset` reproduces schema + seed from zero; running `seed.sql` twice → no dupes.

- [x] `scripts/gen-seed-source.mjs` — slices `SOLUTIONS`/`STAGES`/`PRIORITIES`/`seedData()` **verbatim** out of `src/main.js` by bracket-matching → `scripts/seed-source.generated.mjs` (with `export`s). Zero transcription risk; re-run if the prototype seed changes.
- [x] `scripts/extract-seed.mjs` — runs `seedData()` → `supabase/seed.sql`: FK order (PRD §10.2); scalar lists → `array[…]::text[]`; `recommended[]` → `company_products (product_id, rationale)`; `tasks.due` / `news.date` → `current_date + <offset>` (offset derived by diffing the value seedData() produced today); `on conflict (id) do nothing`; **asserts** every `recommended[].sol` is a seeded product, every `attendee.companyId`/`task.companyId` is empty or a seeded company, every `company.stage` is a valid stage id.
- [x] `npm run db:reset` → applies. `db-check.mjs` confirms counts: companies 10, contacts 59, flags 3, tags 21, products 6, competitors 10, campaigns 11, tasks 12, news 6, events 6, attendees 10, connectors 3. Spot check: `seplat` = 9 contacts / 0 flags / 4 pain / 4 current / 3 tags / 2 verified; `nestoil` = 1 critical flag. Dates rebased (tasks −1..+60d, news −10..−2d relative to today).
- [x] `seed.sql` applied again by hand → counts unchanged (idempotent).
- [ ] *(low priority — OQ-4)* `src/migrate-local.js` + Settings "Migrate my local data" (upsert-merge, PRD §10.6). One sample-export test. Can be dropped if the founder confirms nothing beyond seed. **→ deferred to alongside HT11.**
  - ↳ note: `gen-seed-source` bug fixed (was stopping at the first `)` of `seedData()`). `array[…]::text[]` chosen over `'{…}'` literals — per-element `''` escaping is trivial and the seed has many apostrophes/em-dashes.

---

## 4. Data Layer + Companies + Dashboard & News

**Acceptance criteria:** `store.js` loads all tables into the prototype's `DATA` shape (bounded `activity_log`/`research_clips`) and re-pulls a view's slice on navigate. `api.js` writes: `await` call → on error toast → on success patch `DATA` + re-render (no optimism). Companies: kanban drag (8 stages) + table toggle + filters + search; company drawer stage/priority, **name/type/summary edit (E-1)**, delete (cascade verified), pain points, current solutions, product tags, notes — persist and survive reload. Dashboard widgets correct. News ticker + "Manage news" modal (add / dismiss / last-refreshed badge) work against `news_items`. A stage move writes `company_stage_changes`.

- [x] `src/store.js` — replace the localStorage `Store` with: `loadAll()` (parallel `select`; `activity_log` last 100, `research_clips` last 200, no `company_stage_changes`) → `DATA` in prototype shape per **PRD §6.20** (`toRow`/`fromRow` per entity — `products`→`DATA.solutions`, `contacts.position`→`pos`, `company_products`→`company.recommended` as `{sol,why}`, snake↔camel); `refetchView(name)`; a header **"Refresh"** that calls `loadAll()`.
- [x] Unit-test `toRow`/`fromRow` (Vitest): every entity round-trips; `recommended`↔`company_products`; `text[]`↔JS array; `kind:null`↔"General".
- [x] `src/api.js` — `write(table, op, payload)`: call supabase → error → `toast(reason)` (offline / validation / RLS) & rethrow → success → return row. Callers patch `DATA` + re-render.
- [x] `src/api/companies.js` — `create` (client `id` via `crypto.randomUUID()`), `updateIdentity` (name/type/summary — E-1), `setStage`, `setPriority`, `setNotes`, `remove`; `setPainPoints`/`setCurrentSolutions` as whole-array updates; `tagProduct`/`untagProduct` on `company_products` (upsert on conflict — E-2).
  - ↳ note: `flags` has no write API — the prototype never had add/edit/remove UI for `company_flags` either (display-only, seed-time data), so there's nothing to wire; `loadAll()` still reads it.
- [x] Rewire `renderBoard`/`renderKCard`/`renderCompanyTable`/`bindCompaniesControls`/drag; `renderDrawer`/`bindDrawer` (+ inline name/type/summary edit, matching the event-drawer's "Save details" pattern). Delete → `companies` delete (`tasks` cascades in the DB too); `refetchView`/header Refresh re-pull the slice.
- [x] Dashboard: recompute stage bar / flags / high-priority / overdue+due-soon / pain themes from `DATA` — unchanged code, verified correct against the real Supabase-sourced `DATA.companies`/`DATA.news` (screenshot-checked after a live stage move + rename).
- [x] **News**: `src/api/news.js` (`create` with `kind: null` for "General", `dismiss(id)` → `dismissed_at = now()` + `dismissed_by`, `remove` for a true hard delete). Rewired `renderTicker`/`openManageNewsModal`'s add + delete-from-feed (delete = `dismiss`, matching the old "stays deleted" UX). **Deleted `LIVE_NEWS_SNAPSHOT`, `mergeLiveNewsSnapshot()`, and `dismissedNewsIds`** (PRD §15 D-12) — also corrected the Manage-news modal copy, which described a "scheduled RSS-refresh" process that never actually ran even in the prototype. "Last refreshed" badge still reads `app_settings.last_news_refresh` (null in V1 → hidden, unchanged code).
- [x] Verify a stage drag writes one `company_stage_changes` row (`from`/`to`/`changed_by`) — asserted directly against the table in a real-browser test (see note below); the write itself is the existing DB trigger from HT1, untouched here.
- [x] Regression vs. HT0 baseline: Dashboard + Companies + drawer + news ticker/modal — plus every other view (Contacts/Competition/Events/Research/Plan/Products/Reports/Settings) spot-checked to still render with zero console errors against the new Supabase-sourced `DATA` shape.
  - ↳ note: those other views are **not yet Supabase-backed** — they still read the same in-memory `DATA` (now populated from Postgres at boot) but their *writes* still go through the old local-mutation + now-inert `persist()` pattern until their own Heavy Task (HT5 Contacts, HT6 Competition, HT7 Research, HT8 Plan, HT9 Products, HT11 Activity Log) adds a real `api/*.js`. Edits made there are session-only and won't survive a reload or the header Refresh until then — expected, not a regression.
  - ↳ note: removed the sidebar's **"Import data"** button/handler (`doImport`) — D-9 already called for this (a destructive wholesale-replace can't safely touch a shared Supabase DB from one client); its replacement, an upsert-merge importer, stays deferred alongside HT11 per HT3's note. Export is untouched.
  - ↳ note: found and fixed a real bug from HT1 while writing the browser tests below: nothing had ever exercised a real signup until HT2/HT4's test scripts (see HT2's note) — no new bugs found in HT4 itself, but the same "test the actual behavior, not just the schema" lesson applied: `db-check`/`rls-test` alone would not have caught any of the assertions below.
  - ↳ **verification**: `npx vitest run` (16/16 `store.js` mapping tests) · `npm run db:check` (41/41, unchanged) · `npm run test:rls` (20/20, unchanged) · `npm run test:invite` (25/25, unchanged) · `npm run smoke` (real sign-in → dashboard, 7/7) · a dedicated real-browser interaction pass (14/14): E-1 identity edit, pain-point add, stage move (+ `company_stage_changes` row), product tag/untag (`company_products` upsert + delete), add/delete a company, add/dismiss a news item (`kind:null`, `dismissed_at`), the header Refresh button, and — the acceptance line's own words — **"persist and survive reload"**, verified by a full `page.goto()` reload after every edit. All against local Supabase, DB reset to a clean seed afterward.
  - ↳ note:

---

## 5. Contacts

**Acceptance criteria:** Global list, verified-first, search, edit, mark-contacted, `mailto:` draft, promote-from-research — persist to `contacts`. Validators run on changed fields only.

- [x] `src/api/contacts.js` — `create` (client id), `update`, `remove`, `markContacted`, `setFollowUp`.
- [x] Rewire `openAddContactModal`/`openEditContactModal`/the drawer's "Add contact"/"Mark contacted" handlers onto the real API.
  - ↳ note: `renderContacts`/`bindContactsControls`/`renderContactRow`/`findContact` needed **no changes** — they were already pure reads against `DATA`, which store.js made Supabase-shaped back in HT4. "Rewire" only meant the write paths (the two modals + the drawer buttons).
- [x] `openEmailModal` — `mailto:` unchanged; still logs via the local `logActivity()`, not `api/activity` — that module doesn't exist until HT11, and every Heavy Task so far (HT2, HT4) has kept using `logActivity()` for the same reason. No behaviour change from the user's side; HT11 swaps the implementation, not the call sites.
- [x] "Promote contact" (Research) → `contacts` insert with `company_id`, via the same `contactsApi.create()`.
- [x] `src/validate.js` (new) — `emailRule`, `normalizeLinkedin`, `validateChanged(before, after, rules)` (changed-fields-only, per PRD §8.3.1 — a masked seeded email doesn't block an unrelated phone edit). 7 Vitest tests. This is the pattern HT13 extends into the full module (caps, enums, url normalisation).
- [x] Regression: Contacts checklist — verified in a real browser (see below), plus `npm run smoke`/full views click-through from HT4 still green (contacts render fine either way since store.js already fed them real data).
  - ↳ **verification**: `npx vitest run` (26/26, +10 new: 2 contact mapping + 8 validate.js) · `npm run db:check` (41/41) · `npm run test:rls` (20/20) · `npm run test:invite` (25/25) · `npm run smoke` (7/7) · a dedicated real-browser pass (10/10, script deleted after use): add contact from the Contacts view, LinkedIn normalisation (`https://www.linkedin.com/...` → `linkedin.com/...`), an invalid email correctly **rejected client-side with the DB left unchanged**, the corrected edit then saving, mark-contacted writing `last_contact`, promoting a research clip to a real contact, deleting a contact, and the promoted contact **surviving a full page reload**. DB reset to a clean seed afterward.

---

## 6. Competition

**Acceptance criteria:** 10 competitors, modality/threat filters, add competitor, **name/hq/website edit (E-1)**, campaign CRUD (all fields incl. verdict), competitor notes — against Supabase.

- [x] `src/api/competitors.js` — competitor `create`/`editIdentity` (E-1: name/hq/website)/`setModality`/`setThreat`/`setNotes`/`remove`; campaign `createCampaign`/`removeCampaign` on `competitor_campaigns`.
  - ↳ note: granular setters instead of a bare `update` (same style as `api/companies.js`). No campaign `update` — the drawer never had an edit-campaign UI, only add + delete, so there's nothing to wire.
- [x] Rewire `renderCompetitorDrawer` (added an E-1 "Profile" identity section — name/hq/website + "Save details", same pattern as companies/events) + `bindCompetitorDrawer` (modality/threat/notes/delete + campaign add/delete) + `openAddCompetitorModal` onto the real API.
  - ↳ note: `renderCompetitors`/`bindCompetitorsControls`/`allCampaigns`/`competitorById` needed **no changes** — pure reads on the Supabase-shaped `DATA` from HT4.
- [x] Enum values (`modality`/`threat`/campaign `type`/`verdict`) are DB-CHECK-enforced and the UI only offers valid `<option>`s, so no extra client check was needed. `source_url`/`website` normalised via a new `normalizeUrlish()` in `src/validate.js` (strips scheme + `www.` + a lone trailing slash; keeps real paths intact) — `normalizeLinkedin` is now an alias of it.
  - ↳ **bug found + fixed (from HT4):** `campaignFromRow` in store.js mapped `source_url` → **`url`**, but every actual usage in main.js (and the seed) reads **`sourceUrl`** — so the Competition drawer's "Source ↗" links had been silently blank since HT4. Fixed + added `campaignToRow`/`competitorToRow` + 4 round-trip tests (one explicitly named as the regression guard). The old store.test.js assertion that "passed" was itself checking the wrong field name.
- [x] Regression: Competition checklist — verified in a real browser (14/14, script deleted after use): the source-link regression, E-1 edit + website normalisation, threat/modality/notes changes, campaign log (all fields incl. verdict) + delete, add a new competitor, and edits surviving a full page reload. Plus `npx vitest run` 30/30, `db:check` 41/41, `test:rls` 20/20, `test:invite` 25/25, `smoke` 7/7, `check:secrets` clean.

---

## 7. Research (+ extension import path)

**Acceptance criteria:** Manual add, link-to-account, promote-contact, delete against `research_clips`; "Import clips" (extension JSON) writes rows; recent-200 + "load more".

- [x] `src/api/research.js` — `create` (client id, `created_by`), `update`, `remove`, `linkCompany`, `importClips(array, createdBy)` (bulk insert, skips titleless entries).
  - ↳ **bug found + fixed (via the browser test):** `importClips` passed `{ row: rows, many: true }` as the *payload*, but `many` belongs in `write()`'s 4th arg (opts). Result was a `.single()` on a multi-row insert → 406. Fixed to `write(..., { row: rows }, { many: true })`.
- [x] Rewire `openAddResearchModal` (+ inline email/url/linkedin validation), `bindResearchControls` (delete / link-to-account / promote-contact) and `doImportResearch` onto the real API. `renderResearch`/`filteredResearch` unchanged except the new "Load older clips" button.
- [x] **"Load older clips"** — `store.js` gained `RESEARCH_PAGE = 200` + `fetchResearchPage(before)` + `loadMoreResearch(before)` (keyset by `captured_at`). `loadAll()` now uses that page; the button shows when `DATA.research.length >= 200 && !researchEnd` and pages back until a short page comes home. `researchEnd` resets on boot + Refresh.
- [x] `validate.js` — `openAddResearchModal` normalises `url`/`contactLinkedin` via `normalizeUrlish` and validates `contactEmail` via `emailRule` (changed-fields-only pattern, `''` baseline for a fresh clip). `api/research.js`'s `toRow`/`update` also normalise on write.
- [x] Regression: Research checklist — real-browser pass (12/12, script deleted after use): manual add with an **invalid contact email rejected client-side** (no row), URL normalisation, `created_by` set to the member, link-to-account, promote-contact, an **extension-format `{type,version,clips}` JSON import** (2 valid + 1 titleless skipped), delete, and imported clips **surviving a full page reload**. Plus vitest 30/30, db:check 41/41, rls-test 20/20, test:invite 25/25, smoke 7/7, check:secrets clean.
  - ↳ note: the Chrome extension itself is untouched — HT12 rewrites it to write to Supabase directly. HT7 only makes the app-side "Import clips" button persist. The extension's file/clipboard export stays as the break-glass path (PRD §11.4).

---

## 8. Plan

**Acceptance criteria:** Task groups (overdue/week/later/done), toggle, delete, add (general or per-company), per-company tasks in the company drawer — persist to `tasks`; dashboard counts correct; deleting a company deletes its tasks; general tasks (`company_id IS NULL`) survive.

- [x] `src/api/tasks.js` — `create` (client id), `update`, `toggleDone`, `remove`. `toRow` maps `companyId` → `company_id` (`''`/falsy → `null` for a general task).
- [x] Rewire `openAddTaskModal` + `bindTasksControls` (Plan-view toggle/delete) + `bindDrawer`'s task section (`[data-toggle-task]` / `[data-del-task]` / `addTaskInline`) onto the real API. `renderTasks`/`taskCard` unchanged (pure reads).
- [x] Enum `priority` — DB-CHECK-enforced + UI only offers valid options. `due` is a nullable `date`, passed through as-is.
- [x] Regression: Plan checklist — real-browser pass (11/11, script deleted after use): add a general task (`company_id NULL`) + a per-company task from the drawer (prefilled to the drawer's company), priority + due persisted, toggle-done from **both** the drawer and the Plan view, delete from the Plan view, deleting a company **cascades its tasks in the DB** while a general task is untouched, and the survivor task surviving a full page reload. Dashboard overdue/due-soon tiles recompute from `DATA.tasks` (unchanged code). Plus vitest 30/30, db:check 41/41, rls-test 20/20, test:invite 25/25, smoke 7/7, check:secrets clean.

---

## 9. Products & Offers

**Acceptance criteria:** 6 products, **name/tag edit (E-1)**, kind/status/blurb, highlights (`text[]`), tag/untag from the product side, **re-tag updates rationale (E-2)**, delete (removes all `company_products`).

- [x] `src/api/products.js` — `create`/`editIdentity` (E-1: name/tag)/`setKind`/`setStatus`/`setBlurb`/`setHighlights` (whole `text[]` array)/`remove`. `store.js` gained `productToRow` (+ 2 round-trip tests).
  - ↳ note: `tag`/`untag` are **not** in `products.js` — they're `companiesApi.tagProduct`/`untagProduct` (same `company_products` table, bidirectional per PRD §6.8), built + tested in HT4 and already called by the product drawer's tag/untag buttons. Adding duplicate wrappers would just be noise.
- [x] Rewire `renderProductDrawer` (added an E-1 "Identity" section — name/tag + "Save details") + `bindProductDrawer` (status/kind/blurb/highlights/delete) + `openAddSolutionModal` onto the real API. `renderSolutions`/`bindSolutionsControls`/`solutionById`/`taggedCompaniesFor`/`untaggedCompaniesFor` needed **no changes** (pure reads).
  - ↳ note: `openAddSolutionModal`'s "tag to a client at creation" now works for real — it `productsApi.create()`s the product first (real Supabase id), *then* `companiesApi.tagProduct()`s it. Before HT9 this path was local-only because a brand-new client-slug product had no matching `products` row for the FK.
- [x] Delete product → `productsApi.remove()` → the DB cascades `company_products` (FK); the client also patches `DATA.companies[].recommended` + `DATA.solutions` locally.
- [x] Regression: Products checklist — real-browser pass (12/12, script deleted after use): E-1 name/tag edit, kind/status/blurb, highlight add + remove (`text[]` whole-array), tag from the product side, **E-2 re-tag → rationale updated, no duplicate row**, add a new product **+ tag-at-creation**, delete a product **cascading its `company_products` rows**, and edits surviving a full page reload. Plus vitest 32/32, db:check 41/41, rls-test 20/20, test:invite 25/25, smoke 7/7, check:secrets clean.

---

## 10. Reports & all Exports

**Acceptance criteria:** Account + section picker, sandboxed live preview, branded `.html` (Word-openable, with CSP `<meta>`) + `.md` — from `DATA`. **All 5** `claude.use('downloads')` sites removed → `Blob` + `<a download>`.

- [ ] `buildReportHtml`/`buildReportMarkdown`/`buildEventReportHtml`/`buildEventReportMarkdown` read from `DATA`.
- [ ] Add the CSP `<meta>` (PRD §8.3.4) to both exported-HTML templates.
- [ ] Report preview `<iframe>`: `srcdoc` + `sandbox` (no `allow-scripts`/`allow-same-origin`).
- [ ] Remove `claude.use('downloads')` from `doExportReportHtml`, `doExportReportMd`, `doExportEventHtml`, `doExportEventMd`, **`doExport`** — `Blob` + `<a download>` only (D-6).
- [ ] Regression: Reports + Events exports; open an exported `.html` in a browser (nothing runs) + in Word (branding intact).
  - ↳ note:

---

## 11. Activity Log

**Acceptance criteria:** Every prototype-logged action inserts an `activity_log` row attributed to `auth.uid()`/`full_name`. Settings shows last 100 + "load more". "Clear log" deletes rows. RLS rejects update + cross-user `actor_id`. "Signed in" logged **only on explicit password submit**.

- [ ] `src/api/activity.js` — `log(action, detail)` → insert `{id, actor_id: auth.uid(), actor_name, action, detail}`.
- [ ] Replace all `logActivity(...)` sites (stage move, add/remove account, add contact, tag product, log campaign, add event, draft email, export, migrate-local). **Sign-in**: once in `signIn()` on success, not in `onAuthChange`.
- [ ] Settings log section: `DATA.activityLog` (last 100) + "Load more" (fetch older by `created_at`).
- [ ] "Clear log" → delete all (confirm modal).
- [ ] Test: RLS rejects `update` + cross-user `actor_id`; page refresh doesn't add a "Signed in" row.
  - ↳ note:

---

## 12. Chrome Extension Rewire

**Acceptance criteria:** Extension user **signs in** (email + password only); "Save to Research" writes a `research_clips` row directly; offline/signed-out clips queue and sync later; `.json`/Copy-JSON fallback kept; bundle has anon key only; MV3.

- [ ] `esbuild` build → `chrome-extension/dist/` with supabase-js inlined, `VITE_*` `define`d from `.env`.
- [ ] `manifest.json`: MV3; keep `activeTab`/`scripting`/`storage`/`downloads`/`clipboardWrite`; add `host_permissions` for the Supabase origin; add `content_security_policy.extension_pages`.
- [ ] `chrome.storage.local` storage adapter → `createClient({ auth: { storage, detectSessionInUrl: false }})`.
- [ ] Popup "Account" panel: email+password **sign in** / sign out / current user. No signup.
- [ ] "Save to Research": `validate` → `insert({id: crypto.randomUUID(), …, created_by})` → on failure enqueue; "Saved" tab shows *pending* only + "Sync now"; flush on open + on sign-in.
- [ ] Keep Export .json / Copy JSON.
- [ ] Tests: online save → appears in app Research on Refresh; offline → queued → syncs; bundle grep → anon key only.
  - ↳ note:

---

## 13. Security & RLS Review

**Acceptance criteria:** PRD §14 RLS + invite matrices pass. `validate.js` normalises + validates-on-change. Secret scan clean. XSS payloads inert in-app + exports. Headers/CSP correct.

- [ ] Test harness: local `service_role` key (printed by `supabase start`) in git-ignored `.env.test` / CI secret; `check-no-secrets` skips `.env.test`. Used via `supabase.auth.admin.*` to create/confirm test users. **Profile-less user** = sign up normally through an invite, then `DELETE FROM profiles WHERE id=…` as service_role (you can't create an inviteless `auth.users` row — `handle_new_user` `RAISE`s).
- [ ] `src/validate.js` + Vitest: caps; enums; `url` normalisation (bare domain → `https://…`, reject un-coercible); `linkedin`; `email`; dates; `validateChanged(before, after)` (only diffs).
- [ ] `html\`\`` helper; review that every `innerHTML` interpolation uses it or `esc()`.
- [ ] `scripts/rls-test.mjs` — anon + profile-less + member clients → full PRD §14 matrix (incl. `profiles` own-row + id/email lock, `activity_log` no-update, `company_stage_changes` select-only, `invites.consumed_at` not client-writable, `relforcerowsecurity` true on all 18). Also asserts BYPASSRLS is in effect (signup + stage move succeed; `select profiles` doesn't recurse).
- [ ] `scripts/invite-test.mjs` — 5 rejection cases + `>30d` CHECK. Concurrent-redemption: test the SQL directly (two `UPDATE invites SET consumed_at=now() WHERE token=$1 AND consumed_at IS NULL` in separate txns → 2nd gets 0 rows), not by racing GoTrue.
- [ ] XSS: inject `<script>`/`onerror=`/`javascript:` into every free-text field + array element + invite email → inert in-app + exports.
- [ ] `_headers` (Cloudflare Pages format): HSTS+preload, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP per PRD §8.6 (`connect-src 'self' https://<ref>.supabase.co`). `_redirects` SPA fallback.
- [ ] Verify: inline `<script>` blocked; app not framable; `check-no-secrets` over source + web build + extension build → clean.
  - ↳ note:

---

## 14. Testing & QA

**Acceptance criteria:** The PRD §14 preserved-feature checklist verified on the deployed app; migration / XSS / extension / auth / deploy tests pass; results in `QA-RESULTS.md`.

- [ ] Walk the PRD §14 checklist on the deployed app → `QA-RESULTS.md`.
- [ ] Migration: `seed.sql` ×2 no dupes; task + news dates relative; sample local import correct.
- [ ] XSS matrix (in-app + exports).
- [ ] Extension: online / offline / anon-key-only.
- [ ] Auth: invite accept/reject (5 cases), confirm, reset + set-new-password, profile-less screen, sign-out clears data.
- [ ] Deploy: HTTP→HTTPS, headers, CSP blocks inline script, not framable.
- [ ] Cross-browser smoke: Chrome + Firefox — board drag, drawer edits, exports.
  - ↳ note:

---

## 15. Deployment

**Acceptance criteria:** Builds from a clean checkout with the two public env vars; deploys to **Cloudflare Pages**. Prod Supabase (**free**) has migrations + `seed.sql`, bootstrap invite, Resend SMTP. `keepalive.yml` + `backup.yml` run; one `pg_restore` tested. Old Claude Artifact retired. Extension packaged. READMEs rewritten. **$0/mo.**

- [ ] Finalise the Vite layout; `app/aerosub_crm.html` → `.legacy.html` (or delete) + README pointer.
- [ ] Harden "Remove account" confirm (PRD §13): lists what's deleted; type the account name.
- [ ] `.env.example`, build scripts, README setup/run/deploy (incl. `supabase start`) + "how to add a teammate" (Settings → Invite → send link) + "how to offboard" (admin deletes the auth user) + bootstrap-invite one-liner + "it's all free tiers; move Supabase to Pro if outgrown".
- [ ] **Cloudflare Pages**: connect repo, build `npm run build` → `dist/`, `VITE_*` = prod project, `_headers`/`_redirects` committed, PR preview deploys.
- [ ] **Prod Supabase (free)**: apply migrations + `seed.sql`; Auth redirect URLs = prod + preview origins; Resend SMTP; insert the bootstrap invite.
- [ ] `.github/workflows/keepalive.yml` — every 3 days: `curl -fsS -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" https://<ref>.supabase.co/rest/v1/`.
- [ ] `.github/workflows/backup.yml` — **weekly**: `supabase db dump --linked` (with `SUPABASE_ACCESS_TOKEN` secret) **or** `pg_dump` (match server major — PG 17 now) against the **Supavisor session pooler** string (`…pooler.supabase.com:5432`, user `postgres.<ref>`) — **not** the direct `db.<ref>.supabase.co` host (IPv6-only on free; GH runners have no IPv6). `| gzip` → **Cloudflare R2** (`R2_*` secrets; GH artifact fallback), keep last ~12. **Test one restore** into a fresh local project.
- [ ] Retire the old **Claude Artifact** app (replace with a redirect notice); announce the new URL. Decide on `assets/` (logos) — the app inlines the logo as a data-URI, so `assets/` is likely unused; keep for reference or drop.
- [ ] Extension: `esbuild` prod build → zip; document "Load unpacked" from `chrome-extension/dist`; distribute.
- [ ] Rewrite `README.md` + `chrome-extension/README.md`; delete stale "local storage / no sync / curated not live / open the Artifact" language.
- [ ] E2E smoke on prod: invite → sign up → confirm (real external email) → add an account → open on a second device → export a report.
  - ↳ note:

---

## 16. V2 Roadmap Doc

**Acceptance criteria:** `ROADMAP.md` at repo root — each PRD §12 item with V1 hook + V2 delivery (tables, Edge Function, schedule, external services). No V2 code.

- [ ] Write `ROADMAP.md` from PRD §12: live feeds, reminders, email send/track, enrichment, PDF/DOCX, forecasting (on `company_stage_changes` — no new table), full-text search, realtime/presence (if co-use grows), self-serve offboarding, read-auditing caveat.
- [ ] Link it from `README.md` and PRD §12.
  - ↳ note:

---

## Final Report (Step 5) — when HT0–16 are all `[x]`

- What was built:
- Deviations (PRD §15, D-1…D-11) and why:
- Enhancements (PRD §17, E-1…E-3):
- Deliberately cut / deferred (PRD §16 — realtime, optimistic UI, child tables, DB sanitisation, self-serve offboarding):
- Accepted limitations (last-write-wins; no live updates; bounded client loads; weekly backup granularity):
- V2 roadmap: see `ROADMAP.md`.
