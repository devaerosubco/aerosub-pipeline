# QA Results — Aerosub Pipeline (HT14)

Date: 2026-09-09 · Branch: `supabase-rebuild` · Tester: engineering

This document consolidates the test evidence for the Supabase rebuild. It maps
the PRD §14 test matrix and the Preserved-feature checklist to concrete,
repeatable checks — the automated scripts below, plus the manual items an
operator runs on the production deployment.

> **Environment.** Everything here runs against **local Supabase** (`supabase
> start`, PostgreSQL 17.6, the catch-all Mailpit mailbox) driving the Vite dev
> build. There is no production deployment yet — HT15 stands up Cloudflare
> Pages + the prod Supabase project, and the deploy-only rows (real external
> email, prod headers, second-device check) are re-run there. The prod
> Supabase project (`fjjkhlgcdooxkqzbhvih`, London) already has all 11
> migrations + the seed applied and verified (table counts match local; the
> anon client sees 0 rows — RLS on).

---

## 1. Automated test suite

Run from the repo root with local Supabase up (`supabase start`). One command:

```
npm test && npm run db:check && npm run test:rls && npm run test:invite \
  && npm run test:xss && npm run test:headers && npm run test:ext \
  && npm run smoke && npm run test:crossbrowser && npm run check:secrets
```

