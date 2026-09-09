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
| 4 — Execute | 🟢 **HT0–HT14 + HT16 done (HT0-5: 2026-09-04; HT6-13: 2026-09-07; HT14+HT16: 2026-09-09).** Only HT15 (Deployment) left — prod Supabase project is set up + verified; awaiting the deploy engineer (Cloudflare Pages) + OQ-3 Resend. |
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

- [x] `buildReport*`/`buildEventReport*` already read from `DATA` — verified (they take `co`/`ev`/`sections` args, all sourced from `DATA`).
- [x] CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` added to both `buildReportHtml` and `buildEventReportHtml` heads (covers the inline `<style>` and the data-URI logo; blocks scripts + network).
- [x] Report preview `<iframe>` → `sandbox` (bare attr = every restriction, no `allow-scripts`/`allow-same-origin`) + `referrerpolicy="no-referrer"`. Already used `srcdoc`.
- [x] `claude.use('downloads')` **removed from all 5 sites** (`doExport`, `doExportReportHtml`, `doExportReportMd`, `doExportEventHtml`, `doExportEventMd`) → a single `downloadFile(name, data, type)` helper (Blob + `<a download>`). The 4 report/event exporters are now sync one-liners (D-6).
- [x] Regression: real-browser pass (13/13, script deleted after use): iframe has `sandbox`, preview srcdoc carries the CSP meta, a **seeded `<img onerror>`/`<script>` XSS payload in a company's notes is escaped** (not live) in the preview + the exported `.html` + still inert when the exported file is opened as its own page, `.html`/`.md` for both reports and events download via Blob, sidebar JSON export is valid `DATA`-shaped JSON. Plus vitest 32/32, db:check 41/41, rls-test 20/20, test:invite 25/25, smoke 7/7, check:secrets clean.
  - ↳ note: "opens in Word with branding intact" not machine-verifiable here — the template is unchanged (letterhead/logo/styles), only the CSP `<meta>` was added, which Word ignores. HT14's manual QA covers a real Word open.
  - ↳ note: transient infra hiccup during the run — the `supabase_vector` log container was flapping and a `db reset` didn't fully complete (stale profiles/invites + a libuv crash in `db-check`). `docker restart supabase_vector_Aerosub_Pipeline` + a clean reset fixed it; all suites green after. Not a code issue.

---

## 11. Activity Log

**Acceptance criteria:** Every prototype-logged action inserts an `activity_log` row attributed to `auth.uid()`/`full_name`. Settings shows last 100 + "load more". "Clear log" deletes rows. RLS rejects update + cross-user `actor_id`. "Signed in" logged **only on explicit password submit**.

- [x] `src/api/activity.js` — `log(actorId, actorName, action, detail)` (fire-and-forget, caps enforced) + `clearAll()` (delete every row).
- [x] Kept the `logActivity(action, detail)` signature — **only its body changed** (fires `activityApi.log()` + an optimistic local prepend so the Settings log updates instantly). All ~10 call sites untouched. **Sign-in** is already logged only in the signin submit handler (HT2), never in `onAuthChange` — verified a reload adds no row.
- [x] Settings log section: shows all of `DATA.activityLog` (store.js loads the newest `ACTIVITY_PAGE = 100`) + a **"Load older entries"** button → `store.loadMoreActivity(before)` (keyset on `created_at`, `activityEnd` flag, resets on boot + Refresh). Copy updated from "this browser only" → "shared, newest first".
- [x] "Clear log" → `activityApi.clearAll()` (RLS allows member delete, D-2) behind a confirm modal ("for everyone… can't be undone").
- [x] Test: **5 new `activity_log` RLS assertions in `invite-test.mjs`** (now 30/30): a member can insert own-attributed + null-actor rows, **cannot** insert another user's `actor_id`, **cannot** update any row (append-only), can delete. Real-browser pass (11/11, script deleted after use): sign-in writes exactly one attributed "Signed in" row, a reload adds none, a stage move writes a row, Settings shows them, "Clear log" empties the table, connector add (URL-normalised) + remove persist, the 3 seeded connectors survive a reload. Plus vitest 32/32, db:check 41/41, rls-test 20/20, smoke 7/7, check:secrets clean.
  - ↳ **scope note:** HT11 also wired **Settings → Connectors** CRUD (`src/api/connectors.js` create/remove, `store.js` `connectorToRow`) — no Heavy Task explicitly owned it but PRD's preserved-feature checklist requires it and it's the last local-only write in the Settings view. Deliberate HT11 addition.
  - ↳ note: the `migrate-local.js` importer deferred from HT3 (PRD §10.6) is **skipped** — OQ-4 resolved that the seed is the only dataset, the founder confirmed nothing beyond it, and JSON *export* remains as the break-glass snapshot. If a restore path is ever needed it's a contained add (parse the export, `upsert` by id through the existing `api/*.js` modules).
  - ↳ infra note: `supabase_vector` container flapped again mid-run and broke `db reset` (`LegacyDbSetupError`). Fixed with `docker stop supabase_vector_Aerosub_Pipeline && docker update --restart=no supabase_vector_Aerosub_Pipeline`. Not a code issue; documented in memory.

---

## 12. Chrome Extension Rewire

**Acceptance criteria:** Extension user **signs in** (email + password only); "Save to Research" writes a `research_clips` row directly; offline/signed-out clips queue and sync later; `.json`/Copy-JSON fallback kept; bundle has anon key only; MV3.

- [x] Build → `chrome-extension/dist/` with supabase-js inlined + the public config baked in from `.env`. Used **Vite lib mode** (`chrome-extension/build.mjs`) instead of esbuild — esbuild isn't installed (Vite 8 ships rolldown) and Vite is already here, so no new dep. `npm run ext:build`. `dist/` is gitignored.
- [x] `dist/manifest.json` generated from a template: MV3, kept all 5 permissions, `host_permissions` = the Supabase origin from `.env` (`http://127.0.0.1:54321/*` locally — HT15 rebuilds it against prod), `content_security_policy.extension_pages: "script-src 'self'; object-src 'self'"`.
- [x] `chrome.storage.local` storage adapter → `createClient({ auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }})` (a popup's own window storage is wiped on close, so the session has to live in `chrome.storage.local`).
- [x] New **Account** tab: signed-out shows email+password + "Sign in" (Enter submits); signed-in shows "Signed in as …" + "Sign out". No signup ("get an invite from a teammate").
- [x] "Save to Research": `isValidClip` (title required) → signed in + online → `insert([clipToRow(clip, uid)])` straight into `research_clips` (client `id`, `created_by`, URL normalised). Signed out / insert fails → enqueued in `chrome.storage.local`. The **Queue** tab (renamed from "Saved") shows only unsynced clips + a **"Sync now"** button; flush runs on popup open and right after a successful sign-in.
- [x] Export .json / Copy JSON kept on the Queue tab as the break-glass path; copy re-labelled "the queue is a fallback".
- [x] `chrome-extension/clips.js` — the pure data logic (`normalizeUrl`, `clipToRow`, `isValidClip`, `flushQueue`), so it's unit-testable: **7 Vitest tests** (`chrome-extension/**/*.test.js` added to the vitest glob).
- [x] `chrome-extension/README.md` rewritten — dropped all the "nothing talks to a server / stored locally until you export" language; added the build step + sign-in flow.
- [x] Tests (`npm run test:ext`, 23/23): **`scripts/ext-save-test.mjs`** (12) — a signed-out client is denied inserting `research_clips` (so the popup must queue); a signed-in member inserts one with the anon key + session, attributed via `created_by`, URL normalised; `flushQueue` uploads a 2-clip queue and clears it; a member reading `research_clips` (what the app does) sees the extension's clips; the built bundle's only JWT is `role:anon`, the service_role key string isn't in it, manifest is MV3 with the right `host_permissions` + CSP. **`scripts/ext-popup-test.mjs`** (11) — renders the built `popup.html` with a stubbed `chrome.*`: 3 tabs, the Account sign-in form, capture-form prefill (title + scheme-less URL), title-required validation, and a save-while-signed-out landing in the Queue with the "sign in to sync" hint, zero page errors.
  - ↳ note: no full MV3 Playwright harness (headed-only, flaky on Windows) — but the two tests above cover the data path end-to-end against local Supabase + the popup wiring. A real `chrome://extensions` → Load unpacked is a one-line manual step in HT14's QA.
  - ↳ note: `scripts/demo-user.mjs` (new, unrelated to HT12) — a local-dev helper that creates a confirmed member so you can `npm run dev` and sign in without the invite dance. Refuses to run against a non-local `SUPABASE_URL`.

