# Aerosub Pipeline — Execution Plan (Heavy Tasks)

Work top to bottom. Don't start a Heavy Task until every subtask of the previous one is `- [x]` and its acceptance criteria are met. Check boxes off the moment a subtask is done. Add a one-line `↳ note:` under any subtask where something non-obvious happened.

Companion doc: [PRD.md](PRD.md). Refs like "PRD §16 S-3" point into the PRD.

> **This plan is deliberately small.** The tool will be used infrequently, mostly by one person at a time. No realtime, no optimistic UI, no child tables for scalar lists, no DB sanitisation triggers, no self-serve offboarding (PRD §16). What's here is the irreducible core.

### Status board

| Step | State |
|---|---|
| 1 — Audit | ✅ (findings folded into PRD.md) |
| 2 — PRD (`PRD.md`) | ✅ (re-scoped down after the "not over-engineered?" review — 18 tables, no realtime) |
| 3 — Heavy Tasks (`TASKS.md`) | ✅ + build-readiness pass done (2026-09-04) |
| 4 — Execute | 🟢 **HT0–HT16 done.** Deployed to Cloudflare Pages; all team members invited and confirmed. **Deviation D-14**: Resend SMTP skipped — prod runs on Supabase's built-in email for now; wire in Resend before the next onboarding wave (rate-limited, no verified sending domain). |
| 5 — Final report | ✅ (2026-09-23, below) |

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
  - ↳ note: a pre-deployment code-review pass found + fixed a real gap — **Events editing never persisted** (no `src/api/events.js`; no HT had owned it). Added the module + wired the drawer/add/delete handlers + verified real-browser 14/14. Also A2: extended `store.refetchView` to Contacts/Competition/Plan/Products/Events/Reports (was Companies/Dashboard/News only) so navigate-to-view re-pulls teammates' changes per PRD §9. Removed the now-dead `persist()` and the unused `html\`\`` helper. `QA-RESULTS.md` Events row corrected.
  - [ ] *(deferred, low priority)* Test-infra cleanup from that review pass, still open: **C1** — extract the "bootstrap a confirmed member" dance (copy-pasted in 7 scripts: `browser-smoke.mjs`, `crossbrowser-smoke.mjs`, `demo-user.mjs`, `ext-save-test.mjs`, `invite-test.mjs`, `rls-test.mjs`, `xss-test.mjs`) into `scripts/lib/test-helpers.mjs` (`loadTestEnv()`, `bootstrapConfirmedMember({fullName})`, `pollMailpitLink(email, since)`); **C2** — `activity.js` `clearAll()` uses `.neq('id', '')` to match all rows — works, but `.not('id', 'is', null)` reads as intent. No behaviour impact either way.

---

## 15. Deployment

**Acceptance criteria:** Builds from a clean checkout with the two public env vars; deploys to **Cloudflare Pages**. Prod Supabase (**free**) has migrations + `seed.sql`, bootstrap invite, Resend SMTP. `keepalive.yml` + `backup.yml` run; one `pg_restore` tested. Old Claude Artifact retired. Extension packaged. READMEs rewritten. **$0/mo.**

- [x] Finalise the Vite layout; `app/aerosub_crm.html` → `.legacy.html` (or delete) + README pointer.
  - ↳ note: the file wasn't at `app/aerosub_crm.html` any more by the time this landed on `main` — an abandoned Cloudflare Workers deploy attempt (`0945e20`/`28c1f9d`, predating the Pages decision) had renamed it to `app/index.html` and left it there when the Workers approach was dropped. Renamed that to `app/aerosub_crm.legacy.html` via `git mv`. README's "Project history" section points to it as reference-only, not served.
- [x] Harden "Remove account" confirm (PRD §13): lists what's deleted; type the account name.
  - ↳ note: new `openRemoveAccountModal()` in `src/main.js` (replaces the plain `openConfirmModal` call) — lists live counts (contacts/tasks/product tags/flags) about to hard-delete, notes any linked research clips will be unlinked not deleted, and disables the "Remove account" button until the typed text matches the company name exactly. Other, lower-blast-radius deletes (contact/competitor/event/product/invite) are untouched — the PRD singles out accounts specifically because deleting one cascades across the most tables.
