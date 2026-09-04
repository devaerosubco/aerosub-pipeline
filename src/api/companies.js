// Companies (PRD §6.3) + the company<->product tag join (§6.8). HT4 scope:
// identity (E-1), stage, priority, pain points, current solutions, notes,
// delete, and product tags. Contacts/flags stay read-only here until HT5.
import { write } from '../api.js';
import { companyToRow, companyFromRow } from '../store.js';

export async function create(company) {
  const row = { id: company.id, ...companyToRow(company) };
  const saved = await write('companies', 'insert', { row });
  return companyFromRow(saved);
}

export async function updateIdentity(id, { name, type, summary }) {
  const row = {};
  if (name !== undefined) row.name = name;
  if (type !== undefined) row.type = type || null;
  if (summary !== undefined) row.summary = summary || null;
  await write('companies', 'update', { row, match: { id } });
}

export async function setStage(id, stage) {
  await write('companies', 'update', { row: { stage }, match: { id } });
}

export async function setPriority(id, priority) {
  await write('companies', 'update', { row: { priority }, match: { id } });
}

export async function setNotes(id, notes) {
  await write('companies', 'update', { row: { notes: notes || null }, match: { id } });
}

export async function setPainPoints(id, painPoints) {
  await write('companies', 'update', { row: { pain_points: painPoints }, match: { id } });
}

export async function setCurrentSolutions(id, currentSolutions) {
  await write('companies', 'update', { row: { current_solutions: currentSolutions }, match: { id } });
}

export async function remove(id) {
  await write('companies', 'delete', { match: { id } });
}

// Re-tagging a product updates the rationale instead of duplicating the tag
// (E-2) — `unique (company_id, product_id)` + upsert. `id` is deliberately
// left off the row: on a fresh insert the DB default fills it; on a conflict
// update, PostgREST only writes the columns we send, so an existing row's id
// is never disturbed.
export async function tagProduct(companyId, productId, why) {
  await write('company_products', 'upsert', {
    row: { company_id: companyId, product_id: productId, rationale: why || null },
    onConflict: 'company_id,product_id',
  });
}

export async function untagProduct(companyId, productId) {
  await write('company_products', 'delete', { match: { company_id: companyId, product_id: productId } });
}
