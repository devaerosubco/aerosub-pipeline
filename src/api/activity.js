// Activity log (PRD §6.17). Append-only, member-attributed. Insert +
// select + delete for members, NEVER update (RLS has no update policy).
// D-2: "Clear log" is allowed (no role model) and the log is not
// tamper-evident — accepted.
import { write } from '../api.js';
import { supabase } from '../supabase.js';

// Fire-and-forget: a failed audit line must never break the action it was
// recording. Caller passes the actor's own profile id + a name snapshot.
export async function log(actorId, actorName, action, detail) {
  try {
    await write('activity_log', 'insert', {
      row: {
        id: crypto.randomUUID(),
        actor_id: actorId || null,
        actor_name: actorName || null,
        action: String(action || '').slice(0, 200),
        detail: detail ? String(detail).slice(0, 500) : null,
      },
    }, { select: 'id' });
  } catch (e) {
    // swallow
  }
}

export async function clearAll() {
  // PostgREST requires a filter on delete; id is a non-empty text PK so
  // this matches every row.
  const { error } = await supabase.from('activity_log').delete().neq('id', '');
  if (error) throw error;
}