- [x] `.env.example`, build scripts, README setup/run/deploy (incl. `supabase start`) + "how to add a teammate" (Settings → Invite → send link) + "how to offboard" (admin deletes the auth user) + bootstrap-invite one-liner + "it's all free tiers; move Supabase to Pro if outgrown".
  - ↳ note: `README.md` rewritten top to bottom — folder structure, local setup, the full `npm run` test list, a deploy walkthrough (Supabase → Cloudflare Pages → bootstrap invite → keepalive/backup), "adding a teammate"/"offboarding" sections, and D-14 called out explicitly. `.env.example` was already correct (local dev + a note that prod vars live in Cloudflare Pages) — no change needed.
- [x] **Cloudflare Pages**: connect repo, build `npm run build` → `dist/`, `VITE_*` = prod project, `_headers`/`_redirects` committed, PR preview deploys.
  - ↳ note: confirmed done by the project owner (Cloudflare dashboard config, outside this repo). Now that `supabase-rebuild` has merged into `main` (see the branch-reconciliation note under HT15's own history — this file's edits briefly landed on the stale local `main` and were moved over), worth double-checking the Pages project's production branch points at `main` rather than the now-merged `supabase-rebuild`.
- [x] **Prod Supabase (free)**: apply migrations + `seed.sql`; Auth redirect URLs = prod + preview origins; insert the bootstrap invite.
  - ↳ note: Resend SMTP **not** wired — deferred, see D-14. Running on Supabase's built-in email (rate-limited, unverified sending domain). Follow-up before next onboarding wave.
- [x] `.github/workflows/keepalive.yml` — every 3 days: `curl -fsS -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" https://<ref>.supabase.co/rest/v1/`.
- [x] `.github/workflows/backup.yml` — **weekly**: `pg_dump` (postgresql-client-17, matching the server) against the **Supavisor session pooler** (`aws-0-eu-west-2.pooler.supabase.com:5432`, user `postgres.<ref>`) — **not** the direct `db.<ref>.supabase.co` host (IPv6-only on free; GH runners have no IPv6). `gzip` → always uploaded as a GH Actions artifact (90-day retention); additionally pushed to **Cloudflare R2** and pruned to the newest ~12 if `R2_BUCKET` (repo variable) + `R2_*` secrets are set.
  - ↳ note: **both workflows are written but unrun** — they need repo secrets this session has no access to (`SUPABASE_ANON_KEY`, `SUPABASE_DB_PASSWORD`, optionally `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_ACCOUNT_ID` + the `R2_BUCKET` repo variable — see the comments at the top of each workflow file). Owner: add those secrets in repo Settings → Secrets and variables → Actions, then trigger each once via `workflow_dispatch` to confirm they go green. **The "test one restore into a fresh local project" step still needs to be done by hand** once a real backup file exists — this wasn't (and shouldn't be) done unattended against prod.
- [x] Retire the old **Claude Artifact** app (replace with a redirect notice); announce the new URL. Decide on `assets/` (logos) — the app inlines the logo as a data-URI, so `assets/` is likely unused; keep for reference or drop.
  - ↳ note: confirmed done by the project owner. `assets/` decided: **keep** (small, harmless, useful if the inlined logo data-URI ever needs regenerating) — noted in the new README's folder-structure section.
- [x] Extension: prod build → zip; document "Load unpacked" from `chrome-extension/dist`; distribute.
  - ↳ note: used **Vite lib mode** again (not esbuild — see HT12's note, still true) via the existing `chrome-extension/build.mjs`, extended to take an env-file argument. New `chrome-extension/zip.mjs` (+ `npm run ext:zip`) zips `dist/` into a shareable `chrome-extension/aerosub-clipper.zip`. Built + verified against the real prod project: `manifest.json`'s `host_permissions` correctly resolves to `https://fjjkhlgcdooxkqzbhvih.supabase.co/*`, zip is 74.5 KB. `chrome-extension/README.md` documents the whole flow ("Sharing it with the team"). Distributing the zip to teammates is a manual step (Slack/Drive) — not something to automate.
- [x] Rewrite `README.md` + `chrome-extension/README.md`; delete stale "local storage / no sync / curated not live / open the Artifact" language.
- [x] E2E smoke on prod: invite → sign up → confirm (real external email) → add an account → open on a second device → export a report.
  - ↳ note: confirmed done by the project owner — the status board's "all team members invited and confirmed" above is this, run by hand outside this session (correctly so: it's a production-affecting action needing a real second device).

