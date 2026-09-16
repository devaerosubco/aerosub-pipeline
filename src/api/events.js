// Events (PRD §6.13) + their attendee list (§6.14).
import { write } from '../api.js';
import { eventToRow, eventFromRow, attendeeToRow, attendeeFromRow } from '../store.js';

export async function create(event) {
  const row = { id: event.id, ...eventToRow(event) };
  const saved = await write('events', 'insert', { row });
  return eventFromRow(saved);
}

// The drawer's "Save details" block: name/organizer/location/dates/cost/website.
// Only keys present in `patch` are written; `name` is NOT NULL so it's never
// nulled (the caller already guards against an empty name).
export async function editDetails(id, patch) {
  const cols = {
    name: 'name', organizer: 'organizer', location: 'location',
    startDate: 'start_date', endDate: 'end_date', cost: 'cost', website: 'website',
  };
  const row = {};
  for (const [k, col] of Object.entries(cols)) {
    if (patch[k] === undefined) continue;
    row[col] = col === 'name' ? patch[k] : (patch[k] || null);
  }
  if (Object.keys(row).length) await write('events', 'update', { row, match: { id } });
}

export async function setNotes(id, notes) {
  await write('events', 'update', { row: { notes: notes || null }, match: { id } });
}

// `benefits` is a text[] column, written whole with its parent (PRD §16 S-7).
export async function setBenefits(id, benefits) {
  await write('events', 'update', { row: { benefits: benefits || [] }, match: { id } });
}

export async function remove(id) {
  await write('events', 'delete', { match: { id } }); // attendees cascade in the DB
}

export async function addAttendee(eventId, attendee) {
  const row = { id: crypto.randomUUID(), event_id: eventId, ...attendeeToRow(attendee) };
  const saved = await write('event_attendees', 'insert', { row });
  return attendeeFromRow(saved);
}
export async function removeAttendee(id) {
  await write('event_attendees', 'delete', { match: { id } });
}
