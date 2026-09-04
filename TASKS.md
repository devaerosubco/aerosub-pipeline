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
| 4 — Execute | 🟢 **not started — ready to start.** HT0 needs only Node; HT1–HT12 run on local Supabase (Docker, present). HT13–HT15 (deploy) need OQ-1 + OQ-3. |
| 5 — Final report | pending |

**What's needed, and when:**
- **Now** — HT0. Needs Node + npm (present).
- **HT1–HT12** — `supabase start` (Docker — the owner has it). Local Supabase = Postgres + Auth + a catch-all mailbox at `localhost:54324`. Everything built and tested here, $0, nothing external.
- **HT13–HT15 (deploy) only** — **OQ-1**: one free Supabase prod project (URL + anon key + DB password). **OQ-3**: a free Resend account + `send.aerosub.co` DNS. Free Cloudflare + GitHub accounts.

**Resolved:** OQ-2 (invite signup) · OQ-3 (Resend) · OQ-4 (seed is the only data) · OQ-5 (`company_stage_changes` in V1) · OQ-6 (Cloudflare Pages) · OQ-7 ($0/mo) · OQ-8 (Docker present → local dev).

---

## 0. Wrap the app in Vite — ZERO behaviour change

**Why first:** get the build tool in place while still on `localStorage`, so the Supabase swap that follows is a clean diff. The module split (`store.js`, `api.js`, …) happens naturally in HT4+ *as those pieces are rewired* — don't force it now. **Needs no Supabase — start now.**

**Acceptance criteria:** `npm run dev` and `npm run build` produce an app that behaves *identically* to `app/aerosub_crm.html` today — same seed, same `localStorage` key (`aerosub_pipeline_v1`), every feature, the passcode gate still works. The only change is packaging.

- [ ] `npm init`; add `vite` + `vitest`; `git init` (offer). `.gitignore`: `node_modules/`, `dist/`, `.env`, `.env.*.local`, `.env.test` — **not** `.env.example`.
- [ ] `index.html` at repo root becomes the real entry (was a redirect stub): `<head>` with the `<title>` + charset/viewport, `<link rel="stylesheet" href="/src/style.css">`, `<script type="module" src="/src/main.js"></script>`.
- [ ] `src/style.css` = the prototype's `<style>` block verbatim. `src/main.js` = the prototype's `<script>` body verbatim (one file — do **not** split it). Add `export`s only where HT4+ will need them later; otherwise leave the code as-is.
- [ ] `app/aerosub_crm.html` stays as the frozen reference until HT15.
- [ ] Manual pass: built app vs. the original file — walk the PRD §14 Preserved-feature checklist against `localStorage`; identical, including the passcode gate.
- [ ] Commit. This is the baseline for every later "did I break it?" check.
  - ↳ note:

---

## 1. Supabase Schema & RLS (local)

**Acceptance criteria:** All **18** tables (PRD §6) via committed timestamped migrations; `enable` + `force row level security` on all 18; functions `is_member`, `set_updated_at`, `handle_new_user`, `log_stage_change` + the `profiles` column-lock trigger exist, owned by the `BYPASSRLS` migration role (`postgres` locally); `config.toml` + migrations committed; no secrets committed. **`supabase db reset` (local) applies the schema clean on an empty DB** (the seed is HT3 — a deliberate forward reference; HT1's last subtask and this clause complete once HT3's `seed.sql` exists).

