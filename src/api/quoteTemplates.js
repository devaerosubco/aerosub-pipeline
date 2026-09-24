// Create tab — uploaded quote/proforma/commercial templates (V2 HT-D).
import { write } from '../api.js';
import { supabase } from '../supabase.js';
import { quoteTemplateToRow, quoteTemplateFromRow } from '../store.js';

export async function listAll() {
  const { data, error } = await supabase.from('quote_templates').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(quoteTemplateFromRow);
}

export async function create(template) {
  const row = { id: template.id || crypto.randomUUID(), ...quoteTemplateToRow(template) };
  const saved = await write('quote_templates', 'insert', { row });
  return quoteTemplateFromRow(saved);
}

export async function rename(id, name) {
  await write('quote_templates', 'update', { row: { name }, match: { id } });
}

export async function setFieldMap(id, fieldMap) {
  await write('quote_templates', 'update', { row: { field_map: fieldMap }, match: { id } });
}

export async function remove(id) {
  await write('quote_templates', 'delete', { match: { id } });
}
