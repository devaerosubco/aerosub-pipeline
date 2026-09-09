# Code review notes — pre-deployment pass (2026-09-09)

A self-review of the Supabase rebuild while HT15 (deploy) is blocked on the
deployment engineer. Grouped by severity. Nothing here blocks the *deploy*
itself, but **A1 is a real preserved-feature gap** that should land before we
call V1 done.

---

## A. Correctness gaps

### A1 — Events view does not persist any edits  ·  severity: high  ·  effort: ~1–2 h

There is no `src/api/events.js`. Every write path in the Events drawer and the
"New event" modal still calls `persist()`, which has been a **no-op since HT4**:

| Action | Code | Effect |
|---|---|---|
| Save event details (name/organizer/location/dates/cost/website) | `main.js:2482` | lost on reload |
| Add / remove a benefit | `main.js:2492`, `:2496` | lost on reload |
| Add / remove an attendee | `main.js:2497`, `:2503` | lost on reload |
| Save event notes | `main.js:2504` | lost on reload |
| New event | `main.js:2534` | vanishes on reload |
| Remove event | `main.js:2475` | reappears on reload |

The DB side is fully ready — `events` and `event_attendees` exist with 4 RLS
policies each, `store.js` reads and assembles them (`eventFromRow` /
`attendeeFromRow` / `assembleEvents`). Only the write layer was never built;
no Heavy Task owned it (HT10 did the *export*, not the editing).

PRD §14's preserved-feature checklist explicitly lists "Events (6, details
edit, benefits, attendees, notes, `.html`/`.md` brief)". `QA-RESULTS.md`
currently marks Events ✅ — **corrected in this pass** to call out the gap.

**Fix:** `src/api/events.js` mirroring `src/api/competitors.js` (create /
editDetails / setNotes / remove + addBenefit-as-array-update / addAttendee /
removeAttendee) + `eventToRow` / `attendeeToRow` in `store.js` + wire the ~8
handlers in `bindEventDrawer` / `openAddEventModal` + add `events` to
`refetchView` (see A2). Then a real-browser verification pass like the other
HTs. This also removes the **last** `persist()` caller, so `persist()`, the
dead-code comment around it, and the stale `store.js` header can all go.

### A2 — refetch-on-navigate only covers Companies / Dashboard / News  ·  severity: low  ·  effort: ~1 h

`store.refetchView(name)` (`store.js:264`) returns `null` for `contacts`,
`competitors`, `research`, `tasks`/`plan`, `products`, `events`, `settings`.
So `refreshCurrentView()` is a no-op for those — navigating to a view does
**not** re-pull it from Postgres.

PRD §9: *"On navigating to a view: refetch that view's slice and re-render."*
Today a teammate's change to any of those views only shows up after the header
**Refresh** button (full `loadAll()`) or a page reload — not on navigation, and
not even on navigate-away-and-back.

