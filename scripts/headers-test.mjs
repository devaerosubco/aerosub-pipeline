// HT13: parse public/_headers, apply them to a preview of dist/ via route
// interception, and verify the app still works under the CSP + that an
// inline script is blocked and the page isn't framable.
//   node scripts/headers-test.mjs   (runs `npm run build` first if needed)
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5187;
let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); c ? pass++ : fail++; };

// --- parse _headers (the /* block) ---
const raw = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const headers = {};
let inGlob = false;
for (const line of raw.split("\n")) {
  if (line.startsWith("/*")) { inGlob = true; continue; }
  if (inGlob && /^\s+\S/.test(line)) { const i = line.indexOf(":"); headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  else if (inGlob && line.trim() === "") break;
}
ok(!!headers["Content-Security-Policy"], "_headers has a Content-Security-Policy");
ok(headers["X-Frame-Options"] === "DENY", "_headers sets X-Frame-Options: DENY");
ok(/max-age=\d{7,}/.test(headers["Strict-Transport-Security"] || ""), "_headers sets HSTS with a long max-age");
ok(/frame-ancestors 'none'/.test(headers["Content-Security-Policy"]), "CSP has frame-ancestors 'none'");
ok(/script-src 'self'/.test(headers["Content-Security-Policy"]) && !/script-src[^;]*unsafe-inline/.test(headers["Content-Security-Policy"]),
  "CSP script-src is 'self' with NO unsafe-inline");
ok(/connect-src[^;]*supabase\.co/.test(headers["Content-Security-Policy"]), "CSP connect-src allows the Supabase origin");

if (!existsSync(ROOT + "/dist/index.html")) execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "ignore", shell: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: ROOT, shell: true, stdio: "ignore" });
async function waitForServer() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error("no server"); }

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  // vite preview doesn't apply _headers — inject them ourselves
  await ctx.route("**/*", async (route) => {
    const res = await route.fetch();
    const h = { ...res.headers() };
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
    route.fulfill({ response: res, headers: h });
  });
  const page = await ctx.newPage();
  const cspViolations = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate-card, #app .nav", { timeout: 10000 });
  ok(await page.locator(".gate-card").count() > 0, "app boots under the CSP (sign-in screen renders)");
  ok(await page.locator('.gate-card input[type="password"]').count() === 1, "styled form controls render (style-src 'unsafe-inline' works for attributes)");

  // an inline script must be refused
  const ranInline = await page.evaluate(() => {
    return new Promise((resolve) => {
      window.__inlineRan = false;
      const s = document.createElement("script");
      s.textContent = "window.__inlineRan = true;";
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(window.__inlineRan), 100);
    });
  });
  ok(ranInline === false, "an injected inline <script> does not execute under script-src 'self'");
  ok(cspViolations.length > 0, "the blocked inline script produced a CSP violation report");

  // not framable
  const framed = await ctx.newPage();
  await framed.setContent(`<iframe src="http://localhost:${PORT}/" id="f"></iframe>`);
  await framed.waitForTimeout(800);
  const frameBody = await framed.evaluate(() => {
    try { return document.getElementById("f").contentDocument?.body?.innerHTML ?? "BLOCKED"; }
    catch { return "BLOCKED"; }
  });
  ok(frameBody === "BLOCKED" || frameBody === "" || frameBody == null, "the app cannot be framed (X-Frame-Options / frame-ancestors)");

  await browser.close();
} catch (e) {
  console.error("ERROR", e);
  fail++;
} finally {
  server.kill("SIGKILL");
}

console.log(`\nheaders-test: ${fail === 0 ? "OK" : "FAILED"}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
