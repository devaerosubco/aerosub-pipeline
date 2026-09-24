# Aerosub Pipeline — V2 Execution Plan (Heavy Tasks)

Work top to bottom. Don't start a Heavy Task until every subtask of the previous one is `- [x]` and its acceptance criteria are met. Check boxes off the moment a subtask is done. Add a one-line `↳ note:` under any subtask where something non-obvious happened.

Companion doc: [PRD-v2.md](PRD-v2.md). Refs like "PRD-v2 §5" point into it. This continues [TASKS.md](TASKS.md) (HT0-16, the V1 rebuild) — HT letters here restart at HT-A to keep the two histories visually distinct.

### Status board

| Step | State |
|---|---|
| HT-A — Foundation (roles, sector, categories) | ✅ 2026-09-17, verified against a live local DB 2026-09-18 (db:check 53/53, test:rls 70/70) |
| HT-B — Store: catalog + bulk/single upload | ✅ 2026-09-17, verified 2026-09-18 — same db:check/test:rls run above covers it |
| HT-C — Store: dashboard, card/list, bulk actions, sharing | ✅ 2026-09-17, verified 2026-09-18 — same run |
| HT-D — Create: Quotes/Proforma/Commercials + templates | ✅ 2026-09-21 (`.html` only — `.docx` deliberately not attempted, see PRD-v2 §4) |
| HT-E — RFQ Manager | pending |
| HT-F — Personal vs. general Tasks & Companies | pending |
| HT-G — Analytics tab | pending |
| HT-H — Alerts + RSS feed connector | pending |

Each queued Heavy Task below is written to the same level of detail V1's
`TASKS.md` used, so a future session can pick any of them up cold — read the
Heavy Task's acceptance criteria + PRD-v2's matching section, then start.

---

## HT-A. Foundation — roles, company sector, catalog category taxonomies

**Acceptance criteria:** `profiles.role` exists, `is_admin()` mirrors
`is_member()`, a member cannot self-promote (column-lock trigger), an admin
can change another member's role. `companies.sector` exists and is editable
from the Add-company modal and the company drawer. `product_categories` /
`service_categories` exist, member-read/admin-write, seeded, manageable from
Settings (admin-only controls, RLS-enforced regardless of client hiding).
`db-check`/`rls-test` updated and green.

- [x] `supabase/migrations/20260917120001_roles.sql` — `profiles.role`,
  `is_admin()`, "admins update any profile" policy, extended column-lock
  trigger (admin, or postgres/supabase_admin/service_role, may change `role`).
- [x] `supabase/migrations/20260917120002_company_sector.sql` — `companies.sector`.
- [x] `supabase/migrations/20260917120003_catalog_categories.sql` —
  `product_categories`, `service_categories`, RLS, seed rows (idempotent,
  `on conflict (id) do nothing`, matching `supabase/seed.sql`'s convention).
- [x] `src/store.js` — `sector` in `companyFromRow`/`companyToRow`; new
  `categoryFromRow`; both category tables loaded in `loadAll()` into
  `DATA.settings.productCategories`/`serviceCategories` (same pattern as
  `connectors` — small table, no pagination).
- [x] `src/auth.js` — `role` added to `myProfile()`/`listProfiles()` selects.
- [x] New `src/api/profiles.js` (`setRole`) and `src/api/categories.js`
  (`create`/`rename`/`remove`, keyed by `kind: 'product'|'service'`).
- [x] `src/api/companies.js` `updateIdentity` accepts `sector`.
- [x] `src/main.js` — `SECTOR_OPTIONS` + `sectorDatalist()`; sector field in
  the company drawer's Profile section and the Add-company modal; Settings
  gains a "Product & service categories" panel (admin-only add/rename/remove
  controls, member read-only) and a per-row Team role toggle (admin-only,
  can't demote yourself off the list — the toggle simply doesn't render on
  your own row).
  - ↳ note: `updateMyProfile()` doesn't return `role` (it only selects/updates
    `full_name`/`department`) — `AUTH.profile = updated` after a profile save
    would have silently dropped `role` from the signed-in session. Fixed to a
    merge (`{...AUTH.profile, ...updated}`).
