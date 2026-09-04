// Invite management (PRD §5.2 / §7.2). Any member can create, list and revoke.
// The token, consumed_at and consumed_by are set by the DB (default / signup
// trigger) — clients never write them.
import { supabase } from '../supabase.js';

const MAX_DAYS = 30;

// Build the shareable link. If the invite pins an email we append it so the
// signup form can prefill + lock it — an anon visitor can't read the invites
// table to discover that itself.
export function inviteLink({ token, email }) {
  const u = new URL(location.origin);
  u.searchParams.set('invite', token);
  if (email) u.searchParams.set('email', email);
  return u.toString();
}

export async function create({ email, expiresDays } = {}) {
  const { data: s } = await supabase.auth.getSession();
  const uid = s?.session?.user?.id;
  const days = Math.min(Math.max(Math.round(Number(expiresDays) || 7), 1), MAX_DAYS);
  const row = {
    id: crypto.randomUUID(),
    created_by: uid,
    expires_at: new Date(Date.now() + days * 86400000).toISOString(),
  };
  const e = String(email || '').trim().toLowerCase();
  if (e) row.email = e;

  const { data, error } = await supabase
    .from('invites')
    .insert(row)
    .select('id, token, email, created_at, expires_at, consumed_at')
    .single();
  if (error) throw error;
  return data;
}

export async function list() {
  const { data, error } = await supabase
    .from('invites')
    .select('id, token, email, created_at, expires_at, consumed_at, consumed_by')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// No revoked_at column by design (PRD §16 S-13) — revoking == expiring it now,
// which handle_new_user()'s `expires_at > now()` check then rejects.
export async function revoke(id) {
  const { error } = await supabase
    .from('invites')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function inviteStatus(inv) {
  if (inv.consumed_at) return 'used';
  if (new Date(inv.expires_at) <= new Date()) return 'expired';
  return 'active';
}
