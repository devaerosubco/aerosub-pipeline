// News feed (PRD §6.15). `dismiss` soft-deletes team-wide (D-5, replaces the
// old per-browser `dismissedNewsIds` array) — the item just never comes back
// from store.js's loadAll()/refetchView() once dismissed_at is set.
import { write } from '../api.js';
import { newsToRow, newsFromRow } from '../store.js';

export async function create(news) {
  const row = { id: crypto.randomUUID(), ...newsToRow(news), live: false };
  const saved = await write('news_items', 'insert', { row });
  return newsFromRow(saved);
}

export async function dismiss(id, actorId) {
  await write('news_items', 'update', {
    row: { dismissed_at: new Date().toISOString(), dismissed_by: actorId || null },
    match: { id },
  });
}

export async function remove(id) {
  await write('news_items', 'delete', { match: { id } });
}