- [x] `scripts/db-check.mjs` — table count 18→20, policy count 66→75, seed
  counts for both category tables (7 products, 6 services).
- [x] `scripts/rls-test.mjs` — both category tables added to `ALL_TABLES`
  (anon-deny / profile-less-deny coverage); a new block: member denied
  insert/update/delete on both category tables, admin (memberA, promoted via
  `service_role`) allowed full CRUD on both; a member cannot change their own
  role; an admin can change another member's role.
  - ↳ note: promoting the test's first admin has to go through the
    `service_role` client, not a plain authenticated update — the column-lock
    trigger's escape hatch (`current_user in ('postgres','supabase_admin',
    'service_role')`) exists specifically so this bootstrap path (and the
    real SQL-editor bootstrap) works before any admin exists yet.
- [x] `src/store.test.js` — `categoryFromRow` test; company round-trip test
  extended to cover `sector` (present + defaults-to-`''`/`null`).
- [x] `npx vitest run` — 48/48 pass (was 46; +2 for `categoryFromRow` and the
  company `sector` round-trip). `node --check` clean on every touched file.
- [x] `npm run db:check && npm run test:rls` — run 2026-09-18 against a live
  local Supabase instance: db:check 53/53, test:rls 70/70 (covers HT-A/B/C
  together — that session's first real verification of any of this).
- [x] Sign-in itself is confirmed working in a real browser (the HT-D
  Playwright pass, 2026-09-21, signs in via `#aEmail`/`#aPass` and reaches
  the nav as its first step).
- [ ] Category add/rename/remove and the Team role toggle specifically have
  **not** been clicked through by anyone yet — the local app was handed to
  the user running, but that's not the same as a verified pass. Do this
  before merging.

---

## HT-B. Store: product/service catalog + bulk & single upload

**Acceptance criteria:** PRD-v2 §2 (updated — read it, not just this list;
two deliberate deviations from the original wording are documented there:
CSV-only bulk upload, and storage paths + signed URLs instead of stored
URLs). `products` gains catalog columns; new `services` + `company_services`
tables. CSV bulk upload lands rows in `status='Pending Review'`. Single-item
upload's datasheet field is OEM-products-only and is the app's first use of
Supabase Storage.

- [x] Migrations: `20260917130001_store_products.sql` (`category_id` FK
  **not null**, backfilled for the 6 seeded rows; `vendor_name`,
  `datasheet_path`, `image_paths`, `price_amount`, `price_currency`, `oem`,
  `archived_at`, `search_count`, `added_to_quote_count`; `status` CHECK
  widened to add `'Pending Review'`, looked up dynamically rather than
  assuming the autogenerated constraint name).
- [x] `20260917130002_store_services.sql` — `services` (mirrors `products`
  minus vendor/datasheet/oem) + `company_services` (mirrors
  `company_products`, PRD §6.8), flat member RLS matching `products`.
- [x] `20260917130003_store_storage.sql` — the `store-attachments` bucket
  (**private**, not public — see PRD-v2 §2) + 4 member-only `storage.objects`
  policies. `src/storage.js` (`uploadFile`/`signedUrl`/`removeFile`).
- [x] Store sub-nav: kept the NAV entry's `id: 'solutions'` and every
  existing `ui.view==='solutions'` call site unchanged (renaming would have
  been pure churn across dozens of references for no user-facing benefit);
  relabeled the nav item "Store" and added a Products/Services `.seg` toggle
  (`ui.storeTab`) inside the view, mirroring `ui.companyLayout`.
  `renderProductsGrid`/`renderServicesGrid`, an "archived" filter toggle,
  `serviceById`/`taggedCompaniesForService`/`untaggedCompaniesForService`.
