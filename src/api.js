// Generic write helper (PRD §16 S-4 — no optimistic UI): call Supabase; on
// error return a human reason for the caller to toast and rethrow; on
// success return the row(s) so the caller patches DATA and re-renders.
import { supabase } from './supabase.js';

function isRlsDenied(error) {
  return error && (error.code === '42501' || /row-level security|permission denied/i.test(error.message || ''));
}

export function reason(error) {
  if (!error) return 'Something went wrong.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline — check your connection and try again.";
  }
  if (isRlsDenied(error)) return "You don't have access to do that.";
  if (/JWT|session/i.test(error.message || '')) return 'Your session expired — sign in again.';
  return error.message || 'Something went wrong.';
}

// An RLS denial on a write usually means "you're still logged in but no
// longer a member" (offboarded, or a local DB reset). Fire an event the
// app listens for once, to re-check membership and bounce to the
// no-profile screen instead of leaving a broken session running.
function fail(error) {
  if (isRlsDenied(error) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aerosub:rls-denied'));
  }
  const err = new Error(reason(error));
  err.cause = error;
  return err;
}

// table: e.g. 'companies'. op: 'insert' | 'update' | 'delete' | 'upsert'.
// payload.row: the columns to write. payload.match: {col: value, ...} for
// update/delete. payload.onConflict: comma-separated column list for upsert.
// opts.select: columns to return (default '*'). opts.many: return an array
// instead of a single row (default false).
export async function write(table, op, payload, opts = {}) {
  let q = supabase.from(table);
  if (op === 'insert') {
    q = q.insert(payload.row).select(opts.select || '*');
  } else if (op === 'update') {
    q = q.update(payload.row);
    Object.entries(payload.match).forEach(([k, v]) => { q = q.eq(k, v); });
    q = q.select(opts.select || '*');
  } else if (op === 'upsert') {
    q = q.upsert(payload.row, { onConflict: payload.onConflict }).select(opts.select || '*');
  } else if (op === 'delete') {
    q = q.delete();
    Object.entries(payload.match).forEach(([k, v]) => { q = q.eq(k, v); });
    const { error } = await q;
    if (error) throw fail(error);
    return null;
  } else {
    throw new Error(`api.write: unknown op "${op}"`);
  }
  if (!opts.many) q = q.single();
  const { data, error } = await q;
  if (error) throw fail(error);
  return data;
}
