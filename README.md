# Aerosub Pipeline

Internal business-development tool for Aerosub Solutions — tracks target accounts, contacts, products/offers, competitor intelligence, a curated news feed, and generates branded account reports.

Multi-user web app: real per-person accounts (invite-only), one shared Postgres database behind Row Level Security, live for the whole team. Built on **Vite + vanilla JS + Supabase**, deployed on **Cloudflare Pages** — $0/month, all free tiers.

## Folder structure

```
Aerosub Pipeline/
├── index.html, src/            ← the app (Vite entry, main.js, style.css, store.js, api/, validate.js)
├── supabase/                   ← migrations + seed.sql (schema, RLS policies, functions)
├── chrome-extension/           ← "Aerosub Research Clipper" — see chrome-extension/README.md
├── scripts/                    ← test/check scripts (db-check, rls-test, invite-test, xss-test, …)
├── assets/                     ← source logo files (the app inlines the logo as a data-URI; kept for reference)
├── app/aerosub_crm.legacy.html ← frozen original single-file/localStorage prototype — reference only, not served
└── PRD.md / TASKS.md / QA-RESULTS.md / ROADMAP.md   ← design, build log, test evidence, V2 plan
```

## Setup (local dev)

Needs Node (npm) and Docker (for local Supabase).

```bash
npm install
npx supabase start          # local Postgres + Auth + a catch-all mailbox at localhost:54324
cp .env.example .env        # fill in with: npx supabase status
npm run db:reset            # apply migrations + seed
npm run dev                 # http://localhost:5173
```

Bootstrap a local account without the invite dance:

```bash
node scripts/demo-user.mjs  # creates a confirmed member; refuses to run against a non-local SUPABASE_URL
```

Or do it for real — create an invite, then sign up through the app:

```sql
insert into public.invites (email) values ('you@example.com') returning token;
```

then open `http://localhost:5173/?invite=<token>`.

## Running the checks

```bash
npm run build             # production bundle → dist/
npx vitest run            # unit tests (store.js mapping, validate.js, chrome-extension/clips.js)
npm run db:check          # schema/RLS structural check (41/41)
npm run test:rls          # RLS matrix — anon / member / profile-less (39/39)
npm run test:invite       # invite + signup matrix (30/30)
npm run test:xss          # XSS payloads across every table + view (6/6)
npm run test:headers      # CSP / security headers against a `dist/` preview (11/11)
npm run test:ext          # Chrome extension build + data path + popup (23/23)
npm run smoke             # real-browser sign-in → dashboard render
npm run test:crossbrowser # Chrome + Firefox smoke (14/14)
npm run check:secrets     # scans the tree + dist + extension build for leaked keys
```

Full results and methodology: [QA-RESULTS.md](QA-RESULTS.md).

## Deploying

Production stack: **Cloudflare Pages** (static host) → **Supabase** (Postgres + Auth + RLS) → email via Supabase's built-in sender for now (see **D-14** below).

