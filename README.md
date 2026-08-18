# Aerosub Pipeline

Internal business-development tool for Aerosub Solutions — tracks target accounts, contacts, products/offers, competitor intelligence, a curated news feed, and generates branded account reports.

## Folder structure

```
Aerosub Pipeline/
├── app/
│   └── aerosub_crm.html      ← the tool itself (open directly, or use the published link)
├── chrome-extension/         ← "Aerosub Research Clipper" — load unpacked via chrome://extensions
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── icon16/32/48/128.png
│   └── README.md             ← install + usage instructions
└── assets/
    └── aerosub-logo.png      ← pulled from aerosub.co, used in exported reports
```

## The app (`app/aerosub_crm.html`)

A single self-contained HTML file — no build step, no server. Open it directly in a browser, or use the version published as a Claude Artifact (ask for the link if you don't have it).

**Data lives in the browser's local storage**, per device/browser — it does not sync automatically. Use **Export data (.json)** in the sidebar regularly to back up, and **Import data** to restore or move to another machine.

Sections:
- **Dashboard** — pipeline health, flagged accounts, a scrolling news ticker, recurring pain-point themes
- **Companies** — kanban/table of all target accounts, each with pain points, current tech, tagged products, contacts and actions
- **Contacts** — every named contact across all accounts, searchable
- **Competition** — competitor tracker with a past/current/future campaign timeline per competitor
- **Research** — clips saved manually or via the Chrome extension
- **Plan** — task list
- **Products & Offers** — Aerosub's own catalog, taggable to any account from either direction
- **Reports** — pick an account, pick sections, get a fully Aerosub-branded document (see below)

### About the news ticker and competitor tracking

Both are **curated, not live**. The sandboxed environment this tool runs in cannot fetch external RSS feeds or scrape competitor websites/social accounts automatically — there's no server behind this app to do that fetching on its behalf. Add items as you spot them (or capture them with the Chrome extension and import them via the Research tab). If real-time auto-updating feeds become a priority, that would need a small backend service to poll sources and hand the app fresh data — a natural next step if this proves useful enough to invest in.

### About the Report export

`.doc` isn't an option — this Claude Artifact runtime only allows exporting a fixed set of file extensions, and `.doc` isn't one of them. Reports export as a fully Aerosub-branded **`.html`** file instead, which **Word opens natively** (File → Open) with all formatting, colors and the logo intact — from there "Save As → .docx" gives you a native Word file in two clicks. A plain **`.md`** export is also offered as a no-formatting fallback that always works.

## The Chrome extension (`chrome-extension/`)

See `chrome-extension/README.md`. In short: browse the web normally, click the Aerosub icon on anything relevant, jot a summary/potential/contact, and export a batch of clips as JSON to import into the app's Research tab.
