"use strict";
// Bundled by chrome-extension/build.mjs (Vite lib mode -> dist/popup.js, an
// IIFE with @supabase/supabase-js inlined). Anon key + user session only,
// exactly like the web app (PRD §11). No signup here — an MV3 popup can't
// receive the email-confirm redirect.
import { createClient } from "@supabase/supabase-js";
import { clipToRow, flushQueue, isValidClip } from "./clips.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const QUEUE_KEY = "aerosub_clips";

// chrome.storage.local as the supabase-js auth store (persists the session
// across popup opens; a popup's own window storage is wiped each close).
const chromeStorage = {
  getItem: (k) => new Promise((res) => chrome.storage.local.get([k], (r) => res(r[k] ?? null))),
  setItem: (k, v) => new Promise((res) => chrome.storage.local.set({ [k]: v }, res)),
  removeItem: (k) => new Promise((res) => chrome.storage.local.remove([k], res)),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: chromeStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const getQueue = () => new Promise((res) => chrome.storage.local.get([QUEUE_KEY], (r) => res(r[QUEUE_KEY] || [])));
const setQueue = (q) => new Promise((res) => chrome.storage.local.set({ [QUEUE_KEY]: q }, res));

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
  if (name === "saved") renderSaved();
}

/* ---------- session / account panel ---------- */

async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

async function renderAccount() {
  const user = await currentUser();
  $("acctSignedOut").style.display = user ? "none" : "block";
  $("acctSignedIn").style.display = user ? "block" : "none";
  if (user) $("acctEmail").textContent = user.email || "(signed in)";
  $("signedOutHint").style.display = user ? "none" : "block";
  await refreshCounts();
  return user;
}

async function doSignIn() {
  const email = $("acctEmailInput").value.trim();
  const password = $("acctPasswordInput").value;
  if (!email || !password) { $("acctStatus").textContent = "Enter your email and password."; return; }
  $("signInBtn").disabled = true;
  $("acctStatus").textContent = "Signing in…";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $("signInBtn").disabled = false;
  if (error) {
    $("acctStatus").textContent = /invalid login/i.test(error.message)
      ? "Wrong email or password."
      : /email not confirmed/i.test(error.message)
      ? "Confirm your email first (check your inbox)."
      : (error.message || "Could not sign in.");
    return;
  }
  $("acctStatus").textContent = "";
  $("acctPasswordInput").value = "";
  await renderAccount();
  const flushed = await syncQueue();
  switchTab("capture");
  if (flushed > 0) setStatus($("status"), `Signed in — synced ${flushed} queued clip${flushed === 1 ? "" : "s"}.`, true);
}

async function doSignOut() {
  await supabase.auth.signOut();
  await renderAccount();
  switchTab("account");
}

/* ---------- capture / save ---------- */

function setStatus(el, msg, ok) {
  el.textContent = msg;
  el.classList.toggle("ok", !!ok);
}

async function prefillFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    $("title").value = tab.title || "";
    $("url").value = (tab.url || "").replace(/^https?:\/\//, "");
    if (tab.id && /^https?:/.test(tab.url || "")) {
      try {
        const [{ result } = {}] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const sel = window.getSelection ? window.getSelection().toString().trim() : "";
            const md = document.querySelector('meta[name="description"]');
            const og = document.querySelector('meta[property="og:description"]');
            const desc = (md && md.content) || (og && og.content) || "";
            return { selection: sel.slice(0, 500), description: desc.slice(0, 500) };
          },
        });
        if (result) $("summary").value = result.selection || result.description || "";
      } catch { /* restricted page — fine */ }
    }
  } catch { $("status").textContent = "Couldn't read the current tab."; }
}

function readClipForm() {
  return {
    title: $("title").value.trim(),
    url: $("url").value.trim(),
    summary: $("summary").value.trim(),
    potential: $("potential").value.trim(),
    contactName: $("contactName").value.trim(),
    contactEmail: $("contactEmail").value.trim(),
    contactPhone: $("contactPhone").value.trim(),
    contactLinkedin: $("contactLinkedin").value.trim(),
    capturedAt: new Date().toISOString(),
  };
}

function clearClipForm() {
  ["summary", "potential", "contactName", "contactEmail", "contactPhone", "contactLinkedin"].forEach((id) => ($(id).value = ""));
}

async function enqueue(clip) {
  const q = await getQueue();
  q.push(clip);
  await setQueue(q);
}

