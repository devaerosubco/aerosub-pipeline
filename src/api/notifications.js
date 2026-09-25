// Scheduled notifications (addendum items 3+4) — written only by the
// event-alerts-poll Edge Function (service_role); a member may only read
// and dismiss (update read_at on) their own rows. RLS enforces this; this
// module just calls write() like every other api/*.js module.
import { write } from '../api.js';
import { supabase } from '../supabase.js';
import { notificationFromRow } from '../store.js';

export async function listMine() {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map(notificationFromRow);
}

export async function dismiss(id) {
  await write('notifications', 'update', { row: { read_at: new Date().toISOString() }, match: { id } });
}
