// Members-only Store sharing (V2 HT-C, PRD-v2 §3). Every member can already
// read every product/service (flat RLS, unchanged) — sharing is a pointer +
// a "Shared with me" inbox, not a new access grant, so this deliberately
// does not go through the generic api.js `write()` helper (that's for the
// DATA-loaded entities; shares are fetched lazily, same reason invites.js
// talks to supabase directly instead).
import { supabase } from '../supabase.js';

// A deep link that lands a signed-in member straight on this item — works
// only for someone who's already a member (the auth gate still applies), so
// it can't reintroduce the no-login access deferred in PRD-v2 §0.
export function shareLink(itemType, itemId) {
  const u = new URL(location.origin);
  u.searchParams.set('store', `${itemType}:${itemId}`);
  return u.toString();
}

// Plain insert, not upsert: the table has no UPDATE policy (a share is
// immutable — see the migration), and the UI never offers an already-shared
// teammate as an option, so the unique constraint is a backstop, not a path
// this ever actually needs to update-on-conflict through.
export async function share(itemType, itemId, sharedById, sharedWithId, note) {
  const row = {
    id: crypto.randomUUID(), item_type: itemType, item_id: itemId,
    shared_by: sharedById, shared_with: sharedWithId, note: note || null,
  };
  const { data, error } = await supabase
    .from('store_item_shares').insert(row)
    .select('id, item_type, item_id, shared_by, shared_with, note, created_at').single();
  if (error) throw error;
  return data;
}

export async function revoke(id) {
  const { error } = await supabase.from('store_item_shares').delete().eq('id', id);
  if (error) throw error;
}

export async function listForItem(itemType, itemId) {
  const { data, error } = await supabase
    .from('store_item_shares').select('id, shared_by, shared_with, note, created_at')
    .eq('item_type', itemType).eq('item_id', itemId);
  if (error) throw error;
  return data || [];
}

// Every share where I'm the recipient — the "Shared with me" filter's data.
export async function listSharedWithMe(myId) {
  const { data, error } = await supabase
    .from('store_item_shares').select('id, item_type, item_id, shared_by, created_at')
    .eq('shared_with', myId);
  if (error) throw error;
  return data || [];
}