---

## 16. V2 Roadmap Doc

**Acceptance criteria:** `ROADMAP.md` at repo root — each PRD §12 item with V1 hook + V2 delivery (tables, Edge Function, schedule, external services). No V2 code.

- [x] Write `ROADMAP.md` from PRD §12: live feeds, reminders, email send/track, enrichment, PDF/DOCX, forecasting (on `company_stage_changes` — no new table), full-text search, realtime/presence (if co-use grows), self-serve offboarding, read-auditing caveat.
- [x] Link it from `README.md` and PRD §12.
  - ↳ note: `ROADMAP.md` at repo root — 10 sections, each with V1 hook + V2 delivery (new tables, Edge Functions, `pg_cron` schedules, external services) + carried ground rules (no RBAC, RLS default-deny on new tables, secrets server-side only) + a value-for-effort sequencing suggestion. §10 is the read-auditing caveat (not planned — flagged as a conscious future decision). PRD §12 links it above the table; README gets a "Roadmap" section (+ a note that the full README rewrite is HT15). No V2 code.

---

## 17. Code Quality & UX Hardening (post-launch review pass)

**Why:** a post-HT15 senior-engineer-style pass over the whole codebase (not a diff review) surfaced real, cheap-to-fix gaps in accessibility, perf, code duplication, and test coverage that no Heavy Task owned. Two items from that review were deliberately **declined** rather than actioned — see the note below the checklist.

**Acceptance criteria:** each box below is independently shippable (no cross-dependencies) and must not regress `npx vitest run` / `npm run build` / `npm run check:secrets`.

- [x] Debounce the search input (`src/main.js:876`) — currently triggers a full `renderView()` per keystroke.
  - ↳ note: new `debounce()` helper next to `esc()`; 150ms. `renderView()` only touches `#viewMount`, not the search box itself, so no focus-loss risk.
- [x] Index tasks by `companyId` once per board render instead of `.filter()`-per-card in `renderKCard`/`renderBoard` (`src/main.js:1226-1240`) — same fix for the dashboard's `dueSoon` → `companyChip` → `companyById` lookup chain (`main.js:1057-1061`, `769`).
  - ↳ note: `renderBoard` now builds one `Map` (`indexNextOpenTaskByCompany`) instead of `renderKCard` filtering `DATA.tasks` per card. `companyChip` takes an optional `Map` (dashboard passes one built once at the top of `renderDashboard`); its only other caller (none) unaffected — falls back to the old `companyById` lookup if omitted.
- [x] Modal: Escape-to-close + a basic focus trap + focus-restore on close (`openModal`/`closeModal`, `main.js:3471-3481`).
  - ↳ note: `openModal` remembers `document.activeElement`, focuses the modal's first focusable element (or the close button) once mounted — unless `onMount` already focused something more specific, which every caller that needs it still does (e.g. `openRemoveAccountModal`'s confirm-name input). `closeModal` restores focus to whatever opened it. One module-level `keydown` listener (Escape closes; Tab/Shift+Tab traps focus inside `#modalBody`) — added once, gated on `#modalScrim.open`, so it's a no-op the rest of the time.
- [x] Make kanban cards and table rows keyboard-operable: `tabindex="0"` + Enter/Space to open, visible focus style (currently mouse/click-only beyond native `<button>`/`<a>`).
  - ↳ note: one generic `makeKeyboardClickable(root)` (next to `debounce`) — gives every `[data-open-company/contact/product/competitor/event]`, `[data-toggle-group]` and `.kcard` a tab stop + `role="button"` (if not already a native control) and re-fires its own click handler via `el.click()` on Enter/Space, rather than hand-wiring keydown logic at each of the ~20 existing click-binding call sites. Called from `bindView()` (every view), `bindDrawer()` (scoped to `#drawer`), and `openModal()` (scoped to the modal body). `:focus-visible` styling already existed globally (`style.css:129`) so no new CSS needed.
