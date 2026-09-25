// Contacts (PRD §6.6). A contact always belongs to a company (company_id
// not null, cascades on company delete) — there's no standalone contact.
import { write } from '../api.js';
import { contactToRow, contactFromRow } from '../store.js';

export async function create(companyId, ct) {
  const row = { id: ct.id || crypto.randomUUID(), company_id: companyId, ...contactToRow(ct) };
  const saved = await write('contacts', 'insert', { row });
  return contactFromRow(saved);
}

// CSV bulk upload. Each row already carries its own companyId (the caller
// resolves/creates companies by name first — contacts.company_id is not
// null, so every row needs one before this runs).
export async function bulkCreate(rows) {
  const payload = rows.map(r => ({ id: crypto.randomUUID(), company_id: r.companyId, ...contactToRow(r) }));
  const saved = await write('contacts', 'insert', { row: payload }, { many: true });
  return saved.map(contactFromRow);
}

// `patch` uses the app-shape field names (pos/nextFollowUp/…) — only the
// keys present are written (PRD §8.3.1, "changed fields only"), so a save
// that only touched the phone number never blanks out name/position/etc.
export async function update(id, patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('pos' in patch) row.position = patch.pos || null;
  if ('email' in patch) row.email = patch.email || null;
  if ('phone' in patch) row.phone = patch.phone || null;
  if ('linkedin' in patch) row.linkedin = patch.linkedin || null;
  if ('verified' in patch) row.verified = !!patch.verified;
  if ('nextFollowUp' in patch) row.next_follow_up = patch.nextFollowUp || null;
  if ('lastContact' in patch) row.last_contact = patch.lastContact || null;
  const saved = await write('contacts', 'update', { row, match: { id } });
  return contactFromRow(saved);
}

export async function remove(id) {
  await write('contacts', 'delete', { match: { id } });
}

export async function markContacted(id, dateIso) {
  const saved = await write('contacts', 'update', { row: { last_contact: dateIso }, match: { id } });
  return contactFromRow(saved);
}

export async function setFollowUp(id, dateIso) {
  const saved = await write('contacts', 'update', { row: { next_follow_up: dateIso || null }, match: { id } });
  return contactFromRow(saved);
}