- [ ] `supabase init`; commit `config.toml`; `.env.example` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Dev = `supabase start` (Docker). `config.toml`: `[auth] enable_confirmations = true`, `site_url = "http://localhost:5173"`, `additional_redirect_urls` incl. the same; `[db.seed] enabled = true` (so `db reset` runs `supabase/seed.sql`).
- [ ] `0001_extensions.sql` — confirm `pgcrypto` in schema `extensions` (`gen_random_bytes` called as `extensions.gen_random_bytes`; `gen_random_uuid()` is core).
- [ ] `0002_helpers.sql` — `set_updated_at()`; `is_member()` per PRD §7.1 verbatim (`security definer`, `search_path=''`, revoke from public/anon, grant to authenticated).
- [ ] `0003_profiles_invites.sql` — `profiles` (`email unique`; mutable → `updated_at` + `set_updated_at`) + a `BEFORE UPDATE` trigger rejecting `id`/`email` changes; `invites` (`token` default `encode(extensions.gen_random_bytes(16),'hex')`, `expires_at` CHECK `≤ created_at + interval '30 days'`); **`handle_new_user()`** per PRD §5.2 — one `AFTER INSERT ON auth.users` `SECURITY DEFINER` fn: conditional `UPDATE invites … WHERE token=v_token AND consumed_at IS NULL AND expires_at > now() AND (email IS NULL OR lower(email)=lower(new.email))` → `RAISE` if `NOT FOUND` → `INSERT INTO profiles`. (No separate `enforce_invite` — PRD §16 S-8.)
- [ ] `0004_companies.sql` — `companies` (incl. `pain_points text[] default '{}'`, `current_solutions text[] default '{}'`), `company_flags` (+ CHECKs, cascade FKs, `set_updated_at`, indexes PRD §6.19).
- [ ] `0005_stage_history.sql` — `company_stage_changes` (**append-only: `id` + `created_at` only, no `updated_at`, no `set_updated_at`**) + `log_stage_change()` `AFTER UPDATE` on `companies` when `new.stage is distinct from old.stage`.
- [ ] `0006_contacts_products.sql` — `contacts`, `products` (incl. `highlights text[]`), `company_products` (**`unique (company_id, product_id)`**).
- [ ] `0007_competition_plan.sql` — `competitors`, `competitor_campaigns`, `tasks` (`company_id text NULL FK companies **on delete cascade**`).
- [ ] `0008_research_events_news.sql` — `research_clips`, `events` (incl. `benefits text[]`), `event_attendees`, `news_items` (`kind text check (kind is null or kind in ('company','product'))`).
- [ ] `0009_settings.sql` — `connectors`, `activity_log` (**append-only: no `updated_at`/`set_updated_at`**), `app_settings` (`check (id=1)` + `insert (id) values (1) on conflict do nothing`).
- [ ] `0010_rls.sql` — `enable` + `force row level security` on all 18; the standard 4 policies (PRD §7.2, every predicate `(select public.is_member())`) on the 15 standard tables (incl. the extra `created_by = auth.uid()` on the `invites` insert policy); specific policies for `profiles`, `activity_log`, `company_stage_changes` (PRD §7.3).
- [ ] `supabase db reset` → schema applies clean on an empty DB, no errors. Commit. (Re-run after HT3 to confirm schema + seed.)
- [ ] `scripts/check-no-secrets.sh` — flags `service_role` / `SUPABASE_SERVICE_ROLE` / PEM blocks / any `eyJ…` JWT whose payload decodes to `"role":"service_role"`; **does not** flag the anon key (PRD §8.2). Wired into pre-commit; passes.
  - ↳ note:

---

## 2. Auth & Invite Flow (local)

**Acceptance criteria:** With a valid invite link, name+email+password signup → confirm (via `localhost:54324`) → `profiles` row with `full_name`, invite consumed → sign in. No / expired / consumed / mismatched / revoked token → rejected at the DB; `>30d` expiry → CHECK rejects. Concurrent redemption → one winner. Profile-less session → "get a new link" screen, no data access. Password reset + "set new password" works. Any member can create/list/revoke invites in Settings. Shell driven by `onAuthStateChange` + profile check; sign-out clears `DATA`.