- [x] Icon-only buttons / logo images: audit + fill in missing `aria-label`/`alt` (only 6 `aria-*` and 2 `alt=` exist across all of `main.js` today).
  - ↳ note: every icon-only `<button class="x">` (remove pain point/current-solution/tag/task/highlight/campaign/clip/attendee/connector/news item), the 4 `drawer-close` buttons, the "add X" icon buttons, and the contacts group-toggle chevron now have a contextual `aria-label` (e.g. "Remove pain point: <text>", not just "Remove"). Logo `alt=` and the theme-toggle button were already covered. Buttons that already show visible text next to their icon (e.g. "Add contact") were left alone — they already have an accessible name.
- [x] Centralize the 54× repeated `'Could not ' + verb + ' — ' + (e.message || 'try again')` toast string into one helper.
  - ↳ note: `toastError(verb, e)` added next to `toast()`. 61 call sites now go through it (the original 54 plus a few added since HT17 was scoped, and one that had already drifted to no-space `+` concatenation). Toasts with a genuinely different message (e.g. "Could not read that file — expecting clips exported from the Aerosub Research extension") were left as-is — they don't follow the "verb + error.message" shape, so folding them in would change their wording.
- [x] Visible loading indicator on view refresh (`refreshCurrentView`, `main.js:911`) — currently silent; only first boot shows "Loading…".
  - ↳ note: added a `#viewLoading` "Refreshing…" span next to the view `<h1>`, toggled by `refreshCurrentView` (shown before the fetch, cleared once `renderApp()`/the `finally` block runs). Subtle pulsing-opacity CSS animation, no new dependency. `doRefreshAll`'s header button already disables itself while running, so this only covers the previously-silent nav-triggered refetch path.
- [x] Distinguish "filtered to zero results" from "no data yet" in the 13 empty-states (`main.js` — e.g. `1262,1872,3334`) so clearing a filter is obviously the fix when that's the cause.
  - ↳ note: new `emptyState(subject, shown, total)` helper — total===0 → "No X yet.", else → "No X match your search/filters." + a "Clear filters" button (`data-clear-filters`, wired once in `bindView()`, resets `ui.search` + the current view's filter object and re-renders). Applied to the 6 list-level empty-states that actually sit behind a search box and/or filter dropdowns: Companies (table view), Competitors, Research, Events, Contacts, Products. Left the other `empty` divs alone (drawer sub-lists like "no highlights yet", Settings/Activity/Tasks) — those aren't filtered views, so the old static copy was already correct.
- [x] Shared `openCreateModal(fields, api, arrayKey)` helper to collapse the ~250 lines of duplicated create/save/toast boilerplate across `openAddCompanyModal`/`openAddContactModal`/`openAddTaskModal`/`openAddSolutionModal`/`openAddCompetitorModal`/`openAddEventModal` (`main.js:3545,3577,3711,3745,2046,2593`). Do this **last**, after the smaller items land, and re-run every relevant `test:*` script afterward — highest blast radius of this batch.
  - ↳ note: `openCreateModal({title, fieldsHtml, saveLabel, errorVerb, build, save, successToast})` — collapses the Cancel/Save wiring, disable-on-save, try/catch+`toastError`, and closeModal/renderApp/toast sequence that was duplicated 6×. Each call site keeps its own field markup (option lists differ too much per entity to templatize safely) and its own `build()` (DOM→payload + validation, toasting and aborting on failure exactly as before) and `save()` (the API call, where the row gets pushed in `DATA`, and any side effect — `logActivity`, product's tag-at-creation extra API call, contact/task's conditional open-drawer refresh, returned as an optional post-render callback). No user-facing behavior changed: same field order, same validation messages, same toast text, same error-verb strings.
  - ↳ **verification**: `npx vitest run` 46/46, `npm run build` clean, `npm run db:check` 41/41, `npm run test:rls` 39/39, `npm run test:invite` 30/30, `npm run test:xss` 6/6, `npm run check:secrets` clean, `npm run smoke` 7/7. Plus a dedicated one-off real-browser pass (19/19, script deleted after use) driving all 6 modals: empty-required-field rejection, a good save (incl. product's tag-at-creation and contact's client-side email-format rejection), the new row appearing in its list, and surviving a full reload. DB reset to a clean seed after each data-writing run.
- [x] Persistent regression coverage for the views with none today: Contacts, Competition, Plan, Products, Reports (`scripts/` currently only persists auth/security/cross-browser tests — every prior per-Heavy-Task browser test for these views was written once and deleted). New script(s) modeled on `scripts/crossbrowser-smoke.mjs`'s pattern, wired to a `npm run test:*` script, kept (not deleted after use). This is the highest-value item in this batch — it's what would have caught the HT6 `source_url`→`url` mapping bug.
  - ↳ note: `scripts/view-regression.mjs` (new, kept) → `npm run test:views`. Modeled on `crossbrowser-smoke.mjs`'s bootstrap-a-confirmed-member + real-Chromium pattern (single browser — cross-browser coverage already lives in that other script). 21 assertions across the 5 views: **Products** — create, E-1 name edit (persists in the reopened drawer), add a highlight, tag to a client, **E-2 re-tag the same company with a new rationale → updates the existing `company_products` row, no duplicate**; **Competition** — create, E-1 identity edit (name/hq/website), log a campaign with a source link and **assert the rendered "Source ↗" `href` equals the `sourceUrl` that was typed, both immediately and after a full reload** (this is the exact shape of the HT6 `source_url`→`url` regression — the old assertion only checked the link rendered *a* value, this one checks it's *the right* value); **Contacts** — create, LinkedIn URL normalisation, edit, mark-contacted (from the company drawer — that control only exists there, not on the flat Contacts-view row), survives reload; **Plan** — a general (`company_id NULL`) task, toggle done from the Plan view, survives reload; **Reports** — build + export an `.html`, assert the CSP `<meta>` is present. Self-cleaning (deletes everything it created by its `VR-<timestamp>` marker) except the bootstrapped member/profile/invite/activity-log rows, same as every other persistent test script here — `db:reset` clears those.
  - ↳ **verification**: `node scripts/view-regression.mjs` 21/21 (twice, after fixing two Playwright locator bugs found on the first run — a `selectOption({label})` needs a string not a RegExp, and "Mark contacted" only exists on the company-drawer contact row, not the flat Contacts-view table row). `npx vitest run` 46/46, `npm run build` clean, `npm run db:check` 41/41 (after `db:reset`), `npm run check:secrets` clean.

