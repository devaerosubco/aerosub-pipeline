# Aerosub Pipeline — Codebase Audit (Step 1)

Date: 2026-09-03
Scope: everything under `Aerosub Pipeline/` except `Mail - jerry.igho@aerosub.pdf` (reference only, untouched).

---

## 1. Repository layout (actual)

```
Aerosub Pipeline/            ← treat this as the repo root (README, app/, chrome-extension/ live here)
├── index.html               ← 12-line meta-refresh redirect to app/aerosub_crm.html
├── README.md
├── app/
│   └── aerosub_crm.html      ← 3932 lines, the entire app (HTML + CSS + JS inline, no build)
├── chrome-extension/         ← MV3 "Aerosub Research Clipper"
│   ├── manifest.json         ← MV3, permissions: activeTab, scripting, storage, downloads, clipboardWrite
│   ├── popup.html            ← ~100 lines
│   ├── popup.js              ← 169 lines
│   └── icon16/32/48/128.png
├── assets/
│   ├── aerosub-logo.png
│   └── aerosub-logo-small.png
└── Mail - jerry.igho@aerosub.pdf   ← DO NOT TOUCH
```

There is **no** `package.json`, no build tooling, no server code, no `.git` directory, no tests, no CI. `git` is not initialised.

The outer folder `C:\Users\joyae\Downloads\Aerosub Pipeline\` contains only the inner `Aerosub Pipeline\` folder. PRD.md / TASKS.md / AUDIT.md are placed at the inner folder (the real project root, next to README.md).

---

## 2. The app (`app/aerosub_crm.html`)

### 2.1 Shape
- Single self-contained file: `<title>`, one big `<style>` block (~750 lines), one `<script>` block (~3170 lines), `"use strict"`.
- No framework. Rendering is **full innerHTML re-render per view** (`renderView()` swaps `#viewMount.innerHTML`, then a `bind*Controls()` function re-attaches listeners). Drawers/modals render the same way.
- Theming: CSS custom properties with light default + `prefers-color-scheme` dark + `[data-theme]` override. Inline SVG icon set (`ICONS`). Report/brand palette (`BRAND`) is separate and includes a **base64 PNG logo data-URI** (~30 KB) inlined at line 842.

### 2.2 State & persistence
- Single global `DATA` object, wrapped by `Store` (lines 1386–1463).
- `STORAGE_KEY = 'aerosub_pipeline_v1'` in `localStorage`. `JSON.parse`/`JSON.stringify` round-trip. `persist()` → `Store.save()` on every mutation.
- `Store.load()`: if stored JSON exists → parse + `migrate()`; else → `seedData()` + `mergeLiveNewsSnapshot()` + save.
- `Store.migrate()`: extensive defensive backfill of fields/arrays added after first save. Re-seeds whole collections if a top-level array is missing. **This is effectively the current "schema migration" mechanism** and its field list is the authoritative list of every property the app expects.
- No sync of any kind between browsers/devices. "Team" = people sharing an exported JSON file.
- Extra localStorage keys: `aerosub_current_user` (attribution name), `sessionStorage: aerosub_unlocked` (gate bypass flag for the session).

### 2.3 Auth / access gate (lines 3218–3486, 3926–3931)
- Boot: `if (isUnlocked()) renderApp(); else renderGate();`
- `isUnlocked()`: true if **no** shared `accessCode` and **no** team member has a `passcode`; otherwise checks `sessionStorage.aerosub_unlocked === 'true'`.
- `renderGate()`: a passcode field + name field. Accepts either (a) a team member's personal `passcode` (then attributed as that member), or (b) the shared `settings.accessCode` + a typed name.
- On success: sets `sessionStorage.aerosub_unlocked`, stores name in `localStorage`, `logActivity('Signed in')`.
- The gate UI itself openly states: *"This only keeps out casual visitors — it isn't real per-user security, and it's visible to anyone who views this page's source."*
- `PERMISSIONS = ['Admin','Editor','Viewer']` and a `permission` field exist on team members but are **never enforced anywhere** — purely a label shown in the Settings table.
- `genPasscode()` → 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.

### 2.4 Activity log
- `logActivity(action, detail)` unshifts `{id, ts, user: currentUserName()||'Unattributed', action, detail}` into `DATA.activityLog`, capped at 200, then persists.
- Logged actions: Signed in, Moved pipeline stage, Removed an account, Added an account, Added a contact, Tagged a product to an account, Logged a competitor campaign, Added an event, Drafted an email, Exported data (JSON backup), Imported data (replaced local dataset).
- "Clear log" button wipes it (`DATA.activityLog = []`).

### 2.5 Navigation / sections (actual)
`renderView()` switch → 10 views. `NAV` array + `navCounts()`. Section list is **larger than the task brief states** — Events and Settings are additional:

| view key      | Title (viewTitle)          | Notes |
|---------------|----------------------------|-------|
| `dashboard`   | Overview                   | Derived-only: pipeline health, stage bar, flagged accounts, high-priority open, overdue/due-soon tasks, **news ticker**, recurring pain-point themes (regex-bucketed client-side via `PAIN_RULES`). No stored state of its own. |
| `companies`   | Companies                  | Kanban (`renderBoard`, drag between the 8 `STAGES`) **or** table (`renderCompanyTable`), toggled by `ui.companyLayout`. Filters: priority, stage. Opens company drawer. |
| `contacts`    | Contacts                   | Flat list of every contact across all companies, searchable, sorted verified-first. Edit / mark-contacted / draft-email / promote. |
| `competitors` | Competition Dashboard      | 10 seeded competitors (brief said 9), each with a campaign timeline. Filters: modality, threat. Verdict taxonomy. |
| `research`    | Research                   | Clips (manually added or imported from the extension). Link to account, promote contact into an account. |
| `tasks`       | Plan                       | Task list grouped Overdue / This week / Later / Done. |
| `solutions`   | Products & Offers          | Aerosub's own catalog (`SOLUTIONS`, 6 items). Tag/untag to accounts from either side. |
| `reports`     | Report Builder             | Pick account + sections → branded `.html` (Word-openable) or plain `.md`. Live `<iframe srcdoc>` preview. |
| `events`      | Events                     | **Not in the task brief.** Conference/exhibition tracker (6 seeded), attendee notes, per-event branded `.html`/`.md` brief export. |
| `settings`    | Settings                   | **Not in the task brief.** Access code, team & (unenforced) permissions, connectors/data-sources reference list, activity log. |

### 2.6 News ticker / feed
- `DATA.news` array; ticker (`renderTicker`) is a CSS marquee, pauses on hover, `prefers-reduced-motion` aware.
- `LIVE_NEWS_SNAPSHOT` block (lines 846–858) with `LIVE_NEWS_SNAPSHOT_START/END` marker comments — explicitly designed to be **find-and-replaced by "the scheduled RSS-refresh cloud routine"**. Currently empty (`refreshedAt:'', items:[]`).
- `mergeLiveNewsSnapshot(d)` merges snapshot items into `DATA.news` on every load, skipping ids already present or in `DATA.dismissedNewsIds`, and records `settings.lastNewsRefresh`.
- `dismissedNewsIds`: array; deleting a news item adds its id here so a re-pushed snapshot can't resurrect it.
- **So the prototype already anticipates a backend cron feeding news** — the V2 direction in the brief matches an existing seam.

### 2.7 Runtime "capabilities"
- The file calls `await claude.use('downloads')` in 5 places (report/event/data exports), with a `Blob` + `<a download>` fallback. This is a Claude Artifact runtime API. In a normal browser deploy only the fallback path runs.
- `window.open('mailto:...')` for "draft email". `window.open(url, '_blank')` for external links (all links use `rel="noopener"`).

### 2.8 Input handling / XSS posture
- `esc(s)` escapes `& < > " '` and is applied to most interpolated strings in template literals.
- `stripProto(url)` strips a leading protocol; links are then rebuilt as `https://` + stripped value. No validation that the result is a safe scheme/host.
- Report/brief exports (`buildReportHtml`, `buildEventReportHtml`) also run values through `esc()`.
- Risk areas for the rebuild: free-text `notes`, `painPoints`, `currentSolutions`, competitor `summary`/`gap`/`sweetSpot`, research `summary`/`potential`, event `notes`, news `title` — all user-authored, all rendered as HTML somewhere, and all flow into exported HTML documents. Server-side validation currently does not exist.

---

## 3. Data model as it exists today (from `seedData()` + `Store.migrate()`)

Top-level `DATA`: `{ companies, tasks, solutions, competitors, news, research, events, team, activityLog, settings, dismissedNewsIds, meta }`

### companies[] (10 seeded: `amni`, `totalenergies`, `seplat`, `nestoil`, `geil`, `renaissance`, `nlng`, `aradel`, `frontier`, `oriental`)
| field | type | notes |
|---|---|---|
| `id` | string slug | e.g. `'amni'`; new ones: `slug + '-' + rand` |
| `name` | string | |
| `type` | string (free text) | e.g. `'Major IOC'`, `'Indigenous — Private E&P'` |
| `priority` | `'high'\|'medium'\|'low'` | `PRIORITIES` |
| `stage` | one of 8 `STAGES` ids | `research, contact, outreach, discussion, proposal, negotiation, won, hold` |
| `summary` | string | |
| `notes` | string | free text, editable |
| `flags[]` | `{type:'critical'\|'info', text}` | dashboard "flagged accounts" |
| `painPoints[]` | string[] | ordered, deleted by index |
| `currentSolutions[]` | string[] | ordered, deleted by index |
| `recommended[]` | `{sol: <solutionId>, why: string}` | "products tagged to this account" |
| `contacts[]` | see below | nested |

