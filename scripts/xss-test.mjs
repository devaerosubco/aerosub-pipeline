// HT13 XSS matrix: plant hostile strings in every free-text field of every
// table, then drive the app through every view + drawer + an exported
// report and assert nothing executes. Additive — it creates its own rows
// and deletes them after, so the seed + any demo account are untouched.
//   node scripts/xss-test.mjs   (needs `supabase start` + a dev-able build)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5188;
for (const line of readFileSync(new URL("../.env.test", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = "http://127.0.0.1:54324";
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); c ? pass++ : fail++; };

// the payloads. text fields get X1/X2/X3; url-ish fields get the js: one.
const X1 = `<script>window.__xss=1;alert('s')</script>`;
const X2 = `<img src=x onerror="window.__xss=1;alert('e')">`;
const X3 = `"><svg onload="window.__xss=1;alert('v')"><b `;
const XU = `javascript:window.__xss=1;alert('u')//`;
const T = (n) => `${X1}${X2}${X3} field-${n}`;

const created = { companies: [], contacts: [], products: [], company_products: [], competitors: [], competitor_campaigns: [], tasks: [], research_clips: [], events: [], event_attendees: [], news_items: [], connectors: [], company_flags: [], activity_log: [], invites: [] };
const id = () => crypto.randomUUID();
async function ins(table, row) { const r = { id: row.id || id(), ...row }; const { error } = await svc.from(table).insert(r); if (error) throw new Error(`${table}: ${error.message}`); created[table].push(r.id); return r.id; }

async function bootstrapMember() {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = "xss-" + Date.now(), email = `xss-${Date.now()}@example.com`, password = "a-strong-password-1";
  const invId = await ins("invites", { token, email });
  const since = new Date().toISOString();
  await anon.auth.signUp({ email, password, options: { data: { full_name: T("member-name"), invite_token: token }, emailRedirectTo: `http://localhost:${PORT}` } });
  let link = null;
  for (let i = 0; i < 25 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
    const hit = list.messages.find((m) => m.To?.some((t) => t.Address === email) && m.Created > since);
    if (hit) { const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json(); const m = (full.Text || "").match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/); if (m) link = m[0]; }
    if (!link) await new Promise((r) => setTimeout(r, 200));
  }
  await fetch(link, { redirect: "manual" });
  return { email, password, invId };
}

async function plant() {
  const co = await ins("companies", {
    name: T("co-name"), type: T("co-type"), priority: "high", stage: "research",
    summary: T("co-summary"), notes: T("co-notes"),
    pain_points: [T("pain-1"), X2], current_solutions: [T("cur-1"), X3],
  });
  await ins("company_flags", { company_id: co, type: "critical", text: T("flag-text") });
  await ins("contacts", { company_id: co, name: T("ct-name"), position: T("ct-pos"), email: T("ct-email"), phone: T("ct-phone"), linkedin: XU });

  const prod = await ins("products", { name: T("prod-name"), tag: T("prod-tag"), kind: "Product", status: "Active", blurb: T("prod-blurb"), highlights: [T("hl-1"), X2] });
  await ins("company_products", { company_id: co, product_id: prod, rationale: T("cp-rationale") });

  const comp = await ins("competitors", { name: T("comp-name"), hq: T("comp-hq"), website: XU, notes: T("comp-notes"), modality: "Drone", threat: "Direct" });
  await ins("competitor_campaigns", { competitor_id: comp, title: T("cmp-title"), type: "Current", relevance: T("cmp-rel"), source_url: XU, summary: T("cmp-summary"), performance: T("cmp-perf"), gap: T("cmp-gap"), sweet_spot: T("cmp-sweet"), verdict: "watch" });

  await ins("tasks", { title: T("task-title"), company_id: co, priority: "high", done: false });
  await ins("research_clips", { title: T("rc-title"), url: XU, summary: T("rc-summary"), potential: T("rc-potential"), contact_name: T("rc-cname"), contact_email: T("rc-cemail"), contact_phone: T("rc-cphone"), contact_linkedin: XU, company_id: co });

  const ev = await ins("events", { name: T("ev-name"), organizer: T("ev-org"), location: T("ev-loc"), cost: T("ev-cost"), website: XU, benefits: [T("ben-1"), X2], notes: T("ev-notes") });
  await ins("event_attendees", { event_id: ev, name: T("att-name"), company_id: co, status: T("att-status") });

  await ins("news_items", { title: T("news-title"), source: T("news-source"), url: XU, date: "2026-08-01", kind: null });
  await ins("connectors", { name: T("con-name"), type: T("con-type"), url: XU, notes: T("con-notes") });
  await ins("activity_log", { actor_id: null, actor_name: T("act-actor"), action: T("act-action"), detail: T("act-detail") });
  return { co, prod, comp, ev };
}