**Declined (reviewed, not doing):**
- Paginating `loadAll()`'s company/contact/task/etc. fetches — the kanban board and tables are designed to show the whole dataset at once; paginating would break that, not fix a real problem at this app's intended scale (PRD: ~10-20 accounts, one team). Left as-is.
- A "Retry" affordance on error toasts — would touch all ~127 `toast()` call sites for a real interaction-model change that cuts against the app's deliberate "no optimistic UI, keep it simple" design (PRD §16). Re-clicking the action already works. Left as-is.
- Bundle size (390 kB / 110 kB gzip, almost entirely `@supabase/supabase-js`) — no low-risk lever available (would mean changing how the Supabase client is imported); not worth it for an internal tool used by one team.

---

## Final Report (Step 5) — when HT0–16 are all `[x]`

### What was built

The single-file `localStorage` prototype (`app/aerosub_crm.html`) is now a small multi-user web app on Supabase: real per-person accounts behind Row Level Security, one shared Postgres database, every prototype feature intact, no feature lost.

- **Frontend**: wrapped in Vite (HT0) with zero behaviour change first, then the data layer split into modules (`store.js`, `api.js`, `api/*.js` per entity, `auth.js`, `validate.js`) as each view was rewired (HT4–HT12); the render/UI code (`main.js`) stayed one file per D-1.
- **Schema**: 18 tables (PRD §6) via 12 committed, timestamped migrations — `enable`+`force` RLS on all 18, 66 policies, `is_member()`/`set_updated_at()`/`handle_new_user()`/`log_stage_change()` + a `profiles` and `invites` column-lock trigger, all owned by a `BYPASSRLS` role.
- **Auth**: invite-link signup only (no open signup, no RBAC — any member can do anything), password reset, a profile-less "ask a teammate for a new invite" screen, and a `guardMembership()` hardening pass that catches a session whose `profiles` row disappeared mid-visit.
- **Every view rewired off `localStorage` onto Supabase**: Dashboard, Companies (kanban + table, drag-to-stage, E-1 identity edit, delete-cascade), Contacts (global list, mark-contacted, promote-from-research), Competition (E-1 identity edit, campaign CRUD), Research (manual add + Chrome-extension import + "load older"), Plan (general + per-company tasks), Products & Offers (E-1 identity edit, E-2 re-tag), Reports (sandboxed preview, CSP-hardened `.html`/`.md` export), Events, Settings (team, invites, connectors, activity log).
- **Chrome extension** rewired to write `research_clips` directly when signed in + online, queue in `chrome.storage.local` and sync later when offline/signed-out; anon-key-only bundle; MV3; packaged as a distributable zip.
- **Security**: 4-layer input handling (`esc()` on render, CSP on every export, DB `CHECK` constraints, `validate.js` client-side), an XSS matrix planted in every free-text field of every table and walked through every view + export (`test:xss`), `_headers`/`_redirects` with HSTS/CSP/frame-deny/COOP (`test:headers`), and a secret scanner wired as a pre-commit hook.
- **Deployment**: Cloudflare Pages (free, unmetered), prod Supabase (free) with migrations + seed + bootstrap invite, weekly `pg_dump` backup + 3-day keepalive GitHub Actions, old Claude Artifact retired.
- **Post-launch hardening (HT17)**: a code-quality/a11y pass (debounced search, indexed board lookups, modal focus-trap/Escape/keyboard-operable cards, `aria-label`s) followed by a second pass finishing the batch — a centralized `toastError()` helper (61 call sites), a visible "Refreshing…" indicator on view refetch, filtered-vs-empty-state messaging with a "Clear filters" action, a shared `openCreateModal()` helper collapsing ~250 duplicated lines across the 6 "add new X" modals, and `scripts/view-regression.mjs` (`npm run test:views`, kept) as the first persistent regression coverage for Contacts/Competition/Plan/Products/Reports.