---

## 13. Security & RLS Review

**Acceptance criteria:** PRD §14 RLS + invite matrices pass. `validate.js` normalises + validates-on-change. Secret scan clean. XSS payloads inert in-app + exports. Headers/CSP correct.

- [x] Test harness: `.env.test` (git-ignored, local demo keys) is used by every `scripts/*-test.mjs`; `check-no-secrets` skips `*.md`/`*.txt`/`.env.test`. **Profile-less user** = bootstrap a member through the invite flow, then `DELETE FROM profiles WHERE id=…` as service_role — done in `rls-test.mjs` and `invite-test.mjs`.
- [x] `src/validate.js` + Vitest (14 tests): `emailRule`, `normalizeUrlish` (scheme + `www.` + bare trailing slash; `normalizeLinkedin` aliases it), `urlRule` (rejects whitespace / non-domain junk, permissive otherwise), `dateRule`, `validateChanged(before, after, rules)` (only diffs — a masked seeded value never blocks an unrelated edit). Wired `urlRule`/`dateRule` into the contact-edit modal alongside `emailRule`.
  - ↳ note: URL normalisation stays **scheme-less** (the whole codebase stores + renders that way, `https://` re-added at render), NOT "→ https://" as the PRD text mused — flipping it would break every render/export path, all tested that way since HT5. `urlRule` only *rejects the un-coercible*. Per AUDIT §5.8 there is deliberately no DB format CHECK.
