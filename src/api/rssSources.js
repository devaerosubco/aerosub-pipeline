// RSS feed connector (V2 HT-H) — the admin-managed source list the
// rss-poll Edge Function reads (PRD-v2 §8). Read = any member, write =
// admin only; RLS enforces it, this module just calls write() like every
// other api/*.js module.
import { write } from '../api.js';
import { rssSourceToRow, rssSourceFromRow } from '../store.js';

export async function create(source) {
  const row = { id: crypto.randomUUID(), ...rssSourceToRow(source) };
  const saved = await write('rss_sources', 'insert', { row });
  return rssSourceFromRow(saved);
}

export async function remove(id) {
  await write('rss_sources', 'delete', { match: { id } });
}