### contacts (nested in companies[].contacts[])
`{ id, companyId, name, pos, email, phone, linkedin, verified:bool, lastContact:'YYYY-MM-DD'|'', nextFollowUp:''|date }`
- Seed literals omit `id`/`companyId`/`lastContact`/`nextFollowUp`, but `seedData()` stamps them in a loop (lines 1181–1184): `ct.id = c.id+'-c'+i`, `ct.companyId = c.id`, `ct.lastContact=''`, `ct.nextFollowUp=''`. So seeded contacts **do** have stable ids at runtime. In-app new contacts use `co.id+'-c'+Date.now()`.
- `verified` = "LinkedIn-verified title" tick.

### solutions[] (6: `drone`, `rov`, `crawler`, `cleaning`, `platform`, `surveillance`) — sourced from `const SOLUTIONS`
`{ id, name, tag, kind:'Product'\|'Offer', status:'Active'\|'Pilot'\|'Planned', blurb, highlights: string[] }`
Seed copies `SOLUTIONS` via `SOLUTIONS.map(s=>({...s}))`.

### competitors[] (10: `cyberhawk`, `future3d`, `aerialrobotix`, `arco`, `fugro`, `tscsubsea`, `marineplatforms`, `gecko`, `petrobot`, `ardrend`)
| field | type |
|---|---|
| `id` | string slug |
| `name`, `hq`, `website`, `notes` | string |
| `modality` | `'Drone'\|'ROV'\|'Crawler'\|'Multi-domain'\|'Other'` |
| `threat` | `'Direct'\|'Adjacent'\|'Watch'` |
| `campaigns[]` | see below |

campaigns[]: `{ id, title, type:'Past'\|'Current'\|'Future', date:'YYYY-MM-DD', sourceUrl, relevance ('Direct overlap'\|'Watch'\|...), summary, performance, gap, sweetSpot, verdict:'compete'\|'complement'\|'partner'\|'avoid'\|'watch' }`
- Seeded campaign ids are normalised to `co.id + '-cp' + i` after construction.

