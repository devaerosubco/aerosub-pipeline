# Aerosub Pipeline — V2 (Store, Create, RFQ Manager, visibility, Reports, alerts, RSS)

Status: draft for build, Phase 0 shipped · Date: 2026-09-17 · Owner: engineering
Companion doc: [TASKS-v2.md](TASKS-v2.md). Builds on the V1 rebuild ([PRD.md](PRD.md) / [TASKS.md](TASKS.md), HT0-16 done, HT15 deployment outstanding).

> **Scope note.** This is 8 user-requested feature areas, comparable in size to the
> whole V1 rebuild. It's phased the same way V1 was — a written plan, executed
> Heavy-Task by Heavy-Task across sessions, not one blind patch. Phase 0 (this
> document's §1-§4) shipped in the session that wrote this file. Phases 1-7 are
> specified below at the level of detail V1's PRD used, but not yet built —
> `TASKS-v2.md` tracks exactly what's done vs. queued.

---

## 0. Decisions carried from the kickoff conversation

- **Sequencing**: dependency order, all 8 items, phased, built across sessions
  (not a subset chosen up front).
- **Roles**: a real `profiles.role` column (`member` | `admin`), not a single
  RFQ-only boolean. This is a conscious reversal of V1's PRD §3 "no RBAC" call
  (D-3/S-8 there) — see §1 below for exactly how narrow the reversal is kept.
- **Sharing** (item 5): members-only for now. The no-login external share link
  implied by "share... to non-users" is explicitly deferred — it would be the
  app's first unauthenticated read surface (everything today is auth-only,
  deny-by-default) and deserves its own addendum, not a rider on Phase 2.
- **Quote templates** (item 3): users upload their own template file and the
  app maps product/service line items into it, rather than a few fixed
  built-in templates.

---

## 1. Phase 0 — Foundation (shipped)

**Why first:** every other phase depends on at least one piece of this —
Store's catalog needs the category taxonomies; RFQ Manager needs the role
system; the company sector field is standalone and cheap, done alongside since
it touches the same "add a company" surface.

### 1.1 Roles

`profiles.role text not null default 'member' check (role in ('member','admin'))`.
`is_admin()` mirrors `is_member()` exactly (`security definer`, `search_path=''`,
owned by the migration's `BYPASSRLS` role). An additive "admins update any
profile" policy lets an admin change another member's role (Postgres ORs
multiple permissive policies, so the existing own-row-only member policy is
unchanged). The `profiles` column-lock trigger (V1 §7.3) is extended: a `role`
change is rejected unless the actor is already an admin, or the caller is
`postgres`/`supabase_admin`/`service_role` (SQL-editor bootstrap, migrations,
ops scripts — mirrors the existing `lock_invite_consumption` escape hatch).

**Bootstrap**: no code path creates the first admin. One manual statement,
once, mirroring V1's first-member bootstrap (PRD §5.3):

```sql
update public.profiles set role = 'admin' where email = '<founder-email>';
```

**Deliberately narrow scope for this phase**: `role` only gates category
management (below). It does **not** yet gate RFQ actions (Phase 4), bulk
catalog actions (Phase 1/2), or anything else — those phases each decide their
own `is_admin()` call sites when they're built, rather than this phase
pre-guessing them.

### 1.2 Company sector (item 2)

`companies.sector text check (sector is null or char_length(sector) <= 200)` —
a plain field, not a controlled taxonomy. Client-side `SECTOR_OPTIONS`
(`src/main.js`) drives a `<datalist>` on the input in both the "Add company"
modal and the company drawer's Profile section (same E-1 identity-edit pattern
as name/type/summary); free text is still accepted.

### 1.3 Product & service category taxonomies