**Test coverage at handoff**: `npx vitest run` 46/46 · `npm run db:check` 41/41 · `npm run test:rls` 39/39 · `npm run test:invite` 30/30 · `npm run test:xss` 6/6 · `npm run test:headers` 11/11 · `npm run test:ext` 23/23 · `npm run smoke` 7/7 · `npm run test:crossbrowser` 14/14 · `npm run test:views` 21/21 · `npm run check:secrets` clean.

### Deviations from the prototype (PRD §15, D-1…D-14) and why

- **D-1** — single HTML file → minimal Vite project (data layer split into modules as each was rewired; UI stayed one file). One static deploy, no backend, per the brief.
- **D-2** — activity log is delete-able ("Clear log" preserved; no role model to restrict it, insert stays attribution-forced and immutable). Not tamper-evident — accepted for a small trusted team.
- **D-3** — `permission`/`PERMISSIONS`/Admin-Editor-Viewer removed as dead code (RBAC forbidden by the brief). Any member can do anything.
- **D-4** — shared passcode + `genPasscode` + bypass flag → real Supabase Auth, invite-link signup. First member is a hand-inserted invite; no open signup.
- **D-5** — news dismissal is team-wide via `news_items.dismissed_at` (was a per-browser `dismissedNewsIds` array) — same effect, shared instead of local.
- **D-6** — `claude.use('downloads')` removed from all 5 export sites → `Blob` + `<a download>` (the app no longer runs inside that sandbox).
- **D-7** — *(withdrawn)* seeded contacts already got ids via the existing stamping loop; no change needed.
- **D-8** — `meta.createdAt` dropped (unused in the UI).
- **D-9** — the sidebar's destructive "Import data (replace)" was removed rather than ported — a wholesale-replace can't safely touch a shared Supabase DB from one client. An upsert-merge importer was scoped as a replacement but deferred (OQ-4: the founder confirmed the seed is the only dataset that matters) — JSON export remains the break-glass snapshot.
- **D-10** — *(withdrawn — see S-7)* scalar lists (`pain_points`, `current_solutions`, `highlights`, `benefits`) stay `text[]` columns, not child tables — the concurrency argument for child tables doesn't hold at this usage pattern.
- **D-11** — `tasks.company_id` is `ON DELETE CASCADE` (matches the prototype); general tasks are `company_id IS NULL` and survive an account delete.
- **D-12** — `LIVE_NEWS_SNAPSHOT`, `mergeLiveNewsSnapshot()`, and `dismissedNewsIds` deleted outright — the DB is now the single source of news; the V2 news-feed job (§12) will write `news_items` directly instead of merging a client-side snapshot.
- **D-13** — (HT0) removed one malformed, provably-zero-effect CSS rule (`lightningcss` rejected it at build time).
- **D-14** — (HT15) **Resend SMTP skipped for launch.** Prod auth runs on Supabase's built-in email instead — rate-limited (2/hr default) and not deliverability-guaranteed (no verified sending domain). All initial team members were invited and confirmed successfully under this setup, but it will bite on clustered password resets or once the team outgrows the hourly cap. Resend wiring is scoped and ready in PRD §5.6 — pick it up before the next onboarding wave or the first reported "didn't get my email."

