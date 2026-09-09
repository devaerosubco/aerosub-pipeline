# Aerosub Pipeline — Product Requirements (V1: MVP → Production)

Status: draft for build · Date: 2026-09-03 · Owner: engineering
Companion docs: [AUDIT.md](AUDIT.md), [TASKS.md](TASKS.md)

> **Scope note (2026-09-03):** the tool will be used **infrequently, by a small team, usually one person at a time**. This PRD is deliberately scoped to that. Things a high-traffic collaborative app would need — realtime push, optimistic UI, CRDT-ish conflict handling, normalised child tables for every list, a DB-trigger sanitisation layer, self-serve offboarding — are **cut or deferred** and called out in §15/§16 with the reasoning. What's kept is the irreducible core: real accounts, one shared database, RLS, and not losing the research data.

---

## 1. Goal

Replace the single-file `localStorage` prototype (`app/aerosub_crm.html`) with a **small, secure, multi-user web app** on Supabase: real per-person accounts, one shared Postgres database behind Row Level Security, every existing feature intact. No feature is lost; a few prototype limitations are fixed (§17).

The data in this tool (competitor profiles, named contacts, pain-point research) took real effort to compile and is effectively irreplaceable — **not losing it** is a first-class requirement, which is why backups (§13) get more attention than realtime.

---

## 2. In scope (V1)

- One Supabase project (prod) + local dev. Postgres schema, Auth, RLS. **No realtime** (§9).
- Real per-person accounts: name + email + password, email-confirmed, created only by redeeming an **invite link** (§5). No open signup, no domain restriction.
- Full migration of `seedData()` into Postgres as the baseline (and the *only*) dataset — OQ-4 resolved.
- Rebuild the data layer: every read/write goes through `@supabase/supabase-js` instead of `localStorage`. On opening a view, its data is refetched (§9).
- Activity log attributed to real users.
- Chrome extension rewired to write clips directly to Supabase (offline queue fallback).
- Security: RLS default-deny on every table + a test proving it; client validation + DB `CHECK` constraints; `esc()` on every render; a CSP `<meta>` in exported HTML; HTTPS + security headers.
- A minimal Vite build (inject the public config, bundle supabase-js, static deploy). One static site, no backend server.
- Weekly automated `pg_dump` backup + a keep-alive ping (§13).
- Small enhancements: editable company/competitor/product identity fields (E-1), no duplicate product tags (E-2).
- Keep the JSON export as a manual backup snapshot.

## 3. NOT in scope (V1)

- **RBAC.** Only boundary: "member (redeemed an invite, signed in)" vs. not. Every member can do everything, including issue/revoke invites and clear the log. `permission`/`PERMISSIONS` — removed, not ported.
- **Realtime / live updates across screens** (§9, §16 S-3) — refetch-on-navigate covers "see everyone's latest data" for a rarely-used tool; live-while-watching is not worth the complexity.
- **Optimistic UI** (§16 S-4) — writes `await` and then re-render. A 200 ms save is invisible here and the revert-on-failure logic disappears.
- Self-serve offboarding (§16 S-11) — deferred; removing a person = an admin deletes the `auth.users` row in the dashboard (rare event).
- DB-trigger input sanitisation (§16 S-7) — deferred; `esc()` on render + export CSP + `CHECK` constraints + client validation is the V1 XSS story for an all-trusted-users tool.
- Live news / competitor feed jobs, task reminders, email send/track, enrichment, PDF/DOCX, forecasting dashboard, full-text search — all V2 (§12).
- Native mobile / offline-first PWA for the app (the extension keeps a tiny offline queue only).

---

## 4. Architecture

```
┌────────────────────────┐   HTTPS    ┌──────────────────────────┐
│  Static web app          │  <────>   │  Supabase project (prod)  │
│  (minimal Vite build of  │  anon key │  ├─ Postgres  (data+RLS)   │
│   the vanilla-JS app)    │  + user   │  ├─ GoTrue    (Auth)       │
│  on Cloudflare Pages     │  session  │  └─ PostgREST (REST API)   │
└────────────────────────┘            └──────────────────────────┘
        ▲                                      ▲
        │ anon key + session                    │ dev = `supabase start` (local Docker)
┌───────┴────────────┐                          │   or a 2nd free project
│  Chrome extension    │                        └──  weekly pg_dump (GitHub Action) → R2
│  (sign in, add clips)│
└────────────────────┘
```

- **Frontend**: the existing vanilla-JS app in a minimal Vite project. Only the *data layer* is pulled into modules (`supabase.js`, `store.js`, `api.js`, `auth.js`, `validate.js`); the render/UI code stays roughly as-is. Rationale for the build step: inject `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` instead of hard-coding, bundle supabase-js locally (CSP-clean), one static deploy. Deviation D-1.
- **No backend server, no Edge Functions in V1.** PostgREST + RLS + three small Postgres functions (auth) cover everything.
- **Client data model**: on boot, load every table into an in-memory `DATA` object shaped like the prototype's. On navigating to a view, refetch that view's slice. After a write, update `DATA` and re-render. No push, no optimism.
- **Secrets**: only the anon/public key + URL reach the browser/extension. `service_role` is never in any client, build, or repo.

---

## 5. Auth & signup

### 5.1 Invite-link flow (name + email + password, email-confirmed)

*(Product-owner choice over domain restriction — OQ-2.)*