Impact is low (infrequent use, usually one person at a time, and the global
Refresh works), but it's a stated-behaviour deviation and the `store.js`
comment (*"every other view name is a no-op until its own Heavy Task adds a
real refetch here"*) shows it was meant to grow per-HT and didn't.

**Fix:** extend `refetchView` to rebuild each slice from the `sel()` +
`assemble*` helpers already in `store.js`. Small, mechanical.

---

## B. Dead / stale code

*(Prod bundle is 382 KB / 108 KB gzip. Tree-shaking confirmed working —
`seedData` / seed strings are **not** in `dist/`.)*

### B1 — unused `html` / `safe` tagged-template helper  ·  effort: 5 min

`main.js:699–710`. Added in HT13 "for any NEW innerHTML string"; nothing ever
called it and the existing render layer wasn't migrated. It **does** ship in
the bundle (~300 B). The `xss-test` (6/6) already proves the existing `esc()`
coverage, so it earns nothing. **Delete it** (or, if kept as a convention for
future work, add a one-line comment saying so and accept the dead weight).

### B2 — `seedData()` + `SOLUTIONS` (`main.js:53–610`, ~480 lines)  ·  keep as-is

Runtime-dead (never called; the only refs are the definition and a comment).
**Deliberately retained** — `scripts/gen-seed-source.mjs` slices these verbatim
to regenerate `supabase/seed.sql`, so deleting them breaks seed regeneration.
Confirmed absent from the prod bundle. No action; maybe make the file-top
comment say "kept only for seed regeneration — see scripts/gen-seed-source.mjs"
louder. (`seedData()` still contains `accessCode:''` / `dismissedNewsIds:[]` —
harmless dead prototype shape inside a function that never runs.)

### B3 — stale `store.js` header comment (`store.js:1–8`)  ·  effort: 2 min

Says *"Only Companies + News have real Supabase-backed writes as of this
task … everything else (contacts, tasks, competitors, research, events,
connectors, activity log) is still … mutated in-memory by the old persist()"*.
Stale since HT5–HT11. **Only Events is still true** (see A1). Update after A1.

### B4 — stale `refetchView` comment (`store.js:258–262`)  ·  effort: 1 min

*"Only companies/dashboard/news are Supabase-backed as of HT4"* — the wording
is out of date even though the code behaviour still matches it (that's A2).

---

## C. Test-infra duplication  ·  severity: low  ·  effort: ~1 h

### C1 — the "bootstrap a confirmed member" dance is copy-pasted in 7 scripts

`browser-smoke.mjs`, `crossbrowser-smoke.mjs`, `demo-user.mjs`,
`ext-save-test.mjs`, `invite-test.mjs`, `rls-test.mjs`, `xss-test.mjs` each
carry their own ~20–30-line version of: load `.env.test` → insert an invite →
`auth.signUp` → poll Mailpit for the `/auth/v1/verify` link → `fetch()` it.
~150 lines of near-identical code.

Extract `scripts/lib/test-helpers.mjs` exporting `loadTestEnv()`,
`bootstrapConfirmedMember({ fullName })`, `pollMailpitLink(email, since)`. Bonus:
the "link never arrived → `fetch(null)` throws `ERR_INVALID_URL`" failure (hit
during this QA pass when the local stack was wedged) becomes a single guarded
`throw new Error('confirmation email never arrived at Mailpit — is auth up?')`
instead of a cryptic stack trace in whichever script ran first.

### C2 — `activity.js` `clearAll()` uses `.neq('id', '')` to match all rows

Works (text PK is never empty), but `.gte('created_at', '1970-01-01')` or
`.not('id', 'is', null)` reads as intent rather than a trick. Trivial.

---

## D. Checked and clean

- `src/api.js` generic `write()` — single responsibility, RLS-denial event
  wired once, no per-module error handling drift.
- `src/api/*.js` — consistent granular-setter pattern, no bare `update`s,
  cascades left to DB FKs.
- `src/auth.js` — well-factored; `myProfile()` correctly filters by `uid`
  (the "members read all profiles" policy would break an unfiltered
  `.single()` once there's >1 member).
- No `console.*`, no `TODO` / `FIXME` in `src/`.
- `check:secrets` clean over source + web `dist/` + extension `dist/`.
- `esc()` coverage proven by `xss-test` (every field of every table).
- `renderApp()` full re-render after every write (31 call sites) — the
  documented no-optimism design (PRD S-6); fine at this data size (10
  companies, etc.).
- CRLF handling — `.gitattributes eol=lf` normalises `src/main.js`; the commit
  warnings are expected.

---

## Suggested order if we spend the deploy wait on this

1. **A1** (Events API) — the one real gap; do it like a mini Heavy Task with a
   browser verification pass, update `QA-RESULTS.md` + `TASKS.md`.
2. **A2** (extend `refetchView`) — natural to do alongside A1 since A1 adds
   `events` to it anyway.
3. **B1 / B3 / B4** — trivial cleanups, fold into the A1 commit.
4. **C1** — test-helper extraction, separate commit; nice-to-have.