### tasks[] (12 seeded, `t1`–`t12`)
`{ id, title, companyId: <id>|'' , due:'YYYY-MM-DD', priority:'high'|'medium'|'low', done:bool }`
- Seeded due dates are relative (`plus(n)`/`minus(n)` of *load* date at seed time — they'll be stale after first seed).

### news[] (6 seeded, `n1`–`n6`)
`{ id, title, source, url, date:'YYYY-MM-DD', kind:'company'|'product'|'', refId: <companyId|solutionId|''>, live:bool }`

### research[] — seeded empty `[]`
Clip shape (from `openAddResearchModal` / `doImportResearch`):
`{ id, title, url, capturedAt: ISO, summary, potential, contactName, contactEmail, contactPhone, contactLinkedin, companyId: <id>|'' }`
- Extension export payload: `{ type:'aerosub-research-clips', version:1, clips:[...] }` (import also accepts a bare array).
- "Promote contact" pushes a new contact onto `company.contacts` with `pos:'From research clip'`.

### events[] (6 seeded: `adipec2026`, `nog2027`, `naice2027`, `nies2027`, `otc2027`, `nlngexpo2027`)
`{ id, name, organizer, location, startDate, endDate, cost (free text), currency:'USD', website, benefits: string[], attendees[], notes }`
attendees[]: `{ id, name, companyId: <id>|'', status: free text }` (ids normalised to `ev.id+'-a'+i`).

### team[] (1 seeded: `{id:'u1', name:'', email:'', department:'MD', permission:'Admin'}`)
`{ id, name, email, department, permission:'Admin'|'Editor'|'Viewer', passcode: string }`
- `department` is free text in practice (`'MD'` seeded; modal offers a select — see `openAddTeamModal`).

### settings
`{ accessCode: string, connectors: [{id, name, type, url, notes}], lastNewsRefresh: string }`
- 3 seeded connectors (NIPEX portal, aerosub.co, LinkedIn) — pure documentation, "no live API integrations".

### activityLog[] — seeded empty. `{ id, ts: ISO, user: string, action: string, detail: string }`

### dismissedNewsIds[] — string[] of deleted news ids.

### meta — `{ createdAt: 'YYYY-MM-DD' }`

---

## 4. Chrome extension (`chrome-extension/`)

- MV3, popup-only (no background/service worker, no content script — uses `chrome.scripting.executeScript` on demand).
- `popup.js`: two tabs (Capture / Saved). Capture pre-fills title/URL from `chrome.tabs.query`, and summary from the page's selection or `meta[name=description]`/`og:description` via an injected function.
- Clip fields: `title, url, summary, potential, contactName, contactEmail, contactPhone, contactLinkedin, capturedAt`.
- Storage: `chrome.storage.local` key `aerosub_clips` (array). No network anywhere.
- Export: `chrome.downloads.download` of a `data:application/json` URL, or `navigator.clipboard.writeText`. Payload `{type:'aerosub-research-clips', version:1, clips}`.
- `escapeHtml()` used when rendering the saved list.
- **Nothing to preserve server-side; the whole thing is a local queue + JSON hand-off.**

---

## 5. Surprises / notes vs. the task brief

1. **Two extra sections** the brief doesn't mention: **Events** (conference tracker with its own branded export) and **Settings** (access + team + connectors + activity log). Both must be preserved / rebuilt.
2. **10 competitors and 10 companies**, not "9 competitors" as the brief says.
3. **6 products/offers** (`SOLUTIONS`), source-of-truth is a `const`, copied into `DATA.solutions` and independently editable thereafter.
4. The prototype **already has the "cloud routine feeds news" seam** (`LIVE_NEWS_SNAPSHOT` markers, `mergeLiveNewsSnapshot`, `dismissedNewsIds`, `settings.lastNewsRefresh`). The V2 news direction is a continuation, not a redesign.
5. `permission` / `PERMISSIONS` exist but are **dead** — no code path checks them. Aligns with the brief's "no RBAC" rule; the rebuild should drop the concept, not port it.
6. Seeded **tasks AND news items** use relative dates (`plus(n)`/`minus(n)`, e.g. `news` `date:plus(-3)`) frozen at first-seed — migration must rebase **both**. (Seeded contacts *do* get ids via the stamping loop — see §3.)
7. Nested arrays everywhere (`company.contacts`, `company.recommended`, `company.painPoints`, `company.currentSolutions`, `competitor.campaigns`, `event.attendees`, `event.benefits`, `product.highlights`) — the kanban + dashboard + reports all read them. In the rebuild the relational ones stay tables; the scalar lists (`painPoints`, `currentSolutions`, `highlights`, `benefits`) become **`text[]` columns** (PRD §16 S-7 — the tool is single-user most of the time, so the concurrency argument for child tables doesn't apply).
8. `esc()` is applied fairly consistently but there is **no URL scheme validation** and **no server-side validation at all**. Also, the seed itself contains values that fail strict validation: **bare-domain URLs** (`adipec.com`, `linkedin.com/in/…`), **non-email "emails"** (`"@greenenergy.ng (address masked)"`), **non-numeric "phones"** (`"+234-1-9049870-9 (HQ)"`). The rebuild's validators must normalise bare domains to `https://…` and validate only *changed* fields, and the DB must **not** put a format `CHECK` on email/url — see PRD §8.3.
9. The app relies on a full re-render model. The rebuild has **no realtime** (PRD §9 / §16 S-3) — re-render only happens right after your own action or a navigation, so there's no risk of a push stomping your in-progress typing. Data freshness comes from refetch-on-navigate + a manual "Refresh".
10. **The prototype has no way to edit a company's `name` / `type` / `summary`, a competitor's `name` / `hq` / `website`, or a product's `name` / `tag` after creation** — those fields are render-only in their drawers (only *events* expose identity-field editing, via `saveEventDetailsBtn`). This is a prototype limitation, not a feature to preserve — the rebuild adds inline editing (PRD §17 E-1).
11. `openAddRecommended` / product-tagging does `c.recommended.push({sol,why})` with **no dedup** — the same product can be tagged to one account twice. Latent bug; the rebuild's `company_products` has `unique (company_id, product_id)` and re-tag updates the rationale (PRD §17 E-2).
12. Deleting a company **cascades task deletion** (`DATA.tasks = DATA.tasks.filter(t=>t.companyId!==c.id)`), not set-null — so `tasks.company_id` FK must be `ON DELETE CASCADE` (general tasks have `company_id IS NULL` and are untouched). `research_clips` and `event_attendees` keep their row on company delete (`SET NULL`).
13. `meta.createdAt` exists on `DATA` but is **not shown anywhere in the UI** — safe to drop (folded into `app_settings` or discarded; PRD D-8).
14. `index.html` is just a redirect; the deploy entrypoint is `app/aerosub_crm.html`.
15. Exports (5 sites incl. the whole-`DATA` JSON backup `doExport`) try a Claude-Artifact `claude.use('downloads')` capability first — in a plain static deploy that always falls through to the `Blob`/`<a download>` path. All 5 call sites get the capability call removed (PRD D-6).