async function cleanup() {
  for (const table of ["event_attendees", "events", "competitor_campaigns", "competitors", "company_products", "products", "company_flags", "contacts", "tasks", "research_clips", "news_items", "connectors", "activity_log", "companies", "invites"]) {
    if (created[table].length) await svc.from(table).delete().in("id", created[table]);
  }
}

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, shell: true, stdio: "ignore" });
async function waitForServer() { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error("no server"); }

try {
  const member = await bootstrapMember();
  const { co, comp, ev } = await plant();
  await waitForServer();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const alerts = [];
  const pageErrors = [];
  page.on("dialog", (d) => { alerts.push(d.message()); d.dismiss(); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.fill("#aEmail", member.email);
  await page.fill("#aPass", member.password);
  await page.click("#aSubmit");
  await page.waitForSelector("#app .nav", { timeout: 10000 });

  for (const view of ["dashboard", "companies", "contacts", "competitors", "events", "research", "tasks", "solutions", "reports", "settings"]) {
    await page.click(`[data-nav="${view}"]`);
    await page.waitForTimeout(400);
  }
  const closeDrawer = async () => {
    if (await page.locator("#drawerCloseBtn").count()) await page.locator("#drawerCloseBtn").click();
    await page.waitForSelector("#scrim.open", { state: "detached", timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => !document.getElementById("scrim")?.classList.contains("open"), { timeout: 3000 }).catch(() => {});
  };
  // open each poisoned drawer
  await page.click('[data-nav="companies"]'); await page.waitForTimeout(300);
  await page.locator(`.kcard`).filter({ hasText: "field-co-name" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await closeDrawer();
  await page.click('[data-nav="competitors"]'); await page.waitForTimeout(300);
  await page.locator(".sol-card").filter({ hasText: "field-comp-name" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await closeDrawer();
  await page.click('[data-nav="events"]'); await page.waitForTimeout(300);
  await page.locator(".sol-card").filter({ hasText: "field-ev-name" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await closeDrawer();
  await page.click('[data-nav="solutions"]'); await page.waitForTimeout(300);
  await page.locator(".sol-card").filter({ hasText: "field-prod-name" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await closeDrawer();

  // exported report for the poisoned company
  await page.click('[data-nav="reports"]');
  await page.waitForSelector("#reportCoSelect");
  await page.selectOption("#reportCoSelect", co);
  await page.check('[data-section="notes"]');
  await page.waitForTimeout(300);
  const reportHtml = await page.locator("#reportPreview").evaluate((f) => f.getAttribute("srcdoc"));

  ok(alerts.length === 0, `no alert() fired across every view + drawer (got ${alerts.length}: ${alerts.slice(0, 3).join(" | ")})`);
  ok(pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 2).join(" | ")})`);
  const flagged = await page.evaluate(() => window.__xss);
  ok(!flagged, "no injected script set window.__xss in the app");

  // open the exported report as its own page — must stay inert
  const p2 = await browser.newPage();
  const exAlerts = [];
  p2.on("dialog", (d) => { exAlerts.push(d.message()); d.dismiss(); });
  await p2.goto("data:text/html;charset=utf-8," + encodeURIComponent(reportHtml));
  await p2.waitForTimeout(600);
  ok(exAlerts.length === 0, "the exported report HTML runs no script when opened as a file");
  ok(!(await p2.evaluate(() => window.__xss)), "the exported report set no window.__xss");
  ok(/&lt;script&gt;/.test(reportHtml) && !/<script>window\.__xss/.test(reportHtml), "report escapes <script> (entities, not live tags)");
  await p2.close();

  await browser.close();
} catch (e) {
  console.error("ERROR", e);
  fail++;
} finally {
  server.kill("SIGKILL");
  await cleanup();
}

console.log(`\nxss-test: ${fail === 0 ? "OK" : "FAILED"}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
