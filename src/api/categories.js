// Product & service category taxonomies (V2 Phase 0) — the controlled
// vocabulary the Store catalog (a later phase) will tag items against. Read
// = any member, write = admin only; RLS enforces it, this module just calls
// write() like every other api/*.js module.
import { write } from '../api.js';
import { categoryFromRow } from '../store.js';

const TABLE = { product: 'product_categories', service: 'service_categories' };

export async function create(kind, name) {
  const row = { id: crypto.randomUUID(), name: name.trim() };
  const saved = await write(TABLE[kind], 'insert', { row });
  return categoryFromRow(saved);
}

export async function rename(kind, id, name) {
  await write(TABLE[kind], 'update', { row: { name: name.trim() }, match: { id } });
}

export async function remove(kind, id) {
  await write(TABLE[kind], 'delete', { match: { id } });
}