1. **Supabase**: create a free project, apply `supabase/migrations/` + `supabase/seed.sql`, set Auth → URL Configuration (site URL + redirect URLs) to the Pages URL.
2. **Cloudflare Pages**: connect the repo, build command `npm ci && npm run build`, output directory `dist`, Node 20. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Production + Preview). `public/_headers` (HSTS, CSP, frame-deny) and `public/_redirects` (SPA fallback) are committed and copied into `dist/` automatically — no extra Pages config needed.
3. **Bootstrap the first member** — Supabase Dashboard → SQL Editor:
   ```sql
   insert into public.invites (email) values ('someone@aerosub.co') returning token;
   ```
   Open `https://<pages-url>/?invite=<token>`, sign up, confirm the email (from Dashboard → Authentication → Users if email delivery isn't wired up yet), sign in.
4. **Keep it alive + backed up** — `.github/workflows/keepalive.yml` (pings the REST root every 3 days so the free project doesn't pause after 7 idle days) and `.github/workflows/backup.yml` (weekly `pg_dump` via the Supavisor pooler → gzip → a GitHub Actions artifact, and optionally Cloudflare R2) both need repo secrets set — see the comments at the top of each workflow file for exactly which ones.

### Adding a teammate

Any signed-in member: **Settings → Invites → Create invite** → copy the link → send it. They complete signup, confirm their email, and they're in. No admin role, no approval step (PRD §7 — deliberately no RBAC for a small team).

### Offboarding someone

V1 is manual and rare: an admin deletes their row in Supabase Dashboard → Authentication → Users. That cascades their `profiles` row (their name stays attributed on past `activity_log` entries, which snapshot the name at write time). Self-serve deactivation is a V2 idea — see [ROADMAP.md](ROADMAP.md).

### Known deviation: D-14 (email delivery)

Prod currently runs on **Supabase's built-in email** instead of the Resend SMTP setup the PRD specifies (§5.6) — Resend wasn't wired in for the initial launch. Built-in email is rate-limited (2/hour) and has no verified sending domain, so it's fine for a small initial invite batch but will bite on password resets or a larger onboarding wave. Wiring Resend (`send.aerosub.co` + Supabase custom SMTP settings) is scoped and ready to pick up — see PRD §5.6 and TASKS.md D-14/OQ-3.

## The app

Sections:
- **Dashboard** — pipeline health, flagged accounts, a scrolling news ticker, recurring pain-point themes
- **Companies** — kanban/table of all target accounts, each with pain points, current tech, tagged products, contacts and actions
- **Contacts** — every named contact across all accounts, grouped by account, searchable
- **Competition** — competitor tracker with a past/current/future campaign timeline per competitor
- **Research** — clips saved manually or via the Chrome extension
- **Plan** — task list (general or per-account)
- **Products & Offers** — Aerosub's own catalog, taggable to any account from either direction
- **Reports** — pick an account, pick sections, get a fully Aerosub-branded document (see below)
- **Settings** — team list, invites, connectors, activity log

Data lives in a single shared Supabase project behind Row Level Security — any signed-in member can read and write everything (no per-account ownership; PRD §7). There's no realtime: a **Refresh** button and refetch-on-navigate pull in teammates' changes (PRD §9).

### About the news ticker and competitor tracking

Both are **curated, not live** — add items by hand as you spot them (news, LinkedIn posts, press releases, competitor moves), or capture them with the Chrome extension and import via Research. An automated live-feed job is a V2 idea (see [ROADMAP.md](ROADMAP.md)) — it would need a small scheduled backend job to poll sources and write into `news_items` directly.

### About the Report export

Reports export as a fully Aerosub-branded **`.html`** file, which **Word opens natively** (File → Open) with formatting, colors and the logo intact — from there "Save As → .docx" gives a native Word file in two clicks. A plain **`.md`** export is also offered as a no-formatting fallback that always works. Exports are sandboxed (CSP `<meta>`, no scripts) and every user field is escaped, even in a poisoned field (`npm run test:xss` covers this).

## The Chrome extension

See [chrome-extension/README.md](chrome-extension/README.md). In short: browse the web normally, click the Aerosub icon on anything relevant, jot a summary/potential/contact, and it's saved straight into the app's Research tab (queued locally and synced later if you're offline or signed out).

## Roadmap

Planned V2 work (live feeds, reminders, email send/track, enrichment, PDF/DOCX, forecasting, full-text search, realtime, self-serve offboarding) is designed out in [ROADMAP.md](ROADMAP.md).

## Project history

This app began as a single self-contained HTML file using `localStorage` (frozen at [app/aerosub_crm.legacy.html](app/aerosub_crm.legacy.html), reference only) and was rebuilt on Supabase for real multi-user accounts and shared data. The full build log — decisions, deviations, and test evidence for every step — is in [PRD.md](PRD.md), [TASKS.md](TASKS.md), and [QA-RESULTS.md](QA-RESULTS.md).
