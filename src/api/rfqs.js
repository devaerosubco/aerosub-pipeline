// RFQ Manager (V2 HT-E). list*/get* go straight to supabase (lazy-loaded,
// same reason quotes.js/storeShares.js do this). status/assigned_to are
// deliberately NOT settable through the generic create()/rfqToRow() path —
// see the migration's lock_rfq_admin_fields trigger — setStatus/setAssignee
// below are the only way to touch them, and the DB is the real enforcement
// either way (a non-admin calling them just gets an RLS/trigger error).
import { write } from '../api.js';
import { supabase } from '../supabase.js';
import { rfqToRow, rfqFromRow, rfqItemToRow, rfqItemFromRow } from '../store.js';

export async function listAll() {
  const { data, error } = await supabase.from('rfqs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rfqFromRow);
}

export async function listItems(rfqId) {
  const { data, error } = await supabase.from('rfq_items').select('*').eq('rfq_id', rfqId).order('position', { ascending: true });
  if (error) throw error;
  return (data || []).map(rfqItemFromRow);
}

export async function create(rfq) {
  const row = { id: rfq.id || crypto.randomUUID(), ...rfqToRow(rfq) };
  const saved = await write('rfqs', 'insert', { row });
  return rfqFromRow(saved);
}

export async function setTitle(id, title) { await write('rfqs', 'update', { row: { title }, match: { id } }); }
export async function setReference(id, reference) { await write('rfqs', 'update', { row: { reference: reference || null }, match: { id } }); }
export async function setCompany(id, companyId) { await write('rfqs', 'update', { row: { company_id: companyId || null }, match: { id } }); }
export async function setNotes(id, notes) { await write('rfqs', 'update', { row: { notes: notes || null }, match: { id } }); }
export async function setStatus(id, status) { await write('rfqs', 'update', { row: { status }, match: { id } }); }
export async function setAssignee(id, assignedTo) { await write('rfqs', 'update', { row: { assigned_to: assignedTo || null }, match: { id } }); }

export async function remove(id) {
  await write('rfqs', 'delete', { match: { id } }); // rfq_items cascade in the DB
}

export async function addItem(item) {
  const row = { id: crypto.randomUUID(), ...rfqItemToRow(item) };
  const saved = await write('rfq_items', 'insert', { row });
  return rfqItemFromRow(saved);
}

export async function updateItem(id, patch) {
  const row = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.vendorName !== undefined) row.vendor_name = patch.vendorName || null;
  if (patch.vendorVerified !== undefined) row.vendor_verified = !!patch.vendorVerified;
  if (patch.qty !== undefined) row.qty = patch.qty;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.markupMultiplier !== undefined) row.markup_multiplier = patch.markupMultiplier;
  if (patch.notes !== undefined) row.notes = patch.notes || null;
  if (patch.position !== undefined) row.position = patch.position;
  await write('rfq_items', 'update', { row, match: { id } });
}

export async function removeItem(id) {
  await write('rfq_items', 'delete', { match: { id } });
}

// "Branch" (item 4: "users can create a branch to continue working on the
// RFQ ... or start from base") — clones the RFQ's own fields + every item
// into a fresh draft row, parent_rfq_id pointing back at the original. The
// original is left untouched.
export async function branch(source, items) {
  const cloned = await create({
    title: `${source.title} (branch)`, reference: source.reference, companyId: source.companyId,
    parentRfqId: source.id, notes: source.notes,
  });
  for (const it of items) {
    await addItem({ ...it, rfqId: cloned.id });
  }
  return cloned;
}
