// Renders the built popup.html in a plain browser with a stubbed chrome.*
// so we catch HTML/JS wiring bugs (missing element ids, tab switching,
// the account panel) that the data-path test can't. Not an MV3 harness.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../chrome-extension/dist/", import.meta.url));
let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); c ? pass++ : fail++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// stub chrome.* before any script runs
await page.addInitScript(() => {
  const store = {};
  window.chrome = {
    storage: { local: {
      get: (keys, cb) => cb(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, store[k]]))),
      set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
      remove: (k, cb) => { delete store[k]; cb && cb(); },
    } },
    tabs: { query: (_q, cb) => (cb ? cb([{ id: 1, title: "Test Page", url: "https://example.com/x" }]) : Promise.resolve([{ id: 1, title: "Test Page", url: "https://example.com/x" }])) },
    scripting: { executeScript: async () => [{ result: { selection: "", description: "a description" } }] },
    downloads: { download: (_o, cb) => cb && cb() },
  };
});

try {
  await page.goto("file://" + dist + "popup.html");
  await page.waitForTimeout(800);

  ok(await page.locator(".tab").count() === 3, "popup has 3 tabs (Capture / Queue / Account)");
  ok(await page.locator("#saveBtn").count() === 1, "Save button present");

  // account tab -> signed-out form
  await page.click('[data-tab="account"]');
  await page.waitForTimeout(200);
  ok(await page.locator("#acctEmailInput").isVisible() && await page.locator("#signInBtn").isVisible(),
    "Account tab shows the signed-out sign-in form");
  ok(!(await page.locator("#acctSignedIn").isVisible()), "signed-in block is hidden when there's no session");

  // capture tab prefilled from the stubbed active tab
  await page.click('[data-tab="capture"]');
  await page.waitForTimeout(200);
  ok((await page.locator("#title").inputValue()) === "Test Page", "Capture form prefilled the page title");
  ok((await page.locator("#url").inputValue()) === "example.com/x", "Capture form prefilled the URL scheme-less");

  // save with no title -> validation message, nothing queued
  await page.fill("#title", "");
  await page.click("#saveBtn");
  await page.waitForTimeout(200);
  ok(/title/i.test(await page.locator("#status").textContent()), "saving with no title shows a validation message");

  // save while signed out -> goes to the queue
  await page.fill("#title", "Popup queued clip");
  await page.click("#saveBtn");
  await page.waitForTimeout(300);
  ok(/queue/i.test(await page.locator("#status").textContent()), "saving while signed out tells the user it went to the queue");
  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(200);
  ok(/Popup queued clip/.test(await page.locator("#clipList").textContent()), "the queued clip shows on the Queue tab");
  ok(await page.locator("#syncHint").isVisible(), "Queue tab hints to sign in to sync");

  ok(errors.length === 0, "no page errors");
  if (errors.length) errors.slice(0, 8).forEach((e) => console.log("  " + e));
} catch (e) {
  console.error("ERROR", e);
  fail++;
} finally {
  await browser.close();
}

console.log(`\next popup check: ${fail === 0 ? "OK" : "FAILED"}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