### Enhancements over the prototype (PRD §17, E-1…E-3)

- **E-1 — Editable identity fields.** The prototype couldn't rename a company/competitor/product or edit type/summary/hq/website (only events had this). Inline edit added everywhere, matching the existing event-details editor pattern.
- **E-2 — Re-tagging a product updates its rationale** instead of creating a duplicate tag row (`company_products` has `unique (company_id, product_id)` + an upsert-on-conflict).
- **E-3 — Editable own-profile name/department** in Settings.

### Deliberately cut / deferred (PRD §16 — systems-design decisions, S-1…S-17)

- **No realtime** (S-3) — refetch-on-navigate covers "see everyone's latest data" for a tool used rarely and mostly solo; a realtime channel + echo suppression + focus-safe re-rendering + conflict prompts wasn't worth it.
- **No optimistic UI** (S-4) — `await` the write, then patch + render. A save is invisible at this latency; skipping it removes all revert-on-failure logic.
- **Scalar lists stay `text[]`, not child tables** (S-7) — 4 fewer tables, 16 fewer policies; the concurrency case for child tables needs simultaneous editing of one record, which doesn't happen at this usage level.
- **No DB-trigger input sanitisation** (S-11) — `esc()` on render + export CSP + `CHECK` constraints + `validate.js` is the accepted XSS story for an all-trusted-users tool; a `scrub_text` trigger layer is available hardening, not a V1 requirement.
- **Self-serve offboarding deferred** (§5.7, S-8) — removing a person is an admin deleting the `auth.users` row in the Supabase dashboard (cascades `profiles`; `activity_log.actor_name` snapshots survive). Rare event, not worth a UI.
- **Also deferred, lower priority**: the upsert-merge "Migrate my local data" importer (D-9, OQ-4 — not needed, seed is the only dataset); test-infra cleanup C1/C2 from the HT14 review pass (extracting the copy-pasted member-bootstrap helper across 7 test scripts into one shared module; a `.neq`→`.not(...,'is',null)` intent-clarity tweak in `activity.js`) — both behaviour-neutral, left open in HT14's checklist for whoever picks this codebase back up.

### Accepted limitations

- **Last-write-wins, no merge UI** (S-5) — concurrent edits are near-impossible at this usage; if two edits collide, the later write wins and the other person sees current text on next open.
- **No live updates while watching** — a teammate's change only appears on your next navigate or an explicit "Refresh" (now with a visible "Refreshing…" indicator, HT17).
- **Bounded client loads** — `research_clips` (200) and `activity_log` (100) load newest-first with "load more"; every other table loads whole (small at this scale, PRD §16 S-2).
- **Weekly backup granularity** — `pg_dump` runs weekly via GitHub Actions (plus a 3-day keepalive so the free Supabase project doesn't pause); a restore between backups loses up to a week, accepted for a $0/mo internal tool. One `pg_restore` still needs a hands-on test against a real backup file once one exists (HT15 note).
- **Prod email is rate-limited** — see D-14 above; the practical ceiling on password resets/invites until Resend is wired.

### V2 roadmap

See [ROADMAP.md](ROADMAP.md) — live feeds, reminders, email send/track, enrichment, PDF/DOCX export, pipeline forecasting (on the existing `company_stage_changes` history, no new table), full-text search, realtime/presence (if co-use grows), self-serve offboarding, and the read-auditing caveat, each with its V1 hook and V2 delivery plan.
