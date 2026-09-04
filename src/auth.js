// Auth surface for the app (PRD §5). Invite-link signup, sign-in, password
// reset, and "who am I" (a profiles row == membership). No roles: the only
// boundary is "has a profile" vs. not.
import { supabase } from './supabase.js';

// GoTrue collapses any handle_new_user() RAISE into a generic "Database error
// saving new user". We never try to parse the reason (PRD §5.2) — one message
// covers every rejection.
export const SIGNUP_FAILED_MESSAGE =
  'Sign-up failed — your invite link may be invalid, expired, or already used. ' +
  'Ask a teammate for a new one.';

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session || null;
}

// cb(event, session). Returns an unsubscribe function.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithInvite({ fullName, email, password, token }) {
  const { data, error } = await supabase.auth.signUp({
    email: String(email || '').trim(),
    password,
    options: {
      data: { full_name: String(fullName || '').trim(), invite_token: token },
      emailRedirectTo: location.origin,
    },
  });
  if (error) {
    const wrapped = new Error(SIGNUP_FAILED_MESSAGE);
    wrapped.cause = error;
    throw wrapped;
  }
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// The current user's own profile row, or null (no row => not a member).
// Filtered by uid because "members read" RLS exposes every profile, so an
// unfiltered single() would blow up once there's more than one member.
export async function myProfile() {
  const { data: s } = await supabase.auth.getSession();
  const uid = s?.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, department')
    .eq('id', uid)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function updateMyProfile({ fullName, department }) {
  const { data: s } = await supabase.auth.getSession();
  const uid = s?.session?.user?.id;
  if (!uid) throw new Error('Not signed in');
  const patch = {};
  if (fullName !== undefined) patch.full_name = String(fullName).trim() || null;
  if (department !== undefined) patch.department = String(department).trim() || null;
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', uid)
    .select('id, email, full_name, department')
    .single();
  if (error) throw error;
  return data;
}

// Everyone with a profile can see the team (Settings), no roles (PRD §3).
export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, department, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
