// Products & Offers — Aerosub's own catalog (PRD §6.7).
// The company<->product tag join (company_products) lives in
// api/companies.js (tagProduct/untagProduct) — same table, bidirectional
// (PRD §6.8), wired in HT4. The product drawer calls those directly.
import { write } from '../api.js';
import { productToRow, productFromRow } from '../store.js';

export async function create(product) {
  const row = { id: product.id || crypto.randomUUID(), ...productToRow(product) };
  const saved = await write('products', 'insert', { row });
  return productFromRow(saved);
}

// name/tag — E-1.
export async function editIdentity(id, { name, tag }) {
  const row = {};
  if (name !== undefined) row.name = name;
  if (tag !== undefined) row.tag = tag || null;
  await write('products', 'update', { row, match: { id } });
}

export async function setKind(id, kind) {
  await write('products', 'update', { row: { kind }, match: { id } });
}
export async function setStatus(id, status) {
  await write('products', 'update', { row: { status }, match: { id } });
}
export async function setBlurb(id, blurb) {
  await write('products', 'update', { row: { blurb: blurb || null }, match: { id } });
}
export async function setHighlights(id, highlights) {
  await write('products', 'update', { row: { highlights }, match: { id } });
}
export async function remove(id) {
  await write('products', 'delete', { match: { id } }); // company_products cascade in the DB
}

// --- V2 HT-B: Store catalog fields ----------------------------------------
export async function setCategory(id, categoryId) {
  await write('products', 'update', { row: { category_id: categoryId }, match: { id } });
}
export async function setVendor(id, vendorName) {
  await write('products', 'update', { row: { vendor_name: vendorName || null }, match: { id } });
}
export async function setPrice(id, { amount, currency }) {
  await write('products', 'update', { row: { price_amount: amount ?? null, price_currency: currency || 'NGN' }, match: { id } });
}
export async function setOem(id, oem) {
  await write('products', 'update', { row: { oem: !!oem }, match: { id } });
}
export async function setDatasheet(id, datasheetPath) {
  await write('products', 'update', { row: { datasheet_path: datasheetPath || null }, match: { id } });
}
export async function setImages(id, imagePaths) {
  await write('products', 'update', { row: { image_paths: imagePaths }, match: { id } });
}
export async function archive(id) {
  await write('products', 'update', { row: { archived_at: new Date().toISOString() }, match: { id } });
}
export async function unarchive(id) {
  await write('products', 'update', { row: { archived_at: null }, match: { id } });
}
// Plain read-then-write, not an atomic RPC increment — matches this app's
// existing last-write-wins stance everywhere else (V1 PRD §16 S-5); a lost
// increment on a dashboard vanity counter is inconsequential. Caller passes
// the count it already has in DATA.
export async function incrementSearchCount(id, current) {
  await write('products', 'update', { row: { search_count: (current || 0) + 1 }, match: { id } });
}
export async function incrementAddedToQuoteCount(id, current) {
  await write('products', 'update', { row: { added_to_quote_count: (current || 0) + 1 }, match: { id } });
}

// Bulk upload (CSV/XLSX, item 1a) — every row lands as 'Pending Review';
// status is adjusted afterwards from the catalog UI. Rows without a name or
// a resolvable category are skipped by the caller before this is called.
export async function bulkCreate(rows) {
  const payload = rows.map(r => ({
    id: crypto.randomUUID(), ...productToRow({ ...r, status: 'Pending Review' }),
  }));
  const saved = await write('products', 'insert', { row: payload }, { many: true });
  return saved.map(productFromRow);
}
