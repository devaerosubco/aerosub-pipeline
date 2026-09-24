// Create tab — Quotes/Proforma/Commercials + their line items (V2 HT-D).
// list*/get* go straight to supabase (not the DATA-loaded/write() pattern)
// since quotes lazy-load on first Create-tab visit, same reason
// invites.js/storeShares.js do this.
import { write } from '../api.js';
import { supabase } from '../supabase.js';
import { quoteToRow, quoteFromRow, quoteLineItemToRow, quoteLineItemFromRow } from '../store.js';

export async function listAll() {
  const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(quoteFromRow);
}

export async function listLineItems(quoteId) {
  const { data, error } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('position', { ascending: true });
  if (error) throw error;
  return (data || []).map(quoteLineItemFromRow);
}

export async function create(quote) {
  const row = { id: quote.id || crypto.randomUUID(), ...quoteToRow(quote) };
  const saved = await write('quotes', 'insert', { row });
  return quoteFromRow(saved);
}

// Granular setters (not one generic `update`) — same convention as
// api/companies.js — so a partial edit never resets an unrelated column
// back to quoteToRow()'s defaults.
export async function setTemplate(id, templateId) { await write('quotes', 'update', { row: { template_id: templateId || null }, match: { id } }); }
export async function setCompany(id, companyId) { await write('quotes', 'update', { row: { company_id: companyId || null }, match: { id } }); }
export async function setKind(id, kind) { await write('quotes', 'update', { row: { kind }, match: { id } }); }
export async function setQuoteNumber(id, quoteNumber) { await write('quotes', 'update', { row: { quote_number: quoteNumber || null }, match: { id } }); }
export async function setMarkupPercent(id, markupPercent) { await write('quotes', 'update', { row: { markup_percent: markupPercent }, match: { id } }); }
export async function setCurrency(id, currency) { await write('quotes', 'update', { row: { currency }, match: { id } }); }
export async function setNotes(id, notes) { await write('quotes', 'update', { row: { notes: notes || null }, match: { id } }); }

export async function remove(id) {
  await write('quotes', 'delete', { match: { id } }); // quote_line_items cascade in the DB
}

export async function addLineItem(li) {
  const row = { id: crypto.randomUUID(), ...quoteLineItemToRow(li) };
  const saved = await write('quote_line_items', 'insert', { row });
  return quoteLineItemFromRow(saved);
}

export async function updateLineItem(id, patch) {
  const row = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.qty !== undefined) row.qty = patch.qty;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.markupMultiplier !== undefined) row.markup_multiplier = patch.markupMultiplier;
  if (patch.position !== undefined) row.position = patch.position;
  await write('quote_line_items', 'update', { row, match: { id } });
}

export async function removeLineItem(id) {
  await write('quote_line_items', 'delete', { match: { id } });
}