Two small tables, identical shape: `product_categories`, `service_categories`
(`id text PK`, `name text not null unique`, timestamps, `set_updated_at`
trigger). RLS: **read = any member, write = admin only** — this is the "must
be within what we offer at aerosub.co" constraint from item 1; an admin curates
the list, everyone else picks from it. Seeded from aerosub.co's actual service
lines (Drone Topside Inspection, Crawler UT & Manual NDT, ROV Subsea & Hull
Inspection, Engineering-Grade Analysis, Inspection Project Management) and the
existing seeded `products` lines (Drone/UAV, ROV, Crawler, Cleaning,
Inspection Platforms, Surveillance) — both lists end in a catch-all `Other`.
Managed in Settings (add / rename / remove), admin-only UI, RLS-enforced
regardless of what the client hides. These are the FK target for Phase 1's
catalog `category_id` columns.

### 1.4 What Phase 0 touched

Migrations `20260917120001_roles.sql`, `20260917120002_company_sector.sql`,
`20260917120003_catalog_categories.sql`. `src/store.js` (`companyFromRow`/
`companyToRow` gain `sector`; new `categoryFromRow`; `loadAll()` loads both
category tables into `DATA.settings.productCategories`/`serviceCategories`,
same pattern as `connectors`). `src/auth.js` (`myProfile`/`listProfiles` select
`role`). New `src/api/profiles.js` (`setRole`) and `src/api/categories.js`
(`create`/`rename`/`remove`, admin-only server-side). `src/main.js`: company
drawer + Add-company modal gain a sector field; Settings gains a "Product &
service categories" panel and a per-row role toggle on the Team table.
`scripts/db-check.mjs` / `scripts/rls-test.mjs` extended (20 tables, 75
policies, new seed counts, an admin-vs-member RLS block). `src/store.test.js`
gained category + sector round-trip tests.

---

## 2. Phase 1 — STORE tab: product/service catalog + bulk & single upload (HT-B, shipped)

Restructured the existing "Products & Offers" tab into a `STORE` label with
Product / Service sub-tabs *inside the same `ui.view==='solutions'` view* —
deliberately kept the internal view id, `data-open-product`, `solutionById`,
`DATA.solutions`, news/report references to products, etc. **unchanged**,
since renaming them across dozens of call sites would have been pure churn
for zero user-facing benefit and meaningful regression risk to already-tested
code. Modeled the Products/Services toggle on the Companies board/table
`.seg` pattern (`ui.storeTab`, mirroring `ui.companyLayout`).

- Extended `products`: `category_id` (FK `product_categories`, **not null**
  — backfilled for the 6 pre-existing seeded rows since the category ids were
  deliberately chosen to match them 1:1 in Phase 0), `vendor_name`,
  `datasheet_path`, `image_paths text[]`, `price_amount`, `price_currency`
  (NGN/USD, manual entry — no live FX), `oem`, `archived_at`, `search_count`,
  `added_to_quote_count` (the last two are columns only — HT-C's dashboard is
  what actually increments/reads them; an atomic increment needs an RPC, not
  a client read-then-write, so nothing here half-implements one). `status`
  CHECK widened to add `'Pending Review'`.