- [x] `html\`\`` helper added (auto-`esc()`s every `${}`, `safe()` for known markup) for any NEW innerHTML string. The existing renders were **audited** (`grep` for every user field interpolated into innerHTML) — all already go through `esc()` — and that's now **proven** by `scripts/xss-test.mjs`, so no risky mass-migration of the 3000-line render layer.
- [x] `scripts/rls-test.mjs` — **expanded 20 → 39 checks**: anon (read/write denied on all 18) + a real **member** (full CRUD on the 15 flat tables; reads every profile but updates only its own row; `profiles.id`/`.email` column-lock rejects; can't insert/delete profiles; `company_stage_changes` select-only, no client insert/update, but a real stage move writes exactly one history row via the trigger = BYPASSRLS in effect; **`invites.consumed_at`/`consumed_by` writes have no effect** — see the fix below) + a **profile-less** session (`is_member()` false, reads 0 from every table, can't write).
  - ↳ **bug found + fixed:** the standard "members update" policy on `invites` let any member set `consumed_at`/`consumed_by` directly (e.g. un-consume a spent invite). Low severity in the no-RBAC model but counter to PRD §7.2. Fixed with **migration `20260907120001`** — a `lock_invite_consumption()` BEFORE UPDATE trigger (mirrors `lock_profile_identity`); `handle_new_user()` runs as the definer superuser so the signup path still works. `db-check` still 41/41.
