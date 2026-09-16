// HT12: proves the Chrome extension's data path works against local
// Supabase without a browser — a signed-in member inserts research_clips
// with the anon key + session (exactly what popup.js's saveClip does),
// the offline queue flushes, a signed-out client is denied, and the built
// bundle carries the anon key only.
//   node scripts/ext-save-test.mjs   (needs `supabase start`)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { clipToRow, flushQueue } from "../chrome-extension/clips.js";

for (const line of readFileSync(fileURLToPath(new URL("../.env.test", import.meta.url)), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = "http://127.0.0.1:54324";
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); c ? pass++ : fail++; };

// This test writes real rows; make it self-cleaning so it can run repeatedly
// against a persistent DB (not only right after `db reset`).
const TITLES = ["Ext single clip", "Ext queued A", "Ext queued B", "nope"];
const createdUsers = [];
async function cleanup() {
  await svc.from("research_clips").delete().in("title", TITLES);
  for (const uid of createdUsers) await svc.auth.admin.deleteUser(uid).catch(() => {});
  await svc.from("invites").delete().like("token", "ext-%");
}
await cleanup();

async function bootstrapMember() {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = "ext-" + Date.now();
  const email = `ext-${Date.now()}@example.com`;
  const password = "a-strong-password-1";
  await svc.from("invites").insert({ id: crypto.randomUUID(), token });
  const since = new Date().toISOString();
  await anon.auth.signUp({ email, password, options: { data: { full_name: "Ext User", invite_token: token }, emailRedirectTo: "http://localhost:5173" } });
  let link = null;
  for (let i = 0; i < 25 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
    const hit = list.messages.find((m) => m.To?.some((t) => t.Address === email) && m.Created > since);
    if (hit) { const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json(); const m = (full.Text || "").match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/); if (m) link = m[0]; }
    if (!link) await new Promise((r) => setTimeout(r, 200));
  }
  await fetch(link, { redirect: "manual" });
  // sign in via the same storage-less anon client the popup would use
  const client = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  createdUsers.push(data.session.user.id);
  return { client, userId: data.session.user.id, email };
}

// --- signed-out client cannot insert (must queue) -------------------------
{
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await anon.from("research_clips").insert([clipToRow({ title: "nope" }, null)]);
  ok(!!error, "a signed-out client is denied inserting research_clips (so the popup queues instead)");
}

const member = await bootstrapMember();

// --- signed-in member: a single save --------------------------------------
{
  const row = clipToRow({
    title: "Ext single clip", url: "https://www.example.com/",
    summary: "s", contactName: "Ext Contact", contactEmail: "ext@example.com",
  }, member.userId);
  const { error } = await member.client.from("research_clips").insert([row]);
  ok(!error, "a signed-in member can insert a research_clips row (anon key + session)");
  const { data } = await svc.from("research_clips").select("url, created_by, contact_name").eq("title", "Ext single clip").maybeSingle();
  ok(!!data && data.created_by === member.userId, "the row is attributed to the member (created_by)");
  ok(data.url === "example.com", `the URL was normalised (scheme + www + trailing slash stripped) got=${data.url}`);
}

// --- offline queue flush -------------------------------------------------
{
  const queue = [
    { title: "Ext queued A", url: "https://foo.com/a", capturedAt: "2026-08-01T00:00:00Z" },
    { title: "Ext queued B", contactName: "B", capturedAt: "2026-08-02T00:00:00Z" },
  ];
  const res = await flushQueue(queue, member.userId, async (rows) => {
    const { error } = await member.client.from("research_clips").insert(rows);
    if (error) throw error;
  });
  ok(res.synced === 2 && res.remaining.length === 0, "flushQueue inserts every queued clip and clears the queue");
  const { data } = await svc.from("research_clips").select("title").in("title", ["Ext queued A", "Ext queued B"]);
  ok(data.length === 2, "both queued clips landed in research_clips");
}

// --- the app would see them on its next load ----------------------------
{
  const { data } = await member.client.from("research_clips").select("title").order("captured_at", { ascending: false }).limit(200);
  const titles = data.map((r) => r.title);
  ok(titles.includes("Ext single clip") && titles.includes("Ext queued A"),
    "a member reading research_clips (what the app's store.js does) sees the extension's clips");
}

// --- the built bundle carries the anon key only ------------------------
{
  const bundlePath = fileURLToPath(new URL("../chrome-extension/dist/popup.js", import.meta.url));
  if (!existsSync(bundlePath)) {
    execFileSync("node", [fileURLToPath(new URL("../chrome-extension/build.mjs", import.meta.url))], { stdio: "ignore" });
  }
  const bundle = readFileSync(bundlePath, "utf8");
  const jwts = bundle.match(/eyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}/g) || [];
  const roles = jwts.map((t) => {
    try { return JSON.parse(Buffer.from(t.split(".")[1], "base64").toString()).role; } catch { return "?"; }
  });
  ok(roles.length > 0 && roles.every((r) => r === "anon"), `bundle JWTs are all role:anon (${roles.join(",") || "none"})`);
  ok(!bundle.includes(SERVICE), "the service_role key string is not in the bundle");

  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../chrome-extension/dist/manifest.json", import.meta.url)), "utf8"));
  ok(manifest.manifest_version === 3, "manifest is MV3");
  ok(Array.isArray(manifest.host_permissions) && manifest.host_permissions[0].includes(new URL(URL_).host), "manifest host_permissions target the Supabase origin");
  ok(!!manifest.content_security_policy?.extension_pages, "manifest sets content_security_policy.extension_pages");
}

await cleanup();

console.log(`\next-save-test: ${fail === 0 ? "OK" : "FAILED"}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