async function saveClip() {
  const clip = readClipForm();
  if (!isValidClip(clip)) { setStatus($("status"), "Add a title first.", false); return; }

  const user = await currentUser();
  if (!user) {
    await enqueue(clip);
    setStatus($("status"), "Not signed in — saved to the queue. Sign in to sync.", true);
    clearClipForm(); refreshCounts();
    return;
  }

  $("saveBtn").disabled = true;
  const { error } = await supabase.from("research_clips").insert([clipToRow(clip, user.id)]);
  $("saveBtn").disabled = false;

  if (error) {
    await enqueue(clip);
    setStatus($("status"), "Couldn't reach the server — saved to the queue, will sync later.", true);
  } else {
    setStatus($("status"), "Saved to Research.", true);
  }
  clearClipForm(); refreshCounts();
}

/* ---------- queue: sync / list / export ---------- */

async function syncQueue() {
  const user = await currentUser();
  if (!user) return 0;
  const q = await getQueue();
  if (!q.length) return 0;
  const res = await flushQueue(q, user.id, async (rows) => {
    const { error } = await supabase.from("research_clips").insert(rows);
    if (error) throw error;
  });
  await setQueue(res.remaining);
  await refreshCounts();
  return res.synced;
}

async function refreshCounts() {
  const q = await getQueue();
  $("savedCount").textContent = q.length ? `(${q.length})` : "";
  $("savedCount2").textContent = q.length;
}

async function renderSaved() {
  const q = await getQueue();
  const list = $("clipList");
  const user = await currentUser();
  $("syncNowBtn").style.display = user && q.length ? "block" : "none";
  $("syncHint").style.display = !user && q.length ? "block" : "none";
  if (q.length === 0) { list.innerHTML = `<div class="empty">Nothing queued — clips save straight to Research when you're signed in.</div>`; return; }
  list.innerHTML = q.map((c, i) => `
    <div class="clip">
      <button class="del" data-del="${i}" title="Remove from queue">×</button>
      <div class="t">${escapeHtml(c.title)}</div>
      ${c.url ? `<div class="u">${escapeHtml(c.url)}</div>` : ""}
    </div>`).join("");
  list.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
    const cur = await getQueue();
    cur.splice(+btn.dataset.del, 1);
    await setQueue(cur);
    renderSaved(); refreshCounts();
  }));
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function buildExportPayload(clips) {
  return JSON.stringify({ type: "aerosub-research-clips", version: 1, clips }, null, 2);
}
async function exportClips() {
  const q = await getQueue();
  if (!q.length) { $("status2").textContent = "Nothing in the queue to export."; return; }
  const json = buildExportPayload(q);
  const dataUrl = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  chrome.downloads.download({ url: dataUrl, filename: `aerosub-research-clips-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true },
    () => { $("status2").textContent = `Exported ${q.length} clip(s). Import from the Research tab.`; });
}
async function copyClips() {
  const q = await getQueue();
  if (!q.length) { $("status2").textContent = "Nothing in the queue to copy."; return; }
  try { await navigator.clipboard.writeText(buildExportPayload(q)); $("status2").textContent = `Copied ${q.length} clip(s) as JSON.`; }
  catch { $("status2").textContent = "Copy failed — use Export .json instead."; }
}
async function clearClips() {
  if (!confirm("Clear the queue? Export first if you still need these.")) return;
  await setQueue([]);
  renderSaved(); refreshCounts();
  $("status2").textContent = "Queue cleared.";
}

/* ---------- boot ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  $("saveBtn").addEventListener("click", saveClip);
  $("signInBtn").addEventListener("click", doSignIn);
  $("acctPasswordInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doSignIn(); });
  $("signOutBtn").addEventListener("click", doSignOut);
  $("syncNowBtn").addEventListener("click", async () => {
    const n = await syncQueue();
    $("status2").textContent = n > 0 ? `Synced ${n} clip(s) to Research.` : "Nothing synced — check your connection.";
    renderSaved();
  });
  $("exportBtn").addEventListener("click", exportClips);
  $("copyBtn").addEventListener("click", copyClips);
  $("clearBtn").addEventListener("click", clearClips);

  const user = await renderAccount();
  if (!user) switchTab("account"); // signed out: show sign-in first, don't land on the capture form
  await prefillFromActiveTab();
  syncQueue(); // best-effort flush on open
});