- [ ] Bootstrap: `insert into public.invites (email) values ('you@example.com') returning token;` → `http://localhost:5173/?invite=<token>` → sign up → grab the confirm link from `localhost:54324`.
- [ ] `src/auth.js`: `createClient` (PKCE, `persistSession`, `autoRefreshToken`, `detectSessionInUrl:true`). Exports `getSession`, `onAuthChange`, `signIn`, `signUpWithInvite({fullName,email,password,token})` (passes `options.data = {full_name, invite_token}` + `emailRedirectTo = location.origin`), `signOut`, `resetPassword`, `updatePassword`, `myProfile()`.
- [ ] `signUpWithInvite` error handling: GoTrue returns a generic *"Database error saving new user"* on any `handle_new_user` `RAISE` — **don't try to parse the reason**. Show one catch-all: "Sign-up failed — your invite link may be invalid, expired, or already used. Ask a teammate for a new one." (PRD §5.2).
- [ ] Replace `renderGate()` → `renderAuth()`: **Sign in** / **Forgot password**; **Complete signup** (name+email+password) when `?invite=<token>` (email prefilled+locked if the invite pins one); **Set new password** state; "check your inbox" states; "invite not valid / access removed" state for a profile-less session (+ sign out).
- [ ] Boot: `getSession()` → session? `myProfile()` → profile? load app : profile-less screen. No session → auth screen. `onAuthChange` handles **`PASSWORD_RECOVERY`** (→ Set-new-password screen *even though a session now exists*), `SIGNED_OUT` / `TOKEN_REFRESHED` failure / a `USER_UPDATED` that drops the profile (→ clear `DATA` + auth screen), and `SIGNED_IN`.
- [ ] `src/api/invites.js` + Settings panel: `create({email?, expiresDays?≤30})` → copyable `?invite=` link (`created_by = auth.uid()`); `list()`; `revoke(id)`.
- [ ] Settings "Team" list = `profiles`; edit own `full_name`/`department`.
- [ ] Delete dead auth code: `accessCode`, `passcode`, `genPasscode`, `teamHasIndividualLogins`, `isUnlocked`, `maybePromptForName`, `sessionStorage`/`localStorage` keys, gate copy, "Show passcodes"/"Set code"/regen UI.
- [ ] Run the PRD §14 invite/signup test matrix; record here.
  - ↳ note:

---

## 3. Seed Migration (seed → SQL)

