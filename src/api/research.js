// Research clips (PRD §6.12). Loaded most-recent-200 by store.js with a
// "load older" path (S-2). `created_by` is attribution only — the RLS
// insert policy allows any member; it doesn't gate on it.
import { write } from '../api.js';
import { researchFromRow } from '../store.js';
import { normalizeUrlish } from '../validate.js';

function toRow(clip) {
  return {
    title: clip.title,
    url: clip.url ? normalizeUrlish(clip.url) : null,
    captured_at: clip.capturedAt || new Date().toISOString(),
    summary: clip.summary || null,
    potential: clip.potential || null,
    contact_name: clip.contactName || null,
    contact_email: clip.contactEmail || null,
    contact_phone: clip.contactPhone || null,
    contact_linkedin: clip.contactLinkedin ? normalizeUrlish(clip.contactLinkedin) : null,
    company_id: clip.companyId || null,
  };
}

export async function create(clip, createdBy) {
  const row = { id: clip.id || crypto.randomUUID(), created_by: createdBy || null, ...toRow(clip) };
  const saved = await write('research_clips', 'insert', { row });
  return researchFromRow(saved);
}

// Only writes the app-shape keys present in `patch`.
export async function update(id, patch) {
  const row = {};
  if ('title' in patch) row.title = patch.title;
  if ('url' in patch) row.url = patch.url ? normalizeUrlish(patch.url) : null;
  if ('summary' in patch) row.summary = patch.summary || null;
  if ('potential' in patch) row.potential = patch.potential || null;
  if ('contactName' in patch) row.contact_name = patch.contactName || null;
  if ('contactEmail' in patch) row.contact_email = patch.contactEmail || null;
  if ('contactPhone' in patch) row.contact_phone = patch.contactPhone || null;
  if ('contactLinkedin' in patch) row.contact_linkedin = patch.contactLinkedin ? normalizeUrlish(patch.contactLinkedin) : null;
  if ('companyId' in patch) row.company_id = patch.companyId || null;
  const saved = await write('research_clips', 'update', { row, match: { id } });
  return researchFromRow(saved);
}

export async function linkCompany(id, companyId) {
  const saved = await write('research_clips', 'update', { row: { company_id: companyId || null }, match: { id } });
  return researchFromRow(saved);
}

export async function remove(id) {
  await write('research_clips', 'delete', { match: { id } });
}

// Bulk insert from a Chrome-extension JSON export. Skips entries without a
// title; returns the saved rows (empty array if nothing was valid).
export async function importClips(clips, createdBy) {
  const rows = (Array.isArray(clips) ? clips : [])
    .filter(c => c && c.title)
    .map(c => ({ id: crypto.randomUUID(), created_by: createdBy || null, ...toRow(c) }));
  if (!rows.length) return [];
  const saved = await write('research_clips', 'insert', { row: rows }, { many: true });
  return saved.map(researchFromRow);
}
