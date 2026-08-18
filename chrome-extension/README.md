# Aerosub Research Clipper (Chrome extension)

Saves pages, summaries and contacts from anywhere on the web into a queue you can import into the **Research** tab of the Aerosub Pipeline app.

## Install (unpacked — this isn't on the Chrome Web Store)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `chrome-extension` folder
5. Pin the Aerosub icon to your toolbar (puzzle-piece icon → pin) for one-click access

## Use it

1. On any page worth capturing, click the Aerosub icon
2. The title, URL and a suggested summary (from the page's meta description, or whatever text you had selected) are pre-filled — edit as needed
3. Fill in **Potential for Aerosub** and, if you found one, a **key contact**
4. Click **Save to Research** — it's stored locally in the extension, not sent anywhere
5. When you've collected a batch, open the **Saved** tab and click **Export .json** (or **Copy JSON** to paste directly)
6. In the Aerosub Pipeline app, go to the **Research** tab → **Import clips** → pick the exported file. New clips are *added*, not merged over existing ones — nothing gets overwritten.
7. From there you can link a clip to an account, or promote its contact straight into that account's contact list.

## Notes

- Nothing here talks to a server — everything stays in the browser (`chrome.storage.local`) until you explicitly export it.
- Works on any regular `http(s)` page. Chrome's own internal pages (`chrome://…`, the Web Store) can't be read by extensions, so the summary auto-fill won't work there — you can still type one in by hand.
- **Clear all saved clips** wipes the extension's local queue — export first if you still need them.
