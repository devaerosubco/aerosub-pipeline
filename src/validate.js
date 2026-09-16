// Minimal client-side validation, started in HT5 (email/linkedin) and
// extended by later tasks. HT13 owns the full module (caps, enums, url
// normalisation) per PRD §8.3.1 — this is the pattern it builds on.
//
// The core rule: validate only fields the user actually changed in this
// save (validateChanged), never the whole record. The seed has masked/
// non-standard values in some fields (AUDIT §5.8) — editing a contact's
// phone must not fail because their seeded email looks odd.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailRule(v) {
  const s = String(v || '').trim();
  if (s === '') return null; // empty is allowed — "not public"
  return EMAIL_RE.test(s) ? null : 'That doesn’t look like a valid email address.';
}

// Strips a leading http(s):// and www. — every "domain/path, no scheme"
// field in this app is stored this way: contacts.linkedin (PRD §6.6),
// competitors.website, events.website, competitor_campaigns.source_url.
// Never rejects; there's no format to enforce beyond "looks like a path",
// so this only normalises.
export function normalizeUrlish(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (s.endsWith('/') && s.indexOf('/') === s.length - 1) s = s.slice(0, -1); // bare domain, trailing slash only
  return s;
}
// Kept as a named alias — reads better at contact-editing call sites.
export const normalizeLinkedin = normalizeUrlish;

// A link field, checked AFTER normalizeUrlish. Empty is fine. Rejects only
// clearly-broken input (whitespace, or nothing that looks like a domain or
// a path) — deliberately permissive, since the seed carries masked / bare
// values and every member is trusted (AUDIT §5.8, no DB format CHECK).
export function urlRule(v) {
  const s = normalizeUrlish(v);
  if (s === '') return null;
  if (/\s/.test(s)) return 'That doesn’t look like a valid link.';
  if (!/[./]/.test(s)) return 'That doesn’t look like a valid link — include a domain.';
  return null;
}

// An ISO date string (YYYY-MM-DD) or empty. The date <input>s already
// enforce this, so this is a backstop for pasted / imported values.
export function dateRule(v) {
  const s = String(v || '').trim();
  if (s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) {
    return 'Use a date like 2026-09-30.';
  }
  return null;
}

// Compares `after` against `before` key-by-key and only runs the matching
// rule (from `rules`, keyed the same way) on keys whose value actually
// changed. Returns { ok, errors: {field: message} }.
export function validateChanged(before, after, rules) {
  const errors = {};
  for (const key of Object.keys(after)) {
    if (after[key] === before[key]) continue;
    const rule = rules[key];
    if (!rule) continue;
    const msg = rule(after[key]);
    if (msg) errors[key] = msg;
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
