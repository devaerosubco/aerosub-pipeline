"use strict";

const STORAGE_KEY = "aerosub_clips";

function $(id) { return document.getElementById(id); }

function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + name));
  if (name === "saved") renderSaved();
}

function getClips() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], res => resolve(res[STORAGE_KEY] || []));
  });
}
function setClips(clips) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: clips }, resolve);
  });
}

async function refreshCounts() {
  const clips = await getClips();
  $("savedCount").textContent = clips.length ? `(${clips.length})` : "";
  $("savedCount2").textContent = clips.length;
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
            const metaDesc = document.querySelector('meta[name="description"]');
            const ogDesc = document.querySelector('meta[property="og:description"]');
            const desc = (metaDesc && metaDesc.content) || (ogDesc && ogDesc.content) || "";
            return { selection: sel.slice(0, 500), description: desc.slice(0, 500) };
          },
        });
        if (result) {
          $("summary").value = result.selection || result.description || "";
        }
      } catch (e) {
        // Page may be a restricted URL (chrome://, webstore, etc.) — fine, just skip prefill.
      }
    }
  } catch (e) {
    $("status").textContent = "Couldn't read the current tab.";
  }
}

async function saveClip() {
  const title = $("title").value.trim();
  if (!title) {
    $("status").textContent = "Add a title first.";
    return;
  }
  const clip = {
    title,
    url: $("url").value.trim(),
    summary: $("summary").value.trim(),
    potential: $("potential").value.trim(),
    contactName: $("contactName").value.trim(),
    contactEmail: $("contactEmail").value.trim(),
    contactPhone: $("contactPhone").value.trim(),
    contactLinkedin: $("contactLinkedin").value.trim(),
    capturedAt: new Date().toISOString(),
  };
  const clips = await getClips();
  clips.push(clip);
  await setClips(clips);
  $("status").textContent = "Saved. Switch to the Saved tab to export.";
  $("status").classList.add("ok");
  ["summary", "potential", "contactName", "contactEmail", "contactPhone", "contactLinkedin"].forEach(id => ($(id).value = ""));
  refreshCounts();
}

async function renderSaved() {
  const clips = await getClips();
  const list = $("clipList");
  if (clips.length === 0) {
    list.innerHTML = `<div class="empty">No clips saved yet — capture one first.</div>`;
    return;
  }
  list.innerHTML = clips
    .map(
      (c, i) => `
    <div class="clip">
      <button class="del" data-del="${i}" title="Delete">×</button>
      <div class="t">${escapeHtml(c.title)}</div>
      ${c.url ? `<div class="u">${escapeHtml(c.url)}</div>` : ""}
    </div>`
    )
    .join("");
  list.querySelectorAll("[data-del]").forEach(btn =>
    btn.addEventListener("click", async () => {
      const idx = +btn.dataset.del;
      const cur = await getClips();
      cur.splice(idx, 1);
      await setClips(cur);
      renderSaved();
      refreshCounts();
    })
  );
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function buildExportPayload(clips) {
  return JSON.stringify({ type: "aerosub-research-clips", version: 1, clips }, null, 2);
}

async function exportClips() {
  const clips = await getClips();
  if (clips.length === 0) {
    $("status2").textContent = "Nothing to export yet.";
    return;
  }
  const json = buildExportPayload(clips);
  const dataUrl = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  const filename = `aerosub-research-clips-${new Date().toISOString().slice(0, 10)}.json`;
  chrome.downloads.download({ url: dataUrl, filename, saveAs: true }, () => {
    $("status2").textContent = `Exported ${clips.length} clip(s). Import it from the Research tab.`;
  });
}

async function copyClips() {
  const clips = await getClips();
  if (clips.length === 0) {
    $("status2").textContent = "Nothing to copy yet.";
    return;
  }
  const json = buildExportPayload(clips);
  try {
    await navigator.clipboard.writeText(json);
    $("status2").textContent = `Copied ${clips.length} clip(s) as JSON.`;
  } catch (e) {
    $("status2").textContent = "Copy failed — use Export .json instead.";
  }
}

async function clearClips() {
  if (!confirm("Clear all saved clips? Export first if you still need them.")) return;
  await setClips([]);
  renderSaved();
  refreshCounts();
  $("status2").textContent = "Cleared.";
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  $("saveBtn").addEventListener("click", saveClip);
  $("exportBtn").addEventListener("click", exportClips);
  $("copyBtn").addEventListener("click", copyClips);
  $("clearBtn").addEventListener("click", clearClips);
  prefillFromActiveTab();
  refreshCounts();
});
