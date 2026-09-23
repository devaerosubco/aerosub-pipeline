# Aerosub Research Clipper (Chrome extension)

Save pages, summaries and contacts from anywhere on the web **straight into
the Research tab** of the Aerosub Pipeline app. You sign in with the same
account you use for the app; clips you capture appear in Research for the
whole team.

## Build it

The extension bundles `@supabase/supabase-js`, so it has to be built (it
isn't a plain folder of files any more):

```
npm install
node chrome-extension/build.mjs      # or: npm run ext:build
```

That reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from the repo
`.env` (local Supabase) and writes a ready-to-load extension to
**`chrome-extension/dist/`** (only the public anon key is baked in — never a
service key).

## Sharing it with the team (no Chrome Web Store — that costs $5 and requires
review; this skips both)

1. Create `chrome-extension/.env.production` (git-ignored, same shape as the
   repo `.env`) with the **prod** Supabase URL + anon key — the same ones
   Cloudflare Pages uses to build the app. Get them from `supabase projects
   api-keys --project-ref <ref>` or the Supabase dashboard.
2. `npm run ext:zip` — builds against that prod env and writes
   **`chrome-extension/aerosub-clipper.zip`**.
3. Send teammates that zip (Slack, Drive, whatever). They:
   - Unzip it somewhere permanent (Chrome loads it from that folder — don't
     delete it after installing).
   - `chrome://extensions` → turn on **Developer mode** (top-right) →
     **Load unpacked** → select the unzipped folder.
   - Pin the Aerosub icon to their toolbar.
4. When the extension code changes: re-run `npm run ext:zip`, resend the
   zip, teammates repeat step 3 (or replace the folder contents and hit the
   refresh icon on the extension's card in `chrome://extensions`).

For your own local testing against local Supabase, `npm run ext:build` +
**Load unpacked** on `chrome-extension/dist/` still works as before.

## Use it

1. **Account tab → Sign in** with your Aerosub Pipeline email + password.
   (No sign-up here — get an invite link from a teammate and complete it in
   the app first.)
2. On any page worth keeping, click the Aerosub icon. Title, URL and a
   suggested summary (from the page's meta description or your selection)
   are pre-filled.
3. Fill in **Potential for Aerosub** and any **key contact**, then
   **Save to Research**.
   - Signed in and online → the clip goes straight into the Research tab,
     attributed to you.
   - Signed out or offline → it's held in a local **Queue**. Sign in (or
     click **Sync now** on the Queue tab) and it uploads.
4. In the app, open **Research** to see it — link it to an account, or
   promote its contact into that account's contact list.

## Break-glass export

The **Queue** tab still has **Export .json** / **Copy JSON**. That's only
for when syncing isn't possible at all — the app's **Research → Import
clips** accepts the exported file. Normal use needs none of this.

## Notes

- The extension talks to the same Supabase backend as the app, using the
  public anon key and your signed-in session. Row-level security is the
  protection — the key alone can't read or write anything.
- Works on regular `http(s)` pages. Chrome's own pages (`chrome://…`, the
  Web Store) can't be read by extensions, so summary auto-fill is skipped
  there — type one in by hand.
- **Clear the queue** wipes only the local unsynced queue — export first if
  those clips haven't uploaded.