- **Membership = a `public.profiles` row**, created only by redeeming a valid invite during signup. No profile ⇒ `is_member()` false ⇒ RLS denies everything. Supabase's "Confirm email" setting means an **unconfirmed user cannot obtain a session** — so no session, no `auth.uid()`, no access; we don't need a separate confirmed-check in `is_member()`.
- **Any member creates an invite**: a row in `public.invites` with a 128-bit random single-use `token`, optional locked `email`, `expires_at` (default +7 days, `CHECK ≤ +30 days`). The member sends the link `https://<app>/?invite=<token>` however they like — **no system email for the invite itself**. (`?invite=` is a query param on purpose — the URL hash is reserved for Supabase's confirm/reset tokens.)
- **Redeem**: the invitee opens the link → signup form (full name + email + password; email prefilled + locked if the invite pins one) → `supabase.auth.signUp({ email, password, options: { data: { full_name, invite_token }, emailRedirectTo }})` → confirm email → signed in.
- **No open signup.** Without a valid token the `auth.users` insert is rejected. This also blocks the dashboard "Add user" button — out-of-band creation = "insert an `invites` row, use the link."

### 5.2 The pieces — one table, two functions

1. **`public.invites`** table (§6.2). `token text unique not null default encode(extensions.gen_random_bytes(16),'hex')`. `CHECK (expires_at <= created_at + interval '30 days')`.
2. **`public.handle_new_user()`** — `SECURITY DEFINER`, owner a `BYPASSRLS` role (§7.4), `AFTER INSERT ON auth.users`. One trigger does the whole gate (a BEFORE trigger that just rejects would give the same net result — the row is created then rolled back in the same transaction — for one more function; not worth it). Kept tiny (a bug here blocks all signup):
   - Read `v_token := new.raw_user_meta_data->>'invite_token'`.
   - `UPDATE public.invites SET consumed_at = now(), consumed_by = new.id WHERE token = v_token AND consumed_at IS NULL AND expires_at > now() AND (email IS NULL OR lower(email) = lower(new.email))` — if `NOT FOUND`, `RAISE EXCEPTION` (rolls back the whole signup transaction: no `auth.users` row, no email sent; atomic single-use, concurrent redemption → exactly one winner).
   - `INSERT INTO public.profiles (id, email, full_name) VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name')`.
   - **GoTrue does not pass a DB `RAISE` message through to the client** — signup failure surfaces as a generic "Database error saving new user". The signup form therefore shows one catch-all message: *"Sign-up failed — your invite link may be invalid, expired, or already used. Ask a teammate for a new one."*
3. **`public.is_member()`** (§7.1): `select exists (select 1 from public.profiles where id = auth.uid())`. Wrapped `(select public.is_member())` in every policy. Owned by a `BYPASSRLS` role so it doesn't recurse through the `profiles` SELECT policy (§7.4).

### 5.3 Bootstrap the first member

No special code. After the schema is applied: `insert into public.invites (email) values ('<founder>@aerosub.co') returning token;` in the SQL editor → open `?invite=<token>` → sign up. (Locally, read the confirm link from the catch-all mailbox at `localhost:54324`.) Documented in the README.

### 5.4 What replaces the prototype gate

`renderGate()` → a real auth screen: **Sign in** / **Forgot password**, a **Complete signup** state when `?invite=` is present, a **Set new password** state when the recovery link lands. Deleted: `accessCode`, `passcode`, `genPasscode()`, `teamHasIndividualLogins`, `isUnlocked`, `maybePromptForName`, `sessionStorage.aerosub_unlocked`, `localStorage.aerosub_current_user`, the Settings "Show passcodes / Set code / regen" UI. `currentUserName()` → `profiles.full_name`. A signed-in user with no profile sees "invite not valid — ask a teammate for a new link" + sign out.

### 5.5 Sessions

`supabase-js` defaults (PKCE, `persistSession`, `autoRefreshToken`, `detectSessionInUrl` on web / off in the extension). App state from `getSession()` + `onAuthStateChange` + a profile check. On `SIGNED_OUT` / refresh failure → clear `DATA`, show auth screen.

### 5.6 Email deliverability (OQ-3)

Prod uses **Resend** (free tier: 3k/mo — this system sends ~50 auth emails/year) as Supabase custom SMTP, from a verified subdomain `send.aerosub.co`. Supabase's built-in SMTP won't send to external addresses, so this is required before user #2. Locally, GoTrue delivers to the catch-all mailbox — the full flow is testable with no external service.

### 5.7 Offboarding (V1: manual)

Removing someone = an admin deletes their `auth.users` row in the Supabase dashboard (cascades `profiles`; `activity_log.actor_name` snapshots survive). This happens rarely; a self-serve "deactivate" button is V2 (§16 S-11).

---

## 6. Data model — 18 tables

Conventions:
- Schema `public`. Every **mutable** table: `id`, `created_at`, `updated_at` (a shared `set_updated_at()` `BEFORE UPDATE` trigger). The two **append-only** tables — `company_stage_changes` and `activity_log` — have `id` + `created_at` only (no `updated_at`, no update policy, no `set_updated_at` trigger).
- **PKs are `text`**, default `gen_random_uuid()::text`. Exceptions: `profiles.id` is `uuid` (= `auth.users.id`); `app_settings.id` is `int` (singleton). Seeded rows keep their slugs (`'amni'`, `'drone'`, `'cyberhawk'`).
- The client supplies `id` on insert (`crypto.randomUUID()`).
- Short scalar lists (`pain_points`, `current_solutions`, `highlights`, `benefits`) are **`text[]` columns**, read/written whole with their parent — see §16 S-7 (the concurrency argument for child tables doesn't hold when the tool is single-user most of the time). Things that are genuinely relational (`contacts`, `competitor_campaigns`, `event_attendees`, `company_products`, `company_flags`) keep their own tables — as the prototype already had them.
- FKs: `ON DELETE CASCADE` where the prototype cascades (company → contacts, flags, tasks, tags, stage history; product → tags; competitor → campaigns; event → attendees). `ON DELETE SET NULL` for `research_clips.company_id`, `event_attendees.company_id`.
- Enums + length caps are `CHECK`-enforced. **No** format `CHECK` on `email`/`url` (the seed has masked/non-standard values — AUDIT §5.8).

### 6.1 `profiles` (0..1 : 1 with `auth.users`)
`id uuid PK` (= `auth.users.id`, FK `on delete cascade`), `email text not null unique`, `full_name text` (from signup; editable on your own row — E-3), `department text` (editable on your own row), timestamps. `permission` not carried over.

### 6.2 `invites` (signup gate — §5)
`id text PK`, `token text unique not null default encode(extensions.gen_random_bytes(16),'hex')`, `email text` (nullable; case-insensitive match when set), `created_by uuid FK profiles on delete set null`, `expires_at timestamptz not null default now()+interval '7 days' check (expires_at <= created_at + interval '30 days')`, `consumed_at timestamptz`, `consumed_by uuid FK profiles on delete set null`, timestamps.

### 6.3 `companies`
`id text PK`, `name text not null` (editable — E-1), `type text` (editable), `priority text not null default 'medium' check in ('high','medium','low')`, `stage text not null default 'research' check in` the 8 stage ids, `summary text` (cap 4000, editable), `notes text` (cap 20000), `pain_points text[] not null default '{}'`, `current_solutions text[] not null default '{}'`, timestamps.

### 6.4 `company_flags`
`id text PK`, `company_id text not null FK companies on delete cascade`, `type text not null check in ('critical','info')`, `text text not null` (cap 500), `position int not null default 0`, timestamps.

### 6.5 `company_stage_changes` (pipeline history — OQ-5)  *(append-only — no `updated_at`)*
`id text PK`, `company_id text not null FK companies on delete cascade`, `from_stage text`, `to_stage text not null`, `changed_by uuid FK profiles on delete set null` (null for seed / SQL-editor edits), `created_at timestamptz not null default now()`. Written only by an `AFTER UPDATE` trigger on `companies` (`log_stage_change()`, fires when `stage` is distinct from old). Members `select` only. Never bulk-loaded client-side. ~15 lines total; feeds a possible V2 forecasting view. (Kept because the owner asked and the cost is trivial.)

### 6.6 `contacts`
`id text PK` (seeded contacts keep `<company>-c<i>`), `company_id text not null FK companies on delete cascade`, `name text not null`, `position text` (`pos` in the prototype — mapped in the store), `email text`, `phone text`, `linkedin text` (stored scheme-less), `verified boolean not null default false`, `last_contact date`, `next_follow_up date`, timestamps.

### 6.7 `products` (Aerosub's own catalog — prototype `solutions`)
`id text PK` (`drone,rov,crawler,cleaning,platform,surveillance` seeded), `name text not null` (editable — E-1), `tag text` (editable), `kind text not null default 'Product' check in ('Product','Offer')`, `status text not null default 'Active' check in ('Active','Pilot','Planned')`, `blurb text` (cap 4000), `highlights text[] not null default '{}'`, timestamps.

### 6.8 `company_products` (the "recommended / tagged" join, bidirectional)
`id text PK`, `company_id text not null FK companies on delete cascade`, `product_id text not null FK products on delete cascade`, `rationale text` (the `why`, cap 2000), timestamps, **`unique (company_id, product_id)`** — re-tag is `on conflict do update set rationale` (E-2).

### 6.9 `competitors`
`id text PK`, `name text not null` (editable — E-1), `hq text` (editable), `website text` (editable, normalised), `notes text` (cap 8000), `modality text not null check in ('Drone','ROV','Crawler','Multi-domain','Other')`, `threat text not null check in ('Direct','Adjacent','Watch')`, timestamps.

### 6.10 `competitor_campaigns`
`id text PK` (seeded `<competitor>-cp<i>`), `competitor_id text not null FK competitors on delete cascade`, `title text not null` (cap 500), `type text check in ('Past','Current','Future')`, `date date`, `source_url text` (normalised), `relevance text`, `summary/performance/gap/sweet_spot text` (cap 4000 each), `verdict text check in ('compete','complement','partner','avoid','watch') default 'watch'`, timestamps.

### 6.11 `tasks` (Plan)
`id text PK`, `title text not null` (cap 500), `company_id text NULL FK companies **on delete cascade**` (general tasks = `company_id IS NULL`; deleting a company deletes its tasks — AUDIT §5.12), `due date`, `priority text not null check in ('high','medium','low') default 'medium'`, `done boolean not null default false`, timestamps.

### 6.12 `research_clips`
`id text PK`, `title text not null` (cap 500), `url text` (normalised, nullable), `captured_at timestamptz not null default now()`, `summary/potential text` (cap 4000), `contact_name/contact_email/contact_phone/contact_linkedin text`, `company_id text NULL FK companies on delete set null`, `created_by uuid FK profiles on delete set null` (set by app + extension), timestamps. Loaded most-recent-200 + "load more" (the extension can make this grow — S-2).

### 6.13 `events`
`id text PK`, `name text not null`, `organizer text`, `location text`, `start_date date`, `end_date date`, `cost text` (free text), `currency text default 'USD'`, `website text` (normalised), `benefits text[] not null default '{}'`, `notes text` (cap 20000), timestamps.

### 6.14 `event_attendees`
`id text PK`, `event_id text not null FK events on delete cascade`, `name text not null`, `company_id text NULL FK companies on delete set null`, `status text`, `position int not null default 0`, timestamps.

### 6.15 `news_items`
`id text PK`, `title text not null` (cap 500), `source text`, `url text` (normalised), `date date not null` (**seed dates rebased** at generation — AUDIT §5.6), `kind text check (kind is null or kind in ('company','product'))` (prototype `''` → null), `ref_id text` (company/product id, no FK; render stays defensive), `live boolean not null default false`, `dismissed_at timestamptz` (soft-delete, replaces `dismissedNewsIds` — D-5), `dismissed_by uuid FK profiles on delete set null`, timestamps.

### 6.16 `connectors` (Settings reference list)
`id text PK`, `name text not null`, `type text`, `url text` (normalised), `notes text` (cap 2000), timestamps. 3 seeded.

### 6.17 `activity_log`  *(append-only — no `updated_at`)*
`id text PK`, `actor_id uuid FK profiles on delete set null`, `actor_name text` (denormalised snapshot), `action text not null` (cap 200), `detail text` (cap 500), `created_at timestamptz not null default now()`. Insert + select + delete ("Clear log", D-2) for members; **no update**. Client loads last 100 + "load more".

### 6.18 `app_settings` (singleton)
`id int PK default 1 check (id = 1)`, `last_news_refresh timestamptz`, timestamps. Seeded (one row) by its migration. `meta.createdAt` dropped (D-8).

### 6.19 Relationships & indexes
Cascades as listed above. Indexes: `company_flags(company_id)`, `contacts(company_id)`, `company_products(company_id)`, `company_products(product_id)`, `competitor_campaigns(competitor_id)`, `event_attendees(event_id)`, `tasks(company_id)`, `tasks(done, due)`, `news_items(dismissed_at)`, `research_clips(captured_at desc)`, `activity_log(created_at desc)`, `company_stage_changes(company_id, created_at desc)`, `invites(token)`, `invites(consumed_at)`.

### 6.20 Store shape mapping (DB ⇄ the prototype's in-memory `DATA`)

`store.js` builds `DATA` in the prototype's exact shape so the render code barely changes. The non-obvious mappings the builder must implement (both directions — read on load, translate back on write):

| DB | `DATA` |
|---|---|
| table `products` | `DATA.solutions` (prototype key) |
| `products.*` | unchanged fields |
| `contacts.position` | `contact.pos` |
| `company_products` rows for a company | `company.recommended = [{ sol: product_id, why: rationale }]` |
| `companies.pain_points` / `.current_solutions` (`text[]`) | `company.painPoints` / `.currentSolutions` (JS arrays — 1:1) |
| `products.highlights` / `events.benefits` (`text[]`) | `product.highlights` / `event.benefits` (1:1) |
| `company_flags` rows | `company.flags = [{ type, text }]` |
| `contacts` rows for a company | `company.contacts = [...]` |
| `competitor_campaigns` rows | `competitor.campaigns = [...]` |
| `event_attendees` rows | `event.attendees = [...]` |
| `research_clips.captured_at` etc. (snake) | `clip.capturedAt` etc. (camel) — a generic snake↔camel pass covers the rest |
| `news_items.kind = null` | rendered as "General / other" (prototype's `''`); the add-news form writes `null`, never `''` |
| `company_stage_changes` | **not loaded into `DATA`** (write-only history) |

A small `toRow()` / `fromRow()` pair per entity, unit-tested in HT4.

---

## 7. RLS

### 7.1 Foundation

```sql
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid()); $$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
```

- Every one of the 18 tables: `enable row level security` + `force row level security`.
- No policy = deny. Exactly the policies below. `anon` and profile-less authenticated users get nothing.

### 7.2 Standard policy — 15 tables

`companies, company_flags, contacts, products, company_products, competitors, competitor_campaigns, tasks, research_clips, events, event_attendees, connectors, news_items, app_settings, invites`:

```sql
create policy "members read"   on public.<t> for select to authenticated using ( (select public.is_member()) );
create policy "members insert" on public.<t> for insert to authenticated with check ( (select public.is_member()) );
create policy "members update" on public.<t> for update to authenticated using ( (select public.is_member()) ) with check ( (select public.is_member()) );
create policy "members delete" on public.<t> for delete to authenticated using ( (select public.is_member()) );
```

Flat model — any member, any row. `invites` additionally: `insert` needs `created_by = auth.uid()`; `consumed_at`/`consumed_by` are only ever set by the signup trigger.

### 7.3 Table-specific — 3 tables

| table | policy |
|---|---|
| `profiles` | `select`: members. `update`: own row only (`using (id = auth.uid()) with check (id = auth.uid())`) + a `BEFORE UPDATE` trigger that rejects changes to `id`/`email` (only `full_name`/`department` are self-editable). `insert`: none for clients (trigger only). `delete`: none (admin removes via the dashboard). |
| `activity_log` | `select` + `insert` (`with check ((select public.is_member()) and (actor_id = auth.uid() or actor_id is null))`) + `delete` for members. **No update** (immutable). |
| `company_stage_changes` | `select` for members. **No** insert/update/delete policy — written solely by the `log_stage_change()` trigger. |

### 7.4 The `BYPASSRLS` requirement

`is_member()`, `handle_new_user()`, `log_stage_change()`, `set_updated_at()` and the `profiles` column-lock trigger fn are `SECURITY DEFINER` with `search_path = ''`. **They must be owned by a role with `BYPASSRLS`** — on Supabase, migrations run as `postgres`, which has it (the SQL editor bypasses RLS, same reason). A `SECURITY DEFINER` function executes with the owner's role attributes, so `BYPASSRLS` takes effect inside it. This is load-bearing:
- `handle_new_user()` inserts into `profiles` (no client insert policy) and updates `invites`;
- `log_stage_change()` inserts into `company_stage_changes` (no insert policy);
- the `profiles` SELECT policy calls `is_member()`, which selects `profiles` — Postgres would raise *"infinite recursion detected in policy"* if the function weren't RLS-bypassed.
The RLS test (§14) asserts signup + a stage move work end-to-end, and that `select from profiles` doesn't recurse — proving the bypass is in effect.
(`force row level security` on the tables is kept as defence-in-depth but is inert here: it forces RLS on the table *owner*, and `postgres` overrides that with `BYPASSRLS` anyway; `authenticated`/`anon` are never owners so they're always subject to RLS regardless.)

---

## 8. Security — per the brief's Non-Negotiable requirements

- **8.1 RLS on every table, default-deny, auth required.** §7. `enable` + `force` on all 18; every predicate `(select public.is_member())`; `anon` and profile-less users get nothing. `rls-test.mjs` (§14) asserts this table-by-table for anon and profile-less clients, and that `relforcerowsecurity` is true everywhere.
- **8.2 No secrets client-side; anon key only.** Build injects only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. `check-no-secrets.sh` (CI + pre-commit) fails on: the literal `service_role`, `SUPABASE_SERVICE_ROLE`, a PEM block, or any `eyJ…` JWT whose base64 payload decodes to contain `"role":"service_role"`. It must **not** flag the anon key — that's also an `eyJ…` JWT (payload `"role":"anon"`) and is deliberately shipped, so the check decodes and inspects the role claim rather than pattern-matching all JWTs. The anon key is public by design.
- **8.3 Input validation / XSS.** Four layers, no DB triggers (§16 S-7):
  1. **`validate.js`** (unit-tested): trims; length caps; enum checks; **normalises** URL-ish inputs (bare domain `adipec.com` → `https://adipec.com`, reject un-coercible); `linkedin` → `linkedin.com` path; `email` shape. **Validates only fields the user changed** (so editing a seeded contact's phone doesn't choke on its masked `email`). Rejects inline, before the call.
  2. **DB `CHECK`** — every enum + length cap from §6. No `email`/`url` format check.
  3. **Render** — `esc()` on every `innerHTML` interpolation, enforced by a small `html\`\`` helper + a review-checklist item. (The prototype is already ~90% there; this closes the gap.) HTML is never stored or trusted.
  4. **Exports** — `buildReportHtml` / `buildEventReportHtml` `esc()` every value **and** emit `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`, so an injected string can't execute or exfiltrate when the file is opened. (Word ignores the meta; QA confirms the branded `.html` still opens correctly.)
- **8.4 Sessions via supported patterns.** §5.5. No custom JWT/refresh logic.
- **8.5 Real unique accounts, no shared passcode.** §5.1. Attribution is `auth.uid()` → `profiles.full_name`.
- **8.6 HTTPS-only deploy.** Cloudflare Pages: HTTPS + HSTS automatic. `_headers`: HSTS+preload, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny camera/mic/geo), CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://<ref>.supabase.co; frame-ancestors 'none'; base-uri 'none'`. `_redirects`: SPA fallback. (No `wss://` needed — no realtime.) Report preview `<iframe>` uses `srcdoc` + `sandbox` (no `allow-scripts`).
- **8.7 Extension uses anon key + session only.** §11. Sign-in only (email + password); no signup, no magic link (redirect can't land back in an MV3 popup). Session in `chrome.storage.local`. No service key, no privileged RPC.

---

## 9. Data sync between users — refetch, not realtime

**Decision: no realtime.** For a tool used infrequently and usually by one person at a time, the value of live-while-you-watch updates is near zero, and the cost (a realtime channel, echo suppression, guarding every re-render against destroying a focused input, `updated_at` conflict prompts, two-client tests) is real and bug-prone. See §16 S-3.

Instead:
- **On boot**: load every table into `DATA`.
- **On navigating to a view**: refetch that view's slice and re-render. So you always see everyone's latest saved data when you open a screen.
- **After your own write**: `await` it, patch `DATA`, re-render.
- **A manual "Refresh" control** in the header re-pulls everything.
- **Concurrent edits** (rare): last-write-wins at the row level. If two people somehow edit the same company's notes within the same minute, the second save wins and the first person sees the current text next time they open that drawer. Documented, accepted. No `updated_at` preconditions, no merge UI.

If the tool ever becomes heavily co-used, realtime on just the `companies` table (the kanban board) is a small additive change — but not now.

---

## 10. Migration (seed → Postgres)

1. `scripts/seed-source.mjs` — `seedData()` + `SOLUTIONS` + `STAGES` copied verbatim from the HTML (comment cites the lines). `scripts/extract-seed.mjs` → `supabase/seed.sql`.
2. FK order: `products`, `companies` (+ `pain_points`/`current_solutions` as array literals), `company_flags`, `contacts`, `company_products` (from `recommended[]` → `product_id` + `rationale`), `competitors`, `competitor_campaigns`, `tasks`, `news_items`, `events`, `event_attendees`, `connectors`. `app_settings` seeded by its migration. Not seeded: `profiles`, `invites`, `activity_log`, `company_stage_changes`.
3. **`tasks.due` and `news.date` both rebased** to `current_date + original_offset`.
4. `on conflict (id) do nothing` — re-running is safe.
5. The generator asserts every `recommended[].sol` / `attendee.companyId` resolves.
6. **Migrate-my-localStorage importer** (`src/migrate-local.js`, Settings): parses the exported JSON, maps with the same transforms, `upsert`s by id. **Low priority — OQ-4 says the seed is the only dataset.** Kept as a JSON-restore path; can be dropped if the founder's browser holds nothing beyond the seed.
7. Migrations: `supabase/migrations/<timestamp>_*.sql`. `supabase db reset` (local) reproduces schema + seed from zero.

---

## 11. Chrome extension rewire

1. **Sign-in** (email + password only) in an "Account" panel — `@supabase/supabase-js` + a `chrome.storage.local` storage adapter, `detectSessionInUrl: false`. No signup in the extension.
2. **Build**: `esbuild` → `chrome-extension/dist/` with supabase-js inlined, `VITE_*` `define`d from the shared `.env`. `manifest.json`: MV3; keep `activeTab`/`scripting`/`storage`/`downloads`/`clipboardWrite`; add `host_permissions: ["https://<ref>.supabase.co/*"]`; add `content_security_policy.extension_pages: "script-src 'self'; object-src 'self'"`.
3. **Save**: validate → `insert({ id: crypto.randomUUID(), …, created_by })`. Failure (offline / signed-out) → queue in `chrome.storage.local`; "Saved" tab shows pending only + "Sync now"; flush on open + on sign-in.
4. **Keep** Export .json / Copy JSON as break-glass.
5. Anon key only; RLS is the protection.

---

## 12. V2 roadmap (design-only)

Expanded into [ROADMAP.md](ROADMAP.md) (HT16) — per item: the V1 hook, the V2
tables / Edge Functions / schedules / external services, plus the read-auditing
caveat and a sequencing suggestion.

| V2 feature | V1 hook | V2 delivery |
|---|---|---|
| Live news / competitor feeds | `news_items` (`live`, `dismissed_at`), manual rows now | Edge Function on `pg_cron` upserts, skips `dismissed_at` |
| Task reminders / notifications | add `tasks.remind_at` | cron Edge Function; `notifications` table + header bell |
| Email send / track | "Draft email" modal | `email_messages` table; Edge Function → Resend; webhook status |
| Enrichment | stable ids; `contacts.verified` | `enrichment_runs`; Edge Function proposes diffs |
| PDF / DOCX + scheduled delivery | `buildReport*` are pure | Edge Function renders; `report_snapshots`; cron |
| Forecasting dashboard | **`company_stage_changes` ships in V1** | views over it; a dashboard screen. No new table. |
| Full-text search | all text in Postgres | `tsvector` + GIN; global search; removes the bounded `research_clips`/`activity_log` loads |
| Realtime / presence | — | one channel on `companies` if co-use grows (§9) |
| Self-serve offboarding | `profiles` exists | `profiles.active` + a `set_member_active()` RPC + a Settings toggle |

---

## 13. Not losing the data (backups & uptime)

The research data is the whole value and the free Supabase tier has **no managed backups** and **pauses after 7 days idle**. Both handled for $0:

- **`.github/workflows/backup.yml`** — **weekly** (data changes slowly). Use **`supabase db dump`** (the CLI, `--linked` with a `SUPABASE_ACCESS_TOKEN` secret) *or* `pg_dump` against the **Supavisor session-mode pooler** string (`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`). **Not** the "direct connection" (`db.<ref>.supabase.co:5432`) — on the free tier that's IPv6-only and GitHub-hosted runners have no IPv6, so it silently fails to connect. `gzip` the dump → **Cloudflare R2** (free 10 GB; a GH Actions artifact, 90-day retention, is the fallback). Keep the last ~12. `pg_dump`/`pg_restore` must match the server major version (local + Supabase are currently **PG 17** — pin `postgresql-client-17` in the workflow, or just use `supabase db dump` which handles it). One restore into a fresh local project is tested at deploy.
- **`.github/workflows/keepalive.yml`** — every 3 days, `curl -fsS -H "apikey: $ANON" https://<ref>.supabase.co/rest/v1/`. 12 lines. Prevents the pause (a paused free project needs a manual dashboard "Restore" — worth avoiding given infrequent use). If it pauses anyway, the fix is one click.
- The app's **JSON export** stays as a manual, human-triggered snapshot.
- **"Remove account" confirm** is hardened: it lists what will be deleted (N contacts, M tasks, …) and requires typing the account name. Hard-delete otherwise stays (soft-delete is V2 — §16 S-11 style deferral).

If the tool outgrows the free tier, Supabase Pro ($25/mo, daily backups, no pause) is a one-line change and nothing in the design assumes it.

---

## 14. Testing & QA (checklist in TASKS.md)

- **RLS matrix** (`rls-test.mjs`): anon + profile-less clients → 0/denied on every table for select/insert/update/delete. Member client → the CRUD each table allows per §7 (`profiles` update-own-only + the id/email lock; `activity_log` no update; `company_stage_changes` select-only; client can't set `invites.consumed_at`). `relrowsecurity` + `relforcerowsecurity` true on all 18.
- **Invite / signup** (`invite-test.mjs`): no / expired / consumed / email-mismatch / revoked token → rejected; `>30d` expiry → CHECK rejects; valid → confirm → `profiles` row exists with `full_name`, invite consumed; two concurrent redemptions → one winner. **BYPASSRLS in effect**: signup succeeds end-to-end; a stage move writes a `company_stage_changes` row; `select from profiles` doesn't recurse.
- **Migration**: `seed.sql` ×2 → no dupes; task + news dates relative to today; `recommended[]` → `company_products`; sample localStorage import lands + merges.
- **Validation**: editing only the phone on a contact with a masked seeded `email` saves; `adipec.com` → stored `https://adipec.com`; `not a url` → rejected inline.
- **XSS**: `<img onerror>`, `<script>`, `javascript:` into every free-text field + array element → rendered inert in-app and in exported HTML (open the file — nothing runs).
- **Feature regression**: the whole Preserved-feature checklist below, on the deployed app.
- **Extension**: sign in → save online → appears in Research on refetch; save offline → queued → syncs; bundle has anon key only.
- **Deploy**: HTTP→HTTPS; all headers present; inline `<script>` blocked by CSP; app not framable.
- **Cross-browser**: Chrome (primary) + Firefox. (Team is a Chrome-extension shop.)

### Preserved-feature checklist

Dashboard (stage bar, flags, high-priority, overdue/due-soon, pain themes, news ticker — all from the loaded store) · Companies kanban (8 stages) + table toggle + filters + search · Company drawer (stage/priority, **name/type/summary edit — E-1**, delete-cascade, pain points, current solutions, product tags, contacts CRUD, per-company tasks, notes) · Contacts (global list, verified-first, search, edit, mark-contacted, mailto, promote-from-research) · Competition (10 competitors, filters, **name/hq/website edit — E-1**, campaign CRUD, add competitor) · Research (manual add, **extension import**, link-to-account, promote-contact, delete, recent-200+more) · Plan (grouped tasks, toggle, delete, add general/per-company) · Products & Offers (6, **name/tag edit — E-1**, kind/status/blurb/highlights, tag/untag both ways, **re-tag updates rationale — E-2**, delete untags all) · Reports (picker, sandboxed preview, branded `.html` + CSP meta, `.md`) · Events (6, details edit, benefits, attendees, notes, `.html`/`.md` brief) · Settings (team list = profiles + own-name/dept edit, **invite create/list/revoke**, connectors CRUD, activity log last-100+more + clear) · JSON export · News manage modal (add, delete→`dismissed_at`, live tag, refreshed badge).

---

## 15. Deviations from the prototype (D-list)

- **D-1** single HTML → minimal Vite project. HT0 just wraps it (one `main.js`, `style.css`); the data layer (`store`/`api`/`auth`/`validate`/`supabase`) is split into modules in HT4+ as each is rewired; UI/render code stays one file. One static deploy, no backend.
- **D-2** activity log is delete-able ("Clear log" preserved; no role model to restrict it). Insert-immutable; attribution forced to the actor. Not tamper-evident — accepted.
- **D-3** `permission`/`PERMISSIONS`/Admin-Editor-Viewer removed (dead code; RBAC forbidden). Any member can do anything.
- **D-4** shared code + passcodes + `genPasscode` + bypass flag → real Supabase Auth, invite-link signup (OQ-2). First member = hand-inserted invite. No open signup.
- **D-5** news dismissal team-wide via `news_items.dismissed_at` (was a `dismissedNewsIds` array — same effect, cleaner).
- **D-6** `claude.use('downloads')` removed from all 5 export sites → `Blob` + `<a download>` (the existing fallback).
- **D-7** *(withdrawn)* seeded contacts already get ids via the stamping loop.
- **D-8** `meta.createdAt` dropped (unused in the UI).
- **D-9** "Import data (replace)" → upsert-merge ("Migrate my local data"), not destructive replace — can't safely wipe a shared DB from one client.
- **D-10** *(withdrawn — see S-7)* scalar lists stay as `text[]` columns, not child tables.
- **D-11** `tasks.company_id` FK is `ON DELETE CASCADE` (matches the prototype; general tasks are `company_id IS NULL`).
- **D-12** the `LIVE_NEWS_SNAPSHOT` marker block, `mergeLiveNewsSnapshot()`, and the `dismissedNewsIds` array are **deleted** — the DB is the source of news now, and dismissal is `news_items.dismissed_at` (D-5). The V2 news-feed job (§12) writes `news_items` directly.
- **D-13** (HT0) removed one malformed CSS rule from the prototype — an empty `.flag-critical{}` dark-mode block with a dangling comma-selector before an `@media`. Produced zero styles in any browser; the `lightningcss` build minifier rejects it. Provably a no-op.

## 16. Systems-design decisions & rejected alternatives (S-list)

The calls that shape the build — most of them are decisions to keep things *small*.

- **S-1 — Keep the vanilla-JS app.** Rejected: a framework rewrite (weeks of risk, no user benefit, brief says preserve the UI); a custom backend (forbidden unless Supabase can't do the job — it can). Right-sized for a small, infrequently-used internal tool.
- **S-2 — Load small tables whole; bound `research_clips` (200) and `activity_log` (100) with "load more"; never bulk-load `company_stage_changes`.** The extension can grow `research_clips`; the rest is tiny.
- **S-3 — No realtime.** §9. The biggest single simplification. For a tool used rarely and mostly solo, refetch-on-navigate delivers "see everyone's latest data"; live push would add a channel, echo handling, focus-safe re-rendering, conflict prompts, and two-client tests for a benefit nobody would notice. Additive later if co-use grows.
- **S-4 — No optimistic UI.** `await` the write, then patch + render. A ~200 ms save is invisible here; skipping optimism removes all revert-on-failure logic. `api.js` just does: call → on error toast → on success update store.
- **S-5 — Last-write-wins, no merge UI.** Concurrent edits are near-impossible at this usage. If two notes edits collide, the later wins and the other person sees current text on next open. `updated_at` preconditions / "changed by X" prompts — cut.
- **S-6 — Re-render is simple** because there's no push: a re-render only happens right after *your* action or a navigation, so it can't stomp a teammate's in-progress typing. The elaborate "don't re-render a focused container" rule from the realtime design is unnecessary.
- **S-7 — Scalar lists stay `text[]`, not child tables.** The child-table case was concurrency safety (two people editing one company's pain points → lost edits). That scenario needs simultaneous editing of the same record, which won't happen here. `text[]` means 4 fewer tables, 16 fewer policies, simpler store assembly, simpler API. If concurrent editing ever becomes real, migrating a `text[]` to a child table is a contained change.
- **S-8 — Auth is 2 functions** (`handle_new_user` does the invite gate *and* profile creation in one `AFTER INSERT` trigger; `is_member`) + `set_updated_at` + a `profiles` column-lock. Rejected additions: a separate `enforce_invite` BEFORE-INSERT trigger (AFTER-INSERT-with-`RAISE` rolls back identically); `sync_email_confirmed` + `confirmed_at` (unnecessary — Supabase blocks unconfirmed sign-in, so no session, so RLS already denies); `set_member_active` RPC + `profiles.active` + offboarding UI (rare event → dashboard delete in V1).
- **S-9 — `(select public.is_member())` wrap in every policy**, function owned by a `BYPASSRLS` role (§7.4). The wrap = per-statement eval (Supabase's RLS-perf rule); `BYPASSRLS` = the definer functions can write under `force RLS` and `is_member` doesn't recurse. Both asserted in tests.
- **S-10 — Dev = local Supabase (`supabase start`, Docker).** Full stack locally, free, disposable, instant reset, has a catch-all mailbox for the invite flow. Fallback: a 2nd free cloud project (no Docker).
- **S-11 — No DB-trigger input sanitisation.** `esc()` on render + export CSP + `CHECK` constraints + client `validate.js` is the XSS story for an all-trusted-users tool. A per-table `scrub_text` trigger layer is available hardening, not V1.
- **S-12 — `activity_log` not loaded whole, not realtime.** Highest-write table, no live view depends on it.
- **S-13 — Invite specifics.** Consumed at signup (mistype burns it → issue another); 128-bit token; ≤30-day expiry (CHECK); `?invite=` query param (hash is Supabase's); signup web-only; dashboard "Add user" is blocked by the trigger.
- **S-14 — Deployment: Cloudflare Pages** (free, unmetered, commercial-OK; `_headers`/`_redirects`; optional Cloudflare Access edge login later). Rejected: Vercel (free plan bans commercial use); GitHub Pages (no custom headers → no CSP/HSTS). Netlify is an equal alternative.
- **S-15 — Everything is free tier ($0/mo).** §13 handles the two free-Supabase gaps (pause, no backups) with two tiny GitHub Actions. Pro ($25/mo) is a one-line upgrade if ever needed; nothing depends on it.
- **S-16 — Client ids: `crypto.randomUUID()`.** No library.
- **S-17 — `company_stage_changes` kept** despite being V2-facing: the owner asked (OQ-5), it's a 15-line trigger + table with zero ongoing cost, and retrofitting stage history later means losing all the history in between.

## 17. Enhancements over the prototype (E-list — small, in scope)

- **E-1 — Editable identity fields.** The prototype can't rename a company / competitor / product or edit type/summary/hq/website (only events allow it). Inline edit added, same pattern as the existing event-details editor.
- **E-2 — Re-tagging a product updates the rationale** instead of creating a duplicate tag (`unique (company_id, product_id)` + upsert).
- **E-3 — Editable own-profile name/department** in Settings.

---

## 18. Open questions

- **OQ-1 (needed for deploy only)** — one **free** Supabase project for prod: URL + anon key + DB password. HT0–HT12 build against local Supabase.
- **OQ-2** — ✅ invite-link signup.
- **OQ-3** — ✅ **Resend** (free); verify `send.aerosub.co`. Needed before user #2; local dev needs nothing.
- **OQ-4** — ✅ the seed is the only dataset; the localStorage importer is optional.
- **OQ-5** — ✅ `company_stage_changes` ships in V1.
- **OQ-6** — ✅ Cloudflare Pages.
- **OQ-7** — ✅ $0/mo, all free tiers.
- **OQ-8** — ✅ the owner has Docker Desktop → dev = local `supabase start`.