- New `services` table, same shape minus vendor/datasheet/oem (services
  aren't OEM parts), plus `company_services` mirroring `company_products`
  (PRD §6.8) — and a "Services tagged to this account" section in the company
  drawer mirroring the existing products one, for symmetry.
- **Storage refinement vs. the original wording above**: the DB stores the
  object **path**, not a URL (`datasheet_path`, `image_paths`), because the
  bucket is private and a stored URL would go stale the moment a signed URL
  expired. `src/storage.js` signs a fresh URL on demand when something is
  opened. This keeps the members-only decision from §0 intact — a public
  bucket would have quietly reintroduced the no-login access that was
  explicitly deferred.
- **Bulk upload is CSV-only, not CSV/XLSX** — a deviation from this section's
  original wording. The npm `xlsx` (SheetJS) package has two unpatched
  high-severity advisories (prototype pollution + ReDoS, "no fix available"),
  which matter specifically here because this parses untrusted, user-uploaded
  files. The maintained alternative, `exceljs`, pulls in ~100 Node-oriented
  packages (archiver, tmp, unzipper…) for what a small browser app doesn't
  need. Went with a small hand-rolled CSV parser (`src/csv.js`, unit-tested)
  instead — zero new attack surface, zero bundle weight. The bulk-upload
  modal tells users to Save As / Export as CSV from Excel or Sheets first.
  Expected header row: `name, category, blurb, price, currency` (+ `vendor,
  oem` for products). `category` is matched case-insensitively against the
  Phase-0 taxonomy; an unresolved category flags that row rather than
  guessing. Every imported row lands `status = 'Pending Review'` — "status can
  be updated later" (item 1a) — via `write(table, 'insert', {row: rows},
  {many: true})`, the same bulk-insert op the extension's `researchApi.
  importClips` already uses.
- **Single upload**: the product drawer's datasheet field only shows when
  `oem = true` (not services, not non-OEM products).

## 3. Phase 2 — Store dashboard, card/list, bulk actions, member sharing (HT-C, shipped)

- **Dashboard**: a third `storeTab` value (`'dashboard'`, now the default
  when Store is opened) alongside `'products'`/`'services'` — same `.seg`
  mechanic as HT-B, just a third button. Four tiles (recently added / most
  searched / most added-to-quote / totals), computed client-side from
  `DATA.solutions` + `DATA.services` (already fully loaded, no new query).
  "Most searched" increments `search_count` when an item is opened while a
  search query is active (`openWithSearchTracking`); "most added to quote"
  increments `added_to_quote_count` via the bulk toolbar's "Add to quote"
  action below — there's no real Quote object yet (that's HT-D), this just
  wires up the counter HT-B's schema was built for. Both are a plain client
  read-then-write, not an RPC — matches this app's existing last-write-wins
  stance (V1 PRD §16 S-5); losing an increment on a dashboard vanity counter
  is inconsequential.
- **Card/list toggle**: `ui.storeLayout`, the Companies `.seg` pattern reused
  verbatim. List rows expand in place for "more info" (blurb, highlights,
  tagged accounts) via a per-row toggle, not a drawer open.
- **Pagination**: `ui.storeVisibleCount` (50, "Show more" in steps of 50) —
  the practical reading of "5 columns by 10 rows"; column count stays
  responsive (`auto-fill, minmax(280px,1fr)`, unchanged from HT-B) rather
  than hardcoded, which would break the existing responsive layout.
- **Bulk select + floating toolbar**: checkboxes on cards/list rows
  (`stopPropagation`'d so they don't also open the drawer), a toolbar
  (Archive / Unarchive / Export CSV / Add to quote / Delete) once ≥1 item is
  selected. Bulk actions loop the existing single-item API calls — no new
  bulk SQL endpoints; the realistic selection size for an internal tool
  doesn't need one. Delete also cleans up `company_products`/
  `company_services` tags. Export reuses the bulk-upload CSV column
  convention for round-trip symmetry with the importer.
- **Price editing**: already covered by HT-B's drawer fields (amount +
  currency, freely editable; clearing the amount and saving = "delete the
  price") — no additional UI needed here.
- **Members-only share**: `store_item_shares` (item_type, item_id, shared_by,
  shared_with, note) — RLS restricts *reading a share row* to its two
  parties (the one per-row-visibility carve-out in the whole Store schema;
  everything else stays flat), since every member can already read every
  catalog item regardless of sharing — a share is a pointer + a "Shared with
  me" filter, not a new access grant. "Copy link" builds
  `?store=product:<id>` / `?store=service:<id>`; opening it lands a
  **signed-in member** straight on that item (the auth gate still applies —
  a deep link, not the no-login access deferred in §0). No public/token link.

## 4. Phase 3 — CREATE tab: Quotes/Proforma/Commercials, uploaded templates (HT-D, shipped — .html only)

- `quote_templates` (an uploaded `.html` file in `store-attachments` under a
  `quote-templates/` prefix — reused the existing HT-B bucket + policies
  rather than standing up a second one for a different content type — plus
  a `field_map` jsonb the uploader defines at upload time), `quotes`,
  `quote_line_items` (sourced from `products`/`services`, qty × unit cost ×
  a markup multiplier defaulting to ×1.3 — the convention already used in
  the team's manual RFQ workbook — adjustable per line; `unit_cost`/
  `description` are **snapshotted at add-time**, not live references, so a
  quote survives the source catalog item later being edited or deleted).
- **Field mapping, not fixed tokens**: `src/quoteFields.js` (`detectTokens`)
  scans an uploaded file for `{{token}}` placeholders; the upload/manage-
  template modals then show one dropdown per detected token, mapping it to
  one of a fixed, closed set of fields (`QUOTE_FIELDS` — client name, quote
  number, date, the auto-generated line-items table, subtotal, total, notes,
  prepared-by). An unmapped token is left as literal text rather than
  erroring, so an unfinished mapping still previews as valid HTML.
- `.html` templates: token-replace (`renderTemplate`), conceptually the same
  pattern as `buildReportHtml` but data-driven by `field_map` instead of a
  fixed template string. **`.docx` support was not attempted, not deferred
  half-way** — per this section's own acceptance criteria ("if it doesn't
  land cleanly, defer with a written reason"): given the amount already
  built in this one pass, taking on `docxtemplater`/`pizzip` plus Word's
  well-known XML run-splitting of `{{tokens}}` across multiple `<w:r>` runs
  was a real scope-creep risk to ship carelessly. `.html`-only for V1; a
  clean fast-follow, not a hole in this phase.
- The Create tab's quote drawer reuses the Reports view's sandboxed
  `srcdoc` iframe pattern for live preview, and the existing `downloadFile`
  Blob helper for `.html`/`.md` export (`buildQuoteMarkdown` is a
  template-independent plain-text fallback, same relationship
  `buildReportMarkdown` has to `buildReportHtml`).
- Verified with a real-browser Playwright pass (upload → token-detect → map
  → save → create a quote against a real seeded company → search-add a
  line item → preview shows the substituted client name and a *computed*
  total, not the literal `{{total}}` → export triggers a download), plus
  `db:check`/`test:rls` against the live local database — see TASKS-v2.md.

## 5. Phase 4 — RFQ Manager tab (HT-E, shipped)

- `rfqs` (status: draft → published → in_progress → bidding → won/lost;
  `assigned_to` a profile id, **admin-settable only** — the first real use of
  `is_admin()` beyond categories; `parent_rfq_id` self-FK for "branch, or
  start from base"). `rfq_items` (vendor_name, `vendor_verified` boolean —
  shown as an in-app badge, **deliberately excluded from the exported quote**).
  RFQ Gallery (list + Branch + Continue).
- **Enforcement, not just UI hiding**: `status`/`assigned_to` are locked by a
  `lock_rfq_admin_fields()` trigger — the exact same pattern as HT-A's
  `role` column-lock — covering both INSERT (a member can't sidestep the
  lock by creating a row with `status='published'` directly) and UPDATE.
  The drawer additionally hides the status/assignee controls from non-admins
  client-side, but that's UX only; the trigger is what a real-browser and
  RLS test both confirmed is the actual gate.
- An RFQ-quote/commercial is a `quotes` row with `source_rfq_id` set — reuses
  Phase 3's export engine rather than duplicating it. Downloadable regardless
  of how many items have been added (an RFQ with zero items just exports an
  empty line-items table). Exporting copies each `rfq_item` into a
  `quote_line_item`, **dropping `vendor_name`/`vendor_verified` in the
  copy** — confirmed by a real-browser pass that the vendor name genuinely
  never appears in the rendered export, not just "not displayed by
  convention."
- Publish / assign / status-change gated by `is_admin()`.
- `searchCatalogItems()` (product+service search) was extracted out of the
  quote drawer into a shared helper — this is its 3rd use (Store bulk
  actions used the underlying filter inline, the quote drawer had its own
  copy, RFQ items would have been a 3rd copy).
- **Bug found and fixed via the real-browser pass, not caught by RLS/schema
  testing**: `loadCreateData()`/`loadRfqData()`'s async-load completion
  handler called `renderView()` instead of `renderApp()` when already on the
  relevant tab — but the "New quote"/"Upload template"/"New RFQ" buttons
  they gate live in the outer header (`renderApp()`'s template), not in the
  tab's own content. The buttons silently never appeared. HT-D's own smoke
  test didn't catch this because clicking its Templates/Quotes sub-tab
  toggle happens to trigger a full `renderApp()` anyway, masking it; RFQ
  Manager has no sub-tab toggle, so it surfaced immediately. This is exactly
  the class of bug DB-level verification (db:check/rls-test) structurally
  cannot catch — another point for keeping the real-browser pass mandatory,
  not optional, per phase.

## 6. Phase 5 — Personal vs. general Tasks & Companies (queued, highest-risk)

No owner/visibility concept exists anywhere in this app today — every company
and task is visible to every member (flat model; asserted directly by
`rls-test.mjs`'s "member can update any company (flat model, no per-row
owner)"). This phase is a genuine, net-new RLS design, not an extension of an
existing pattern, and a real behavior change to "every member sees every
company" — confirm with the user again before starting.

- `tasks` gains `owner_id`, `assigned_to`, `visibility ('personal'|'general')`.
  `companies` gains the same three columns. SELECT policy: `visibility=
  'general' OR owner_id=auth.uid() OR assigned_to=auth.uid()` (an assigned
  personal task/company is visible to its assignee even though it's
  "personal" — matches "task assigned to you will appear in both personal and
  general"). "Share to general" = a one-way, owner-only UPDATE flipping
  `visibility`.
- Pulls `tasks`/`companies` out of the standard flat RLS loop
  (`20260904120010_rls.sql`) into bespoke policies, same style as the existing
  hand-written `profiles`/`activity_log` policies.

## 7. Phase 6 — Analytics tab (queued)

Read-only aggregations over existing + Phase-4/5 tables: research count by
contributor, RFQ counts by status, task counts by sector/user. No new tables.
**Naming**: the existing "Reports" tab (account-report export, `src/main.js`
`renderReports`) already owns that label — this phase needs a distinct one
(proposed: "Analytics") to avoid colliding with it; confirm with the user when
this phase starts.

## 8. Phase 7 — Alerts + RSS feed connector (queued)

- **Alerts**, scoped to the existing `events` table per item 7's wording.
  Given this project's deliberate no-backend/no-Edge-Function stance (V1 PRD
  §16 S-3 etc.), default to a client-side on-load check ("events starting
  within N days" + an in-app bell, per-user opt-in in Settings) — zero new
  infra. A true scheduled push notification would need this project's first
  Edge Function; note as a fast-follow, don't build by default.
- **RSS** is exactly V1's already-documented V2 hook (`ROADMAP.md` "Live news /
  competitor feeds": `news_items.live`, an Edge Function on `pg_cron`).
  Browser-side RSS fetch doesn't work here — CORS, the same reason the V1
  README gives for the news feed being curated-only. Scope: an admin-managed
  `rss_sources` settings module (URL + category, same shape as the existing
  `connectors` table) + **one** Edge Function on `pg_cron` polling sources and
  upserting into `news_items`. This is the one place true backend compute is
  unavoidable — a deliberate, small, explicit exception to "no backend
  server," not an accidental one.

---

## 9. Deviations from V1 (D-list, V2)

- **D2-1** — `profiles.role` reintroduced (V1 D-3 removed `permission`
  entirely). Deliberately narrow: gates categories only, for now; each later
  phase decides its own `is_admin()` call sites rather than this phase
  pre-declaring all of them.
- **D2-2** — Company `sector` is a free-text + suggested-list field, not a
  controlled taxonomy, unlike product/service categories — different
  constraint in item 1 ("must be within what we offer") vs. item 2 ("let users
  specify") justifies the different design.
- **D2-3** — Public/no-login sharing (implied by item 5) deferred out of
  Phase 2 entirely; only members-only sharing ships there.
- **D2-4** — Phase 5 (personal/general) reverses V1's flat "every member, any
  row" model for `tasks`/`companies` specifically — the biggest single
  behavior change in this whole V2 effort. Every other table stays flat.