| Script | Command | What it proves | Result |
|---|---|---|---|
| Unit — mappers + validators | `npm test` (vitest) | `store.js` row⇄`DATA` round-trips for every entity; `validate.js` rules; extension `clips.js` logic | **43/43 PASS** |
| Schema / seed structure | `npm run db:check` | 18 tables RLS enabled+forced, 66 policies, seed row counts, append-only columns, the `auth.users` signup trigger | **41/41 PASS** |
| RLS matrix | `npm run test:rls` | anon + profile-less → 0 rows / denied on all 18 tables (select+insert+update+delete); a real member → exactly the CRUD §7 allows; `profiles` update-own-only + id/email lock; `activity_log` no-update; `company_stage_changes` select-only but the trigger writes history; `invites.consumed_at` not client-writable | **39/39 PASS** |
| Invite / signup | `npm run test:invite` | no / garbage / expired / consumed / email-mismatch / revoked token → rejected; `>30d` expiry CHECK; valid → confirm → `profiles` row with `full_name`, invite consumed; two concurrent redemptions → one winner; password reset → recovery → new password works, old fails; profile-less session reads nothing; 5 `activity_log` RLS asserts | **30/30 PASS** |
| XSS matrix | `npm run test:xss` | `<script>` / `<img onerror>` / `<svg onload>` / `javascript:` planted in **every free-text field of every table** (incl. `text[]` elements, the member's own `full_name`); sign in, walk every view + every poisoned drawer + build an export → 0 `alert()`, 0 `window.__xss`, 0 page errors; exported report inert when opened as its own file | **6/6 PASS** |
| Deploy headers / CSP | `npm run test:headers` | `_headers` parsed + applied to a `dist/` preview: app boots under the strict CSP, an injected inline `<script>` does **not** run (and fires a CSP violation), the page cannot be framed, HSTS + `frame-ancestors 'none'` + `script-src 'self'` (no `unsafe-inline`) present, `connect-src` allows the Supabase origin | **11/11 PASS** |
| Chrome extension | `npm run test:ext` | builds `chrome-extension/dist/`; a signed-out client is **denied** inserting `research_clips` (so the popup queues); a signed-in member inserts one with the **anon key + session**, attributed via `created_by`, URL normalised; `flushQueue` uploads a queue and clears it; the app reads the extension's clips; the built bundle's only JWT is `role:anon`; manifest is MV3 with the right `host_permissions` + CSP; popup renders (3 tabs, sign-in form, title-required validation, queue-while-signed-out) | **23/23 PASS** (12 data-path + 11 popup) |
| Real-browser smoke | `npm run smoke` | Vite dev server + headless Chromium: bootstrap a confirmed member (real invite → signup → Mailpit confirm), sign in, dashboard renders with seeded companies, no console/page errors | **7/7 PASS** |
| Cross-browser smoke | `npm run test:crossbrowser` | **Chromium + Firefox**: kanban shows 8 columns + seeded cards; a board move persists across a full reload; a drawer summary edit (E-1) persists across a reload; a report exports as `.html` carrying the CSP `<meta>`; no console/page errors in either browser | **14/14 PASS** (7 per browser) |
| Secret scan | `npm run check:secrets` | no `service_role` JWT / PEM key / service-role assignment anywhere in the tree, the web `dist/`, or the extension `dist/` (the shipped anon key is correctly **not** flagged) | **clean** |

New this task:
- `scripts/crossbrowser-smoke.mjs` — added to cover PRD §14's "Cross-browser:
  Chrome + Firefox — board drag, drawer edits, exports". HTML5 drag-and-drop is
  driven by dispatching the real `dragstart`/`dragover`/`drop` sequence with a
  shared `DataTransfer` (synthetic mouse moves don't trigger native DnD).
- `scripts/ext-save-test.mjs` — made self-cleaning (deletes its own
  `research_clips` rows + test member before and after) so the suite is
  repeatable against a persistent DB, not only immediately after `db reset`.

---

## 2. PRD §14 test matrix

| §14 line | Covered by | Status |
|---|---|---|
| **RLS matrix** — anon + profile-less → 0/denied everywhere; member → per-§7 CRUD; `relrowsecurity`+`relforcerowsecurity` on all 18 | `test:rls`, `db:check` | ✅ local |
| **Invite / signup** — 5 rejection cases, `>30d` CHECK, confirm, `profiles` row, consumed, concurrent → one winner; BYPASSRLS (signup end-to-end, stage-move history, no `profiles` recursion) | `test:invite`, `test:rls` | ✅ local |
| **Migration** — `seed.sql` ×2 → no dupes; task + news dates relative to today; `recommended[]` → `company_products` | `db:check` + re-apply (below) | ✅ local |
| **Validation** — edit only the phone on a contact with a masked seeded email → saves; `adipec.com` normalises; `not a url` rejected inline | vitest `validate.test.js` + HT5/HT13 browser passes | ✅ local |
| **XSS** — hostile strings in every field + array element → inert in-app and in exported HTML | `test:xss` | ✅ local |
| **Feature regression** — the Preserved-feature checklist | §3 below + per-HT browser passes | ✅ local |
| **Extension** — sign in → save online → appears in Research; save offline → queued → syncs; bundle has anon key only | `test:ext` | ✅ local (load-unpacked = manual, §4) |
| **Deploy** — HTTP→HTTPS; headers present; inline `<script>` blocked by CSP; not framable | `test:headers` (local, headers injected) | ⏳ re-run on prod (HT15) |
| **Cross-browser** — Chrome + Firefox: board move, drawer edits, exports | `scripts/crossbrowser-smoke.mjs` | ✅ local |

### Migration re-apply check

`supabase/seed.sql` is `on conflict (id) do nothing` throughout. Applying it a
second time against an already-seeded DB changes no row counts (`db:check`
stays 41/41). `tasks.due` and `news_items.date` are emitted as `current_date +
<offset>` so they always land relative to the day the seed runs. The
`recommended[]` arrays in `seedData()` are expanded into `company_products`
rows (21 of them) by `scripts/extract-seed.mjs`, which also asserts every
`sol`/`companyId` reference resolves before writing the file. The localStorage
importer (PRD §10.6) was dropped — OQ-4 confirmed the seed is the only dataset;
JSON export remains as the manual snapshot path.

---

## 3. Preserved-feature checklist (PRD §14)

Every view's **reads** have come from Supabase since HT4; each view's **writes**
were wired to a real `src/api/*.js` module in its own Heavy Task and verified
then with a dedicated real-browser Playwright pass (HT4 14/14, HT5 10/10, HT6
14/14, HT7 12/12, HT8 11/11, HT9 12/12, HT10 13/13, HT11 11/11 — see `TASKS.md`
HT4–HT13 notes). This is the consolidated walk.

| Area | Items | Backed by | Status |
|---|---|---|---|
| **Dashboard** | stage bar, flags, high-priority, overdue/due-soon, pain themes, news ticker — all recomputed from the loaded store | HT4 | ✅ |
| **Companies — board/table** | kanban 8 stages, drag between stages, board/table toggle, priority + stage filters, search | HT4 · cross-browser smoke | ✅ |
| **Company drawer** | stage, priority, **name/type/summary edit (E-1)**, delete (cascades contacts/flags/tags/tasks/stage-history — FK verified), pain points (`text[]`), current solutions (`text[]`), product tags (upsert), per-company tasks, notes | HT4 / HT8 | ✅ |
| **Contacts** | global list, verified-first, search, add/edit, mark-contacted (`last_contact`), `mailto:` draft, promote-from-research; validators run on changed fields only | HT5 | ✅ |
| **Competition** | 10 competitors, modality/threat filters, add competitor, **name/hq/website edit (E-1)**, campaign add/delete (all fields incl. verdict), competitor notes; `source_url`/`website` normalised | HT6 | ✅ |
| **Research** | manual add (email/url validated), **extension JSON import** (`{type,version,clips}`, titleless skipped), link-to-account, promote-contact, delete, recent-200 + "Load older clips" | HT7 | ✅ |
| **Plan** | grouped tasks (overdue/week/later/done), toggle from Plan + drawer, delete, add general (`company_id NULL`) or per-company; deleting a company cascades its tasks, general tasks survive | HT8 | ✅ |
| **Products & Offers** | 6 products, **name/tag edit (E-1)**, kind/status/blurb, highlights (`text[]`), tag/untag both directions, **re-tag updates rationale, no dup (E-2)**, delete untags all (`company_products` cascade) | HT9 | ✅ |
| **Reports** | account + section picker, **sandboxed** live preview (`srcdoc` + bare `sandbox`), branded `.html` with CSP `<meta>`, `.md` — all from `DATA`; download via `Blob` + `<a download>` (no `claude.use`) | HT10 | ✅ (Word open = manual, §4) |
| **Events** | 6 events, details edit, benefits (`text[]`), attendees, notes, `.html` / `.md` brief | HT4 reads · HT10 exports | ⚠️ **reads + exports only** — the drawer's detail/benefit/attendee/notes edits and "New event" still write through the no-op `persist()` (no `src/api/events.js` was ever built; no HT owned it). Edits are session-only. Tracked in `REVIEW-NOTES.md` §A1. |
| **Settings** | team list = `profiles` + own name/department edit (E-3), **invite create / list / revoke**, connectors CRUD (URL-normalised), activity log last-100 + "Load older" + "Clear log" | HT2 / HT11 | ✅ |
| **JSON export** | sidebar "Export data (.json)" → valid `DATA`-shaped JSON via `Blob` | HT10 | ✅ |
| **News manage modal** | add (writes `kind: null` for "General"), delete → `dismissed_at` (team-wide soft delete), live tag, "last refreshed" badge (hidden when null) | HT4 | ✅ |
| **Auth** | invite-link signup (email prefill+lock when pinned), email confirm, sign in, forgot password → set new password, profile-less "ask for a new link" screen, sign-out clears `DATA` | HT2 · `test:invite` | ✅ |
| **Activity log** | every prototype-logged action → an `activity_log` row attributed to `auth.uid()` / `full_name`; "Signed in" only on explicit password submit (a reload adds no row) | HT11 | ✅ |

One gap found in this pass: **Events editing is not persisted** (reads and the
`.html`/`.md` brief work; drawer edits and "New event" run through the no-op
`persist()` — no `src/api/events.js` exists). See `REVIEW-NOTES.md` §A1. Every
other prototype feature persists to Supabase. Deviations are the D-list in PRD
§15 (all intentional — e.g. the passcode gate → real auth, "Import data
(replace)" → deferred upsert-merge, `claude.use('downloads')` → `Blob`).

---

## 4. Manual QA — operator runs these

These need a real human, a real browser profile, or the production deployment;
they are not automatable in this environment.

1. **Exported report opens in Word.** Export any company report as `.html`,
   open it in desktop Microsoft Word. Expect: letterhead, logo (inlined
   data-URI), and section styling intact; the CSP `<meta>` is ignored by Word;
   no script prompt. (The template is byte-unchanged from the prototype except
   the added `<meta>` — HT10.)
2. **Load-unpacked extension in real Chrome.** `npm run ext:build`, then
   `chrome://extensions` → Developer mode → Load unpacked → `chrome-extension/dist`.
   Sign in on the Account tab, capture a page, confirm it appears in the app's
   Research view after a Refresh; go offline, capture, confirm it queues and
   then syncs via "Sync now".
3. **Deploy checks on the live URL (HT15).** `curl -I http://<host>` → 301 to
   HTTPS; `curl -I https://<host>` shows every `_headers` entry; DevTools shows
   an injected inline `<script>` refused by CSP; the page won't load in an
   `<iframe>` on another origin.
4. **Real external email (HT15).** With Resend SMTP configured on the prod
   project: invite → sign up with a real address → confirmation email arrives →
   confirm → sign in. (Local uses Mailpit; deliverability to real inboxes can
   only be checked on prod.)
5. **Second device (HT15).** Sign in on a second device with a different
   account, add a company, Refresh on the first device → it appears
   (refetch-on-navigate, no realtime — PRD §9).

---

## 5. Known limitations (carried from PRD §16, by design)

- **Last-write-wins**, no merge UI. Concurrent edits to the same row: the later
  save wins; the other person sees current values next time they open that
  drawer. Near-impossible at this usage.
- **No live updates across screens.** You see everyone's latest saved data when
  you open/refetch a view or hit the header Refresh — not while watching.
- **Bounded client loads:** `research_clips` newest 200 + "load more";
  `activity_log` newest 100 + "load more"; `company_stage_changes` never
  bulk-loaded.
- **Weekly backup granularity** (HT15's `backup.yml`) — the free Supabase tier
  has no managed backups; a weekly `pg_dump` to R2 is the floor. Pro ($25/mo)
  buys daily PITR with a one-line change.
- **Offboarding is manual** — an admin deletes the `auth.users` row in the
  Supabase dashboard (cascades `profiles`; `activity_log.actor_name` snapshots
  survive). Self-serve deactivation is V2.
- **Activity log is delete-able** ("Clear log" preserved; no role model to
  restrict it). Insert-immutable, attribution forced to the actor. Not
  tamper-evident — accepted (D-2).