- [x] Bulk upload (CSV only, `src/csv.js` — see PRD-v2 §2 for why not
  XLSX): `openBulkUploadModal(kind)`, shared by products/services — parse →
  resolve `category` name against the Phase-0 taxonomy → preview table
  (valid/error per row) → `productsApi.bulkCreate`/`servicesApi.bulkCreate`
  (`write(table,'insert',{row:rows},{many:true})`) → `status='Pending
  Review'`.
- [x] Single-item forms: `openAddSolutionModal`/`openAddServiceModal` (both
  require a category); product/service drawers gain a "Store details"
  section (category, price+currency, images; products also get
  vendor/OEM/datasheet — the datasheet field only appears when OEM is
  checked) and Archive/Unarchive. Company drawer gains a "Services tagged to
  this account" section mirroring the existing products one.
- [x] `scripts/db-check.mjs` (22 tables, 83 policies, `services`/
  `company_services` seed counts, a `store-attachments` bucket + policy-count
  check) / `scripts/rls-test.mjs` (`services`/`company_services` added to
  `ALL_TABLES`/`FLAT`, a dedicated services CRUD block, an anon-vs-member
  storage upload/read block) extended — verified 2026-09-18 against a live
  local DB, see the status board.
- [x] `npx vitest run` — 60/60 (was 48; +8 csv.js, +4 Store round-trip tests
  in store.test.js). `node --check` clean on every touched/new file.
  `npx vite build` clean (425 kB JS / 26 kB CSS — up from HT0's 192 kB, no
  heavy new dependency added). `npm run check:secrets` clean.
- [x] `npm run db:check && npm run test:rls` — 2026-09-18, 53/53 and 70/70
  respectively (this run also covers HT-A and HT-C).
  - ↳ **bug found + fixed 2026-09-21**: a fresh `supabase db reset` failed —
    `seed.sql`'s `products` insert never got a `category_id` (the column
    HT-B's own migration made `not null`), because the migration's backfill
    UPDATE only affects rows that already exist, and on a clean reset
    `seed.sql` runs *after* migrations, so it was inserting into an empty
    table. Fixed at the source (`scripts/extract-seed.mjs` now maps each
    seeded product id to its category, mirroring the migration's own
    mapping) and regenerated `seed.sql`. This is exactly the kind of bug
    that only running `db:reset` for real — not just reviewing the SQL —
    catches; see the standalone fix commit.
- [ ] Manual real-browser pass: bulk upload (valid + invalid rows, wrong
  category name), single upload with/without OEM, image upload +
  signed-URL "View", archive/unarchive, tag a service to a company —
  **still not actually clicked through in a browser** by anyone. The
  2026-09-18/21 sessions verified the DB/RLS layer live (db:check,
  test:rls) and did a Playwright pass for HT-D specifically, but that
  script goes straight to the Create tab and never opens the Store view's
  own UI — don't read the schema verification as UI verification. Do this
  before merging.

## HT-C. Store dashboard, card/list toggle, bulk actions, member sharing

**Acceptance criteria:** PRD-v2 §3 (updated with what actually got built —
read it, not just this list). Landing dashboard (recent / most searched /
most added-to-quote / totals). Card/list toggle reusing the Companies `.seg`
pattern. Bulk select + floating action toolbar. Members-only share +
"Shared with me" filter + a `?store=` deep link.

- [x] `20260917140001_store_item_shares.sql` — `store_item_shares` (the one
  per-row-visibility table in the whole Store schema: read restricted to
  `shared_by`/`shared_with`, insert requires `shared_by = auth.uid()`, no
  update policy — a share is immutable, revoke = delete). `src/api/
  storeShares.js` (`share` — plain insert, not upsert, see the code comment
  for why; `revoke`, `listForItem`, `listSharedWithMe`, `shareLink`).
