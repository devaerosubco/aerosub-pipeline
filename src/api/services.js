// Store catalog — services (V2 HT-B). Mirrors api/products.js; the
// company<->service tag join (company_services) lives in api/companies.js
// (tagService/untagService), same split as products/company_products.
import { write } from '../api.js';
import { serviceToRow, serviceFromRow } from '../store.js';

export async function create(service) {
  const row = { id: service.id || crypto.randomUUID(), ...serviceToRow(service) };
  const saved = await write('services', 'insert', { row });
  return serviceFromRow(saved);
}

export async function editIdentity(id, { name }) {
  const row = {};
  if (name !== undefined) row.name = name;
  await write('services', 'update', { row, match: { id } });
}

export async function setCategory(id, categoryId) {
  await write('services', 'update', { row: { category_id: categoryId }, match: { id } });
}
export async function setStatus(id, status) {
  await write('services', 'update', { row: { status }, match: { id } });
}
export async function setBlurb(id, blurb) {
  await write('services', 'update', { row: { blurb: blurb || null }, match: { id } });
}
export async function setHighlights(id, highlights) {
  await write('services', 'update', { row: { highlights }, match: { id } });
}
export async function setPrice(id, { amount, currency }) {
  await write('services', 'update', { row: { price_amount: amount ?? null, price_currency: currency || 'NGN' }, match: { id } });
}
export async function setImages(id, imagePaths) {
  await write('services', 'update', { row: { image_paths: imagePaths }, match: { id } });
}
export async function archive(id) {
  await write('services', 'update', { row: { archived_at: new Date().toISOString() }, match: { id } });
}
export async function unarchive(id) {
  await write('services', 'update', { row: { archived_at: null }, match: { id } });
}
export async function remove(id) {
  await write('services', 'delete', { match: { id } }); // company_services cascade in the DB
}

// Same read-then-write convention as products.js — see the comment there.
export async function incrementSearchCount(id, current) {
  await write('services', 'update', { row: { search_count: (current || 0) + 1 }, match: { id } });
}
export async function incrementAddedToQuoteCount(id, current) {
  await write('services', 'update', { row: { added_to_quote_count: (current || 0) + 1 }, match: { id } });
}

// Bulk upload (CSV/XLSX) — same convention as products.bulkCreate.
export async function bulkCreate(rows) {
  const payload = rows.map(r => ({
    id: crypto.randomUUID(), ...serviceToRow({ ...r, status: 'Pending Review' }),
  }));
  const saved = await write('services', 'insert', { row: payload }, { many: true });
  return saved.map(serviceFromRow);
}