**Acceptance criteria:** `supabase/seed.sql` loads the baseline (10 companies + flags/contacts/tags, 6 products, 10 competitors + campaigns, 12 tasks, 6 news, 6 events + attendees, 3 connectors) with FK integrity; `pain_points`/`current_solutions`/`highlights`/`benefits` as `text[]` literals; task + news dates land relative to today. **`supabase db reset` now reproduces schema + seed from zero** (completes HT1's last clause); running `seed.sql` twice → no dupes.

- [ ] `scripts/seed-source.mjs` — `seedData()` + `SOLUTIONS` + `STAGES` verbatim from `app/aerosub_crm.html` (comment cites lines). Running `seedData()` resolves the closures, so contacts/campaign/attendee ids are already stamped and dates are already concrete.
- [ ] `scripts/extract-seed.mjs` — object graph → `seed.sql`: FK order (PRD §10.2); scalar lists → `'{...}'` array literals; `recommended[]` → `company_products (product_id, rationale)`; for `tasks.due` / `news.date`, compute `N = (resolvedDate − today)` in days and emit `current_date + N` (not the hardcoded date) so the seed stays fresh whenever applied; `on conflict (id) do nothing`; **assert** every `recommended[].sol` resolves to a seeded product and every `attendee.companyId` is `''`/null or a seeded company.
- [ ] Generate; `supabase db reset`; verify per-entity row counts; spot-check `seplat` (contacts, flags, pain points, current solutions, tagged products) + `nestoil` (the critical flag).
- [ ] `seed.sql` again → counts unchanged.
- [ ] Re-confirm HT1: `supabase db reset` = clean schema + seed, no errors.
- [ ] *(low priority — OQ-4)* `src/migrate-local.js` + Settings "Migrate my local data" (upsert-merge, PRD §10.6). One sample-export test. Can be dropped if the founder confirms nothing beyond seed.
  - ↳ note:

---

## 4. Data Layer + Companies + Dashboard & News

**Acceptance criteria:** `store.js` loads all tables into the prototype's `DATA` shape (bounded `activity_log`/`research_clips`) and re-pulls a view's slice on navigate. `api.js` writes: `await` call → on error toast → on success patch `DATA` + re-render (no optimism). Companies: kanban drag (8 stages) + table toggle + filters + search; company drawer stage/priority, **name/type/summary edit (E-1)**, delete (cascade verified), pain points, current solutions, product tags, notes — persist and survive reload. Dashboard widgets correct. News ticker + "Manage news" modal (add / dismiss / last-refreshed badge) work against `news_items`. A stage move writes `company_stage_changes`.

- [ ] `src/store.js` — replace the localStorage `Store` with: `loadAll()` (parallel `select`; `activity_log` last 100, `research_clips` last 200, no `company_stage_changes`) → `DATA` in prototype shape per **PRD §6.20** (`toRow`/`fromRow` per entity — `products`→`DATA.solutions`, `contacts.position`→`pos`, `company_products`→`company.recommended` as `{sol,why}`, snake↔camel); `refetchView(name)`; a header **"Refresh"** that calls `loadAll()`.
- [ ] Unit-test `toRow`/`fromRow` (Vitest): every entity round-trips; `recommended`↔`company_products`; `text[]`↔JS array; `kind:null`↔"General".
- [ ] `src/api.js` — `write(table, op, payload)`: call supabase → error → `toast(reason)` (offline / validation / RLS) & rethrow → success → return row. Callers patch `DATA` + re-render.
- [ ] `src/api/companies.js` — `create` (client `id` via `crypto.randomUUID()`), `update`, `remove`, `setStage`, `setPriority`, `editIdentity` (name/type/summary — E-1); `pain_points`/`current_solutions` as whole-array updates; flags via `company_flags`.
- [ ] Rewire `renderBoard`/`renderKCard`/`renderCompanyTable`/`bindCompaniesControls`/drag; `renderDrawer`/`bindDrawer` (+ inline name/type/summary edit). Delete → `companies` delete; refetch cascaded slices.
- [ ] Dashboard: recompute stage bar / flags / high-priority / overdue+due-soon / pain themes from `DATA`.
- [ ] **News**: `src/api/news.js` (`create` with `kind: null` for "General", `dismiss(id)` → `dismissed_at = now()` + `dismissed_by`, hard `remove`). Rewire `renderTicker`/`startTicker`/`renderDashboard` ticker/`openManageNewsModal`/`newsRefLabel`. **Delete `LIVE_NEWS_SNAPSHOT`, `mergeLiveNewsSnapshot()`, and all `dismissedNewsIds` logic** (PRD §15 D-12). "Last refreshed" badge reads `app_settings.last_news_refresh` (null in V1 → hide it).
- [ ] Verify a stage drag writes one `company_stage_changes` row (`from`/`to`/`changed_by`).
- [ ] Regression vs. HT0 baseline: Dashboard + Companies + drawer + news ticker/modal.
  - ↳ note:

---

## 5. Contacts

**Acceptance criteria:** Global list, verified-first, search, edit, mark-contacted, `mailto:` draft, promote-from-research — persist to `contacts`. Validators run on changed fields only.

- [ ] `src/api/contacts.js` — `create` (client id), `update`, `remove`, `markContacted`, `setFollowUp`.
- [ ] Rewire `renderContacts`/`bindContactsControls`/`renderContactRow`/`openAddContactModal`/`openEditContactModal`/`findContact`.
- [ ] `openEmailModal` — keep `mailto:`; log via `api/activity`.
- [ ] "Promote contact" (Research) → `contacts` insert with `company_id`.
- [ ] `validate.js` `email`/`linkedin` — changed-fields-only, normalise.
- [ ] Regression: Contacts checklist.
  - ↳ note:

---

## 6. Competition

**Acceptance criteria:** 10 competitors, modality/threat filters, add competitor, **name/hq/website edit (E-1)**, campaign CRUD (all fields incl. verdict), competitor notes — against Supabase.

- [ ] `src/api/competitors.js` — competitor `create`/`update`/`editIdentity`/`remove`; campaign `create`/`update`/`remove`.
- [ ] Rewire `renderCompetitors`/`bindCompetitorsControls`/`renderCompetitorDrawer`/`bindCompetitorDrawer`/`openAddCompetitorModal`/`allCampaigns`/`competitorById` (+ inline identity edit).
- [ ] Enum validation; `source_url`/`website` normalised.
- [ ] Regression: Competition checklist.
  - ↳ note:

---

## 7. Research (+ extension import path)

**Acceptance criteria:** Manual add, link-to-account, promote-contact, delete against `research_clips`; "Import clips" (extension JSON) writes rows; recent-200 + "load more".

- [ ] `src/api/research.js` — `create` (client id), `update`, `remove`, `linkCompany`, `importClips(array)` (validate + bulk insert, `created_by`).
- [ ] Rewire `renderResearch`/`bindResearchControls`/`openAddResearchModal`/`doImportResearch`/`filteredResearch`; "load more".
- [ ] `validate.js` `url`/`contact_email`/`contact_linkedin` (normalise, changed-only).
- [ ] Regression: Research checklist; import a real extension export file.
  - ↳ note:

---

## 8. Plan

**Acceptance criteria:** Task groups (overdue/week/later/done), toggle, delete, add (general or per-company), per-company tasks in the company drawer — persist to `tasks`; dashboard counts correct; deleting a company deletes its tasks; general tasks (`company_id IS NULL`) survive.

- [ ] `src/api/tasks.js` — `create` (client id), `update`, `toggleDone`, `remove`.
- [ ] Rewire `renderTasks`/`bindTasksControls`/`taskCard`/`openAddTaskModal` + company-drawer task section. General task = `company_id: null`.
- [ ] Enum `priority`; date `due`.
- [ ] Regression: Plan checklist + dashboard overdue/due-soon; delete a company → its tasks gone, a general task untouched.
  - ↳ note:

---

## 9. Products & Offers

**Acceptance criteria:** 6 products, **name/tag edit (E-1)**, kind/status/blurb, highlights (`text[]`), tag/untag from the product side, **re-tag updates rationale (E-2)**, delete (removes all `company_products`).

- [ ] `src/api/products.js` — `update`/`editIdentity`/`remove`; `highlights` whole-array update; `tag(companyId, why)` = `upsert on conflict (company_id, product_id) do update set rationale` (E-2); `untag(companyId)`.
- [ ] Rewire `renderSolutions`/`bindSolutionsControls`/`renderProductDrawer`/`bindProductDrawer`/`openAddSolutionModal`/`solutionById`/`taggedCompaniesFor`/`untaggedCompaniesFor` (+ inline name/tag edit).
- [ ] Delete product → cascade `company_products` → refetch.
- [ ] Regression: Products checklist, both tagging directions, re-tag updates reason.
  - ↳ note:

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
- [ ] `.github/workflows/backup.yml` — **weekly**: `supabase db dump --linked` (with `SUPABASE_ACCESS_TOKEN` secret) **or** `pg_dump` v15+ against the **Supavisor session pooler** string (`…pooler.supabase.com:5432`, user `postgres.<ref>`) — **not** the direct `db.<ref>.supabase.co` host (IPv6-only on free; GH runners have no IPv6). `| gzip` → **Cloudflare R2** (`R2_*` secrets; GH artifact fallback), keep last ~12. **Test one restore** into a fresh local project.
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
