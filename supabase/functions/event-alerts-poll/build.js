// Pure logic for the event-alerts-poll Edge Function (addendum items 3+4).
// No imports, no Deno/Node-specific globals besides crypto.randomUUID() —
// same reasoning as rss-poll/parse.js: importable and unit-testable
// directly by vitest, with zero runtime-specific code to work around.

// events: rows with {id, name, start_date} ('YYYY-MM-DD' or null).
// todayIso: 'YYYY-MM-DD', passed in rather than read from Date.now()
// internally so tests are deterministic.
export function eventsInWindow(events, windowDays, todayIso) {
  const today = new Date(todayIso + 'T00:00:00');
  return (events || []).filter(e => {
    if (!e.start_date) return false;
    const d = new Date(e.start_date + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return false;
    const days = Math.round((d - today) / 86400000);
    return days >= 0 && days <= windowDays;
  });
}

// One candidate notification row per (opted-in user) x (upcoming event).
// Rows are upserted with onConflict 'user_id,ref_type,ref_id' +
// ignoreDuplicates -- an already-existing (user, event) pair is silently
// skipped, not recreated, so re-polling never resurrects a dismissed
// notification (read_at is never touched by a conflicting upsert).
export function buildNotificationRows(users, events) {
  const rows = [];
  for (const u of users || []) {
    for (const e of events) {
      rows.push({
        id: crypto.randomUUID(),
        user_id: u.id,
        kind: 'event_alert',
        title: `Upcoming: ${e.name}`,
        body: e.start_date ? `Starts ${e.start_date}` : null,
        ref_type: 'event',
        ref_id: e.id,
      });
    }
  }
  return rows;
}

// Groups the rows the upsert actually inserted (genuinely new, per
// ignoreDuplicates) by user_id, for a one-email-per-user digest instead of
// one per event.
export function groupByUser(insertedRows) {
  const byUser = new Map();
  for (const n of insertedRows || []) {
    if (!byUser.has(n.user_id)) byUser.set(n.user_id, []);
    byUser.get(n.user_id).push(n);
  }
  return byUser;
}