- [x] `scripts/invite-test.mjs` — unchanged from HT2/HT11 (30/30): the 5 rejection cases + `>30d` CHECK + concurrent redemption + password reset + the 5 `activity_log` RLS asserts. (Concurrent redemption races two real `signUp`s — consistently one winner; kept as-is since it exercises the actual trigger.)
- [x] **`scripts/xss-test.mjs` (`npm run test:xss`, 6/6):** plants `<script>` / `<img onerror>` / `<svg onload>` / `javascript:` in **every free-text field of every table** (companies incl. the `text[]` arrays, flags, contacts, products+highlights, company_products, competitors, campaigns, tasks, research clips, events+attendees+benefits, news, connectors, activity_log, the member's own `full_name`, invite email), then signs in and walks **every view + every poisoned drawer** + builds an export — **zero `alert()`, zero `window.__xss`, zero page errors**; the exported report is still inert when opened as its own file (`<script>` shows as entities). Additive + self-cleaning, so the seed/demo are untouched.
- [x] `public/_headers` + `public/_redirects` (copied to `dist/` root by Vite): HSTS (2y, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment/usb denied), `Cross-Origin-Opener-Policy`, and a CSP: `default-src 'self'; script-src 'self'` (**no** `unsafe-inline` for scripts) `; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`. `_redirects` = SPA fallback.
- [x] **`scripts/headers-test.mjs` (`npm run test:headers`, 11/11):** parses `_headers`, applies it to a `vite preview` of `dist/` via route-interception, and verifies the app **boots + renders under the strict CSP**, an injected inline `<script>` **does not execute** (and fires a CSP violation), and the page **cannot be framed**.
- [x] `check-no-secrets.sh` now also scans `chrome-extension/dist/` — clean over source + web build + extension build (the extension bundle's only JWT is `role:anon`; the `sb_secret_` string in it is supabase-js's own key-*prefix* detector, not a key).
- [x] **Hardening (from the demo bug):** a signed-in session whose `profiles` row is gone (offboarded, or a local DB reset) used to read as a silently-empty app. Now: `auth.js` `amIMember()` (calls the `is_member()` RPC), `api.js` fires an `aerosub:rls-denied` event on a `42501`, and `main.js` `guardMembership()` (on that event, on tab-refocus, and before a manual Refresh) bounces such a session to the "ask a teammate for a new invite" screen. Covered by `rls-test.mjs`'s profile-less section.

---

## 14. Testing & QA

**Acceptance criteria:** The PRD §14 preserved-feature checklist verified on the deployed app; migration / XSS / extension / auth / deploy tests pass; results in `QA-RESULTS.md`.

- [x] Walk the PRD §14 checklist → `QA-RESULTS.md` at repo root (local — no prod yet; the deploy-only rows are flagged for re-run in HT15).
- [x] Migration: `seed.sql` ×2 no dupes; task + news dates relative. (`on conflict do nothing`; `db:check` 41/41 unchanged after a re-apply. Local import = OQ-4 dropped.)
- [x] XSS matrix (in-app + exports) — `npm run test:xss` 6/6 (every free-text field of every table).
- [x] Extension: online / offline / anon-key-only — `npm run test:ext` 23/23. Made `ext-save-test.mjs` self-cleaning so it's repeatable, not reset-only.
- [x] Auth: invite accept/reject (5 cases), confirm, reset + set-new-password, profile-less screen, sign-out clears data — `npm run test:invite` 30/30 + `npm run test:rls` 39/39 (profile-less section).
- [x] Deploy: headers, CSP blocks inline script, not framable — `npm run test:headers` 11/11 (local, headers injected). HTTP→HTTPS + prod headers re-run on the live URL in HT15.
- [x] Cross-browser smoke: Chrome + Firefox — board move, drawer edits, exports — new `scripts/crossbrowser-smoke.mjs` (`npm run test:crossbrowser`) 14/14 (7 per browser).
  - ↳ note: full local suite green — vitest 46 · db-check 41 · rls 39 · invite 30 · xss 6 · headers 11 · ext 23 · smoke 7 · crossbrowser 14 · check:secrets clean. HTML5 DnD in the cross-browser test is driven by a real `DataTransfer` event sequence (synthetic mouse moves don't fire native drag). Manual items left for the operator (in `QA-RESULTS.md` §4): open an exported `.html` in real Word; load-unpacked the extension in real Chrome; the HTTP→HTTPS + real-email + second-device checks on the HT15 deployment.
  - ↳ note: a pre-deployment code-review pass (`REVIEW-NOTES.md`) found + fixed a real gap — **Events editing never persisted** (no `src/api/events.js`; no HT had owned it). Added the module + wired the drawer/add/delete handlers + verified real-browser 14/14. Also A2: extended `store.refetchView` to Contacts/Competition/Plan/Products/Events/Reports (was Companies/Dashboard/News only) so navigate-to-view re-pulls teammates' changes per PRD §9. Removed the now-dead `persist()` and the unused `html\`\`` helper. `QA-RESULTS.md` Events row corrected.

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

- [x] Write `ROADMAP.md` from PRD §12: live feeds, reminders, email send/track, enrichment, PDF/DOCX, forecasting (on `company_stage_changes` — no new table), full-text search, realtime/presence (if co-use grows), self-serve offboarding, read-auditing caveat.
- [x] Link it from `README.md` and PRD §12.
  - ↳ note: `ROADMAP.md` at repo root — 10 sections, each with V1 hook + V2 delivery (new tables, Edge Functions, `pg_cron` schedules, external services) + carried ground rules (no RBAC, RLS default-deny on new tables, secrets server-side only) + a value-for-effort sequencing suggestion. §10 is the read-auditing caveat (not planned — flagged as a conscious future decision). PRD §12 links it above the table; README gets a "Roadmap" section (+ a note that the full README rewrite is HT15). No V2 code.

---

## Final Report (Step 5) — when HT0–16 are all `[x]`

- What was built:
- Deviations (PRD §15, D-1…D-11) and why:
- Enhancements (PRD §17, E-1…E-3):
- Deliberately cut / deferred (PRD §16 — realtime, optimistic UI, child tables, DB sanitisation, self-serve offboarding):
- Accepted limitations (last-write-wins; no live updates; bounded client loads; weekly backup granularity):
- V2 roadmap: see `ROADMAP.md`.
