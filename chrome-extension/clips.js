// Pure clip logic — no chrome.* / DOM, so it's unit-testable (see
// clips.test.js). The extension writes directly to the same research_clips
// table the app reads (PRD §11.3).

// Strip a leading scheme + www. — research_clips.url is stored scheme-less,
// matching the app's normalizeUrlish.
export function normalizeUrl(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (s.endsWith('/') && s.indexOf('/') === s.length - 1) s = s.slice(0, -1);
  return s;
}

// One saved clip { title, url, summary, potential, contactName, contactEmail,
// contactPhone, contactLinkedin, capturedAt } -> a research_clips row.
export function clipToRow(clip, createdBy) {
  return {
    id: (clip && clip.id) || crypto.randomUUID(),
    title: String(clip.title || '').trim(),
    url: clip.url ? normalizeUrl(clip.url) : null,
    captured_at: clip.capturedAt || new Date().toISOString(),
    summary: clip.summary ? String(clip.summary).trim() : null,
    potential: clip.potential ? String(clip.potential).trim() : null,
    contact_name: clip.contactName ? String(clip.contactName).trim() : null,
    contact_email: clip.contactEmail ? String(clip.contactEmail).trim() : null,
    contact_phone: clip.contactPhone ? String(clip.contactPhone).trim() : null,
    contact_linkedin: clip.contactLinkedin ? normalizeUrl(clip.contactLinkedin) : null,
    company_id: null,
    created_by: createdBy || null,
  };
}

export function isValidClip(clip) {
  return !!(clip && String(clip.title || '').trim());
}

// Try to push every queued clip. `insertRows(rows)` should resolve on
// success and reject on failure (offline / signed out / RLS). All-or-
// nothing per flush: on success the queue is emptied, on failure it's kept
// intact. (Titleless entries can't reach the queue — saveClip requires a
// title — but are filtered here defensively and dropped on success.)
export async function flushQueue(queue, createdBy, insertRows) {
  const valid = (queue || []).filter(isValidClip);
  if (!valid.length) return { synced: 0, remaining: [] };
  const rows = valid.map((c) => clipToRow(c, createdBy));
  try {
    await insertRows(rows);
    return { synced: valid.length, remaining: [] };
  } catch (e) {
    return { synced: 0, remaining: queue || [], error: e };
  }
}