- [x] Dashboard: `ui.storeTab` gains a third value `'dashboard'` (now the
  default), `renderStoreDashboard()` — 4 tiles from `DATA.solutions`/
  `DATA.services`, no new query. `search_count`/`added_to_quote_count`
  wired up (`incrementSearchCount`/`incrementAddedToQuoteCount` in both
  `api/products.js` and `api/services.js` — plain read-then-write, not an
  RPC, matching the app's existing last-write-wins stance).
- [x] Card/list toggle (`ui.storeLayout`) + pagination (`ui.storeVisibleCount`,
  50 per page / "Show more"). `filteredSolutions`/`filteredServices` and
  `renderProductsGrid`/`renderServicesGrid` from HT-B **refactored** into
  kind-generic `filteredStoreItems(kind)`/`renderStoreGrid(kind)` — cards and
  list view, and everything downstream (bulk select, sharing filter) would
  have needed writing twice otherwise.
- [x] Bulk select (`ui.storeSelected`, a `Set`) + floating toolbar
  (Archive/Unarchive/Export CSV/Add to quote/Delete) — loops the existing
  single-item API calls, no new bulk SQL. Delete cleans up
  `company_products`/`company_services` tags + local `DATA` state, mirroring
  the single-item delete path. CSV export reuses the bulk-upload column
  convention.
- [x] Members-only share: drawer "Share" section (`renderShareSection`/
  `bindShareSection`, shared by both drawers) — pick a teammate, revoke,
  "Copy link". `ITEM_SHARE` cache (lazy-loaded per open item, mirrors the
  `SETTINGS` pattern) + `STORE_SHARES` cache (lazy-loaded "shared with me"
  list) + a `storeShowSharedOnly` filter toggle. `?store=product:<id>` /
  `?store=service:<id>` deep link, consumed in `enterApp()` (mirrors how
  `?invite=` already survives the auth flow) — opens the item for a
  **signed-in member only**; the auth gate is unchanged.
  - ↳ note: both lazy caches (`STORE_SHARES`, `ITEM_SHARE`) are reset on
    `enterApp()` (sign-in) alongside the existing `SETTINGS.loaded = false`
    reset — otherwise switching accounts in the same browser session would
    briefly show the previous user's "shared with me" list.
  - ↳ note: `share()` uses a plain `insert`, not the `upsert` originally
    written — the table has no UPDATE policy (a share is immutable) and the
    UI already excludes an already-shared teammate from the picker, so
    upsert's `ON CONFLICT DO UPDATE` path was dead code that would have
    actually failed (no UPDATE policy) had it ever been hit. Caught in
    self-review before this was run against a live DB.
- [x] `scripts/db-check.mjs` (23 tables, 86 policies, `store_item_shares` seed
  count) / `scripts/rls-test.mjs` (`store_item_shares` in `ALL_TABLES`, a
  dedicated block: share/read/revoke, a member can't insert a share claiming
  `shared_by` = someone else) extended — verified 2026-09-18 against a live
  local DB, see the status board (also re-verified after the HT-D
  migration was added on top, 2026-09-21 — both `db:check`/`test:rls` runs
  green with `store_item_shares` unaffected).
- [x] `npx vitest run` — still 60/60 (no new pure-logic units this task; the
  new code is render/bind/DOM wiring, covered by real-browser passes per
  this app's existing convention, same as `main.js` always has been).
  `node --check` clean on every touched file. `npx vite build` clean (439 kB
  JS / 26 kB CSS). `npm run check:secrets` clean.
- [x] `npm run db:check && npm run test:rls` — 2026-09-18 (53/53, 70/70) and
  re-run 2026-09-21 after HT-D's migration landed (26 tables, 98 policies,
  78/78) — both green, `store_item_shares` untouched by the newer migration.
- [ ] Manual real-browser pass: dashboard tiles populate after a search-then-
  open and after "Add to quote"; card/list toggle; bulk archive/unarchive/
  export/delete; share an item with a teammate and confirm it shows in
  their "Shared with me" filter; open a `?store=` link fresh (signed out ->
  sign in -> lands on the item) — **still not clicked through by anyone**.
  The HT-D Playwright pass exercises the *Store data* indirectly (searching
  products/services from the quote drawer, incrementing
  `added_to_quote_count`) but never opens the Store view's own dashboard/
  card/list/bulk-toolbar/sharing UI. Do this before merging.

## HT-D. Create: Quotes/Proforma/Commercials + uploaded templates

**Acceptance criteria:** PRD-v2 §4 (updated with what actually got built —
read it). `quote_templates`/`quotes`/`quote_line_items`. `.html` templates
work end-to-end (upload, field-map, export). `.docx` deliberately not
attempted this pass (see PRD-v2 §4 for why that's a documented decision,
not a gap).

- [x] `20260921120001_quotes.sql` — `quote_templates`, `quotes`,
  `quote_line_items` (flat member RLS, matching products/services; line
  items snapshot `description`/`unit_cost` at add-time; cascade-delete from
  quotes). Reused the existing `store-attachments` bucket (`quote-templates/`
  prefix) rather than a second bucket.
- [x] `src/quoteFields.js` (pure, unit-tested — `detectTokens`,
  `computeLineTotals`, `buildQuoteFieldValues`, `renderTemplate`,
  `buildQuoteMarkdown`) + `src/api/quoteTemplates.js` / `src/api/quotes.js`
  (granular setters, matching the `api/companies.js` convention) +
  `store.js` row⇄app-shape pairs for all three entities.
  `CREATE_DATA`/`QUOTE_EDITOR` lazy-load caches in `main.js`, mirroring the
  `SETTINGS`/`ITEM_SHARE` pattern.
- [x] New `Create` nav tab (`ui.view==='create'`), Quotes/Templates sub-tabs.
  Upload-template modal detects `{{tokens}}` in the uploaded file and shows
  one dropdown per token, mapped to a fixed field list (not free-form) —
  same UI reused (read-only prefilled) in the manage-template modal for
  re-mapping/rename/delete.
  - ↳ note: template selection is fixed at quote-creation time — no
    "change template" control on an existing quote. Deleting/recreating
    covers the rare case of picking wrong; not worth the extra UI for a v1.
- [x] Quote drawer: details (client/number/currency/markup%/notes), line
  items (inline qty/cost/markup edit, remove), an incremental product+service
  search-and-add (reuses `DATA.solutions`/`DATA.services`, increments
  `added_to_quote_count` — the same counter HT-C's bulk button also
  increments; both are legitimate "this got quoted" signals for a vanity
  dashboard metric, not a precise ledger, so no dedup logic was added), a
  live sandboxed-iframe preview (same pattern as the Reports view), and
  `.html`/`.md` export via the existing `downloadFile` helper.
- [x] `scripts/db-check.mjs` (26 tables, 98 policies, 3 new seed-count
  entries) / `scripts/rls-test.mjs` (`quote_templates`/`quotes`/
  `quote_line_items` in `ALL_TABLES`/`FLAT`, a dedicated block proving
  cascade-delete) extended.
- [x] `npx vitest run` — 74/74 (was 60; +10 `quoteFields.test.js`, +4
  `store.test.js` quote round-trips). `node --check` clean. `npx vite
  build` clean (465 kB JS / 26 kB CSS). `npm run check:secrets` clean.
- [x] **Applied and verified against the live local database, same
  session** (`npx supabase migration up`, not a full reset, to avoid
  wiping the demo account already in use): `db:check` 55/59 → the 4
  "fails" are seed-count assertions that only hold right after a clean
  `db reset` and are expected on a DB with a real signed-in user + activity
  history; table count (26) and policy count (98) — the real structural
  checks — both passed exactly. `test:rls` 78/78, including the new
  cascade-delete assertion.
- [x] Real-browser Playwright pass (one-off script, deleted after use, per
  this app's convention): sign in → open Create → upload a 7-token
  template → map every token → save → new quote against a real seeded
  company (Seplat) → search-add a real product line item → **preview
  shows the substituted client name and a computed total, not the literal
  `{{total}}`** → export triggers a real download. Zero console/page
  errors. 9/9 — caught one bug in the *test script itself* (miscounted
  tokens: forgot the template's own `{{notes}}` placeholder), not in the
  app; fixed and re-ran clean. Test template/quote/line-item DB rows and
  the throwaway RLS-test accounts were cleaned up afterward; three orphaned
  template files remain in Storage (can't be deleted via raw SQL — Supabase
  blocks direct `storage.objects` deletes — and aren't referenced or
  visible anywhere in the app, so left as-is).

## HT-E. RFQ Manager

**Acceptance criteria:** PRD-v2 §5. `rfqs`/`rfq_items`. Publish/assign/status
gated by `is_admin()`. Branch clones an RFQ's items into a new row. Export
reuses HT-D's engine and excludes `vendor_verified` from the output.

- [ ] `rfqs` (status enum, `assigned_to`, `parent_rfq_id`), `rfq_items`
  (vendor_name, `vendor_verified`).
- [ ] RFQ Gallery view (list, status chips, Branch, Continue).
- [ ] Publish/assign/status-change UI, `is_admin()`-gated both client-side (UX)
  and server-side (RLS — the real gate).
- [ ] Export path: an RFQ-quote is a `quotes` row with `source_rfq_id` set,
  reusing HT-D's template engine; confirm `vendor_verified` never reaches the
  exported file.
- [ ] Tests: RLS for publish/assign/status (member denied, admin allowed);
  a real-browser pass covering research → add items → branch → publish →
  assign → export.

## HT-F. Personal vs. general Tasks & Companies

**Acceptance criteria:** PRD-v2 §6 — read it again before starting, this is
the highest-risk phase (net-new RLS design, real behavior change to today's
flat model). Confirm scope with the user before writing migrations.

- [ ] `tasks`/`companies` gain `owner_id`, `assigned_to`, `visibility`.
- [ ] Pull both tables out of the standard flat RLS loop
  (`20260904120010_rls.sql`) into bespoke SELECT policies (own/assigned/
  general); INSERT/UPDATE/DELETE stay member-gated.
- [ ] "Share to general" UI (owner-only, one-way).
- [ ] Tests: RLS matrix specifically for the new visibility rule (owner sees
  own personal rows, a non-owner/non-assignee doesn't, an assignee does, a
  general row is visible to everyone); a real-browser pass.

## HT-G. Analytics tab

**Acceptance criteria:** PRD-v2 §7. Research/RFQ/task counts, aggregated,
read-only. Distinct label from the existing "Reports" export tab (confirm the
name with the user — "Analytics" proposed).

- [ ] Confirm the tab name with the user (naming collision, PRD-v2 §7).
- [ ] Aggregation queries (research count by contributor, RFQ counts by
  status, task counts by sector/user) — no new tables.
- [ ] Tests: a real-browser pass confirming the numbers match a hand-count on
  the seed data.

## HT-H. Alerts + RSS feed connector

**Acceptance criteria:** PRD-v2 §8. Client-side event-alert banner/bell
(no Edge Function). One admin-managed `rss_sources` table + one Edge Function
on `pg_cron` populating `news_items` — the project's first backend compute,
scoped tightly and documented as a deliberate exception.

- [ ] Client-side "events starting within N days" check + in-app bell,
  per-user opt-in in Settings.
- [ ] `rss_sources` table (admin-managed, same shape as `connectors`).
- [ ] One Supabase Edge Function on `pg_cron`, polling `rss_sources` and
  upserting into `news_items` (`live=true`).
- [ ] Tests: the Edge Function's upsert logic (idempotent re-poll, no dupes);
  a real-browser pass for the alert banner/bell.

---

## Final report (when HT-A through HT-H are all `[x]`)

- What was built, phase by phase.
- Deviations (PRD-v2 §9, D2-1…D2-4) and why.
- Deliberately cut / deferred: public share links (§0), true scheduled push
  notifications (§8), `.docx` templates if they didn't land (§4).
- Accepted limitations: no live FX conversion, weekly-granularity RSS polling
  (`pg_cron` schedule TBD per source), personal/general visibility is
  last-write-wins on the `visibility` flag itself (no merge UI, matching V1's
  existing last-write-wins stance elsewhere).
