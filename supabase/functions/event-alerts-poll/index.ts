// Addendum items 3+4: true scheduled event-alert notifications (not just
// the client-side, on-load-only bell HT-H shipped) + the delivery
// mechanism per-item dismissal rides on. Scheduled on pg_cron
// (20260925150002_notifications_cron.sql, every 6h, same cadence as
// rss-poll); can also be invoked directly for a manual run.
//
// .ts, not .js, for the same reason as rss-poll/index.ts: the Supabase CLI's
// function discovery specifically requires that filename (confirmed
// locally while building rss-poll — an index.js was silently invisible to
// `supabase functions serve`). No actual TypeScript syntax is used here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { eventsInWindow, buildNotificationRows, groupByUser } from './build.js';

// Keep in sync with src/main.js's EVENT_ALERT_WINDOW_DAYS — both express
// the same "how far ahead do we warn about an event" policy.
const WINDOW_DAYS = 30;

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const [{ data: users, error: uErr }, { data: events, error: eErr }] = await Promise.all([
    supabase.from('profiles').select('id, email').eq('event_alerts_enabled', true),
    supabase.from('events').select('id, name, start_date'),
  ]);
  if (uErr || eErr) {
    return new Response(JSON.stringify({ error: (uErr || eErr).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = eventsInWindow(events, WINDOW_DAYS, today);
  const candidateRows = buildNotificationRows(users, upcoming);

  let inserted = [];
  if (candidateRows.length) {
    // ignoreDuplicates -> ON CONFLICT DO NOTHING: a (user, event) pair
    // that already has a notification is skipped entirely, not touched —
    // read_at (the dismiss flag) survives a re-poll untouched, and
    // .select() only returns the rows that were genuinely just inserted.
    const { data, error: upsertErr } = await supabase.from('notifications')
      .upsert(candidateRows, { onConflict: 'user_id,ref_type,ref_id', ignoreDuplicates: true })
      .select('id, user_id, title, body');
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    inserted = data || [];
  }

  // Best-effort email digest, one per user, only for genuinely-new alerts.
  // RESEND_API_KEY is an Edge Function secret (`supabase secrets set
  // RESEND_API_KEY=...`), a different bootstrap mechanism than the Vault
  // secrets rss-poll's cron job reads — deliberately: this key only needs
  // to exist inside this function's own runtime, never inside Postgres.
  // Absent locally by default, so this stays a graceful no-op in dev.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailErrors = [];
  let emailsSent = 0;
  if (resendKey && inserted.length) {
    const userById = new Map((users || []).map(u => [u.id, u]));
    for (const [userId, notifs] of groupByUser(inserted)) {
      const u = userById.get(userId);
      if (!u?.email) continue;
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Aerosub Pipeline <alerts@send.aerosub.co>',
            to: u.email,
            subject: `${notifs.length} upcoming event${notifs.length === 1 ? '' : 's'}`,
            text: notifs.map(n => `${n.title}${n.body ? ' — ' + n.body : ''}`).join('\n'),
          }),
        });
        if (res.ok) emailsSent++;
        else emailErrors.push({ userId, status: res.status });
      } catch (e) {
        emailErrors.push({ userId, message: e.message || String(e) });
      }
    }
  }

  return new Response(
    JSON.stringify({
      usersChecked: (users || []).length,
      eventsInWindow: upcoming.length,
      notificationsCreated: inserted.length,
      emailsSent,
      emailErrors,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
