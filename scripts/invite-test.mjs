// Invite / signup test matrix (PRD §14, HT2 acceptance criteria).
// Drives real signups against local Supabase + the Mailpit catch-all mailbox
// (no browser needed — GoTrue's REST API + the confirm/recovery links).
// Run: node scripts/invite-test.mjs   (needs `supabase start` + a seeded/reset DB)
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// load .env.test
for (const line of readFileSync(fileURLToPath(new URL('../.env.test', import.meta.url)), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = 'http://127.0.0.1:54324';

let pass = 0, fail = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); cond ? pass++ : fail++; };

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const freshClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

const uniq = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function insertInvite(overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    token: uniq('tok'),
    ...overrides,
  };
  const { data, error } = await svc.from('invites').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function signup({ token, email, password = 'a-strong-password-1', fullName = 'Test User' }) {
  const client = freshClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, invite_token: token }, emailRedirectTo: 'http://localhost:5173' },
  });
  return { client, data, error };
}

// Poll Mailpit for the newest message to `email`, return its plaintext body.
async function waitForMail(email, { timeoutMs = 4000, sinceIso = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
    const list = await res.json();
    const hit = list.messages.find(m =>
      m.To?.some(t => t.Address === email) && (!sinceIso || m.Created > sinceIso));
    if (hit) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json();
      return full.Text || '';
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

function extractLink(text) {
  const m = text && text.match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/);
  return m ? m[0] : null;
}

// Follow a GoTrue verify link without a browser; parse the tokens out of the
// redirect's URL fragment (GoTrue puts them in `#access_token=...` even
// though the client itself uses PKCE for the initial signUp call).
async function followVerifyLink(link) {
  const res = await fetch(link, { redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  const hash = loc.split('#')[1] || '';
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    error: params.get('error_description'),
  };
}

async function main() {
  const startIso = new Date().toISOString();

  // --- A. no invite token -----------------------------------------------
  {
    const email = uniq('a') + '@example.com';
    const { error } = await signup({ token: undefined, email });
    ok(!!error, 'signup with no invite token -> rejected');
  }

  // --- B. garbage / unknown token -----------------------------------------
  {
    const email = uniq('b') + '@example.com';
    const { error } = await signup({ token: 'not-a-real-token', email });
    ok(!!error, 'signup with an unknown token -> rejected');
  }

  // --- C. expired token -----------------------------------------------------
  {
    const now = new Date();
    const inv = await insertInvite({
      created_at: new Date(now - 2 * 86400000).toISOString(),
      expires_at: new Date(now - 3600000).toISOString(), // 1h in the past
    });
    const email = uniq('c') + '@example.com';
    const { error } = await signup({ token: inv.token, email });
    ok(!!error, 'signup with an expired token -> rejected');
  }

  // --- D. email-mismatched token --------------------------------------------
  {
    const inv = await insertInvite({ email: 'pinned@example.com' });
    const email = uniq('d') + '@example.com'; // deliberately not pinned@example.com
    const { error } = await signup({ token: inv.token, email });
    ok(!!error, 'signup with an email-mismatched token -> rejected');
  }

  // --- E. revoked token (revoke == expire now, PRD §16 S-13) ----------------
  {
    const inv = await insertInvite({});
    const { error: revokeErr } = await svc.from('invites').update({ expires_at: new Date().toISOString() }).eq('id', inv.id);
    if (revokeErr) throw revokeErr;
    const email = uniq('e') + '@example.com';
    const { error } = await signup({ token: inv.token, email });
    ok(!!error, 'signup with a revoked token -> rejected');
  }

  // --- F. >30 day expiry is DB-rejected (CHECK constraint) ------------------
  {
    const now = new Date();
    const { error } = await svc.from('invites').insert({
      id: crypto.randomUUID(), token: uniq('over'),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 31 * 86400000).toISOString(),
    });
    ok(!!error, '>30 day invite expiry -> CHECK constraint rejects the insert');
  }

  // --- G. consumed token cannot be reused ------------------------------------
  let consumedCase;
  {
    const inv = await insertInvite({});
    const email1 = uniq('g1') + '@example.com';
    const first = await signup({ token: inv.token, email: email1, fullName: 'First User' });
    ok(!first.error, 'first signup on a fresh token -> accepted');

    const email2 = uniq('g2') + '@example.com';
    const second = await signup({ token: inv.token, email: email2 });
    ok(!!second.error, 'reusing an already-consumed token -> rejected');
    consumedCase = { inv, email: email1 };
  }

  // --- H. valid signup end-to-end: confirm, profile row, invite consumed ----
  let member; // { client, email, password, userId }
  {
    const inv = await insertInvite({});
    const email = uniq('h') + '@example.com';
    const password = 'a-strong-password-2';
    const { error: suErr } = await signup({ token: inv.token, email, password, fullName: 'Valid Member' });
    ok(!suErr, 'valid signup -> accepted');

    const mail = await waitForMail(email, { sinceIso: startIso });
    const link = extractLink(mail || '');
    ok(!!link, 'a confirmation email with a verify link arrived at Mailpit');

    const { access_token, refresh_token, error: linkErr } = await followVerifyLink(link);
    ok(!!access_token && !linkErr, 'the confirm link resolves to a session (email confirmed)');

    const client = freshClient();
    const { data: setData, error: setErr } = await client.auth.setSession({ access_token, refresh_token });
    ok(!setErr, 'the confirmed session can be adopted client-side');
    const userId = setData?.session?.user?.id;

    const { data: prof, error: profErr } = await client.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle();
    ok(!profErr && prof && prof.full_name === 'Valid Member' && prof.email === email,
      'profiles row exists with the signed-up full_name and email');

    const { data: invRow } = await svc.from('invites').select('consumed_at, consumed_by').eq('id', inv.id).single();
    ok(!!invRow.consumed_at && invRow.consumed_by === userId, 'the invite is marked consumed by the new member');

    // BYPASSRLS / no-recursion check: a member reading `profiles` (the policy
    // itself calls is_member(), which selects profiles) must not error.
    const { error: selErr } = await client.from('profiles').select('id').limit(5);
    ok(!selErr, 'a member can select from profiles with no infinite-recursion error');

    member = { client, email, password, userId };
  }

  // --- I. concurrent redemption of one open (non-pinned) token --------------
  {
    const inv = await insertInvite({});
    const emailX = uniq('race-x') + '@example.com';
    const emailY = uniq('race-y') + '@example.com';
    const [rx, ry] = await Promise.all([
      signup({ token: inv.token, email: emailX, fullName: 'Racer X' }),
      signup({ token: inv.token, email: emailY, fullName: 'Racer Y' }),
    ]);
    const outcomes = [rx.error, ry.error];
    const winners = outcomes.filter(e => !e).length;
    const losers = outcomes.filter(e => !!e).length;
    ok(winners === 1 && losers === 1, `concurrent redemption -> exactly one winner (winners=${winners}, losers=${losers})`);

    const { data: invRow } = await svc.from('invites').select('consumed_at, consumed_by').eq('id', inv.id).single();
    ok(!!invRow.consumed_at, 'the raced invite ends up consumed exactly once');
  }

  // --- J. password reset + set-new-password, end to end ---------------------
  {
    const resetStart = new Date().toISOString();
    const anon = freshClient();
    const { error: reqErr } = await anon.auth.resetPasswordForEmail(member.email, { redirectTo: 'http://localhost:5173' });
    ok(!reqErr, 'password reset request -> accepted');

    const mail = await waitForMail(member.email, { sinceIso: resetStart });
    const link = extractLink(mail || '');
    ok(!!link, 'a password-reset email with a verify link arrived at Mailpit');

    const { access_token, refresh_token, error: linkErr } = await followVerifyLink(link);
    ok(!!access_token && !linkErr, 'the reset link resolves to a recovery session');

    const recoveryClient = freshClient();
    await recoveryClient.auth.setSession({ access_token, refresh_token });
    const newPassword = 'a-strong-password-3';
    const { error: updErr } = await recoveryClient.auth.updateUser({ password: newPassword });
    ok(!updErr, 'password can be updated from the recovery session');

    const signInClient = freshClient();
    const { error: signInErr } = await signInClient.auth.signInWithPassword({ email: member.email, password: newPassword });
    ok(!signInErr, 'signing in with the new password succeeds');

    const { error: oldSignInErr } = await freshClient().auth.signInWithPassword({ email: member.email, password: member.password });
    ok(!!oldSignInErr, 'the old password no longer works');
  }

  // --- K. profile-less session gets no data (RLS denies; app shows "no-profile") --
  {
    // Delete the profile as service_role — simulates "access removed" without
    // being able to create an inviteless auth.users row (handle_new_user
    // would just RAISE). Membership == having a profiles row (PRD §5.1).
    const { error: delErr } = await svc.from('profiles').delete().eq('id', member.userId);
    ok(!delErr, 'service_role can remove a profile (simulated offboarding)');

    const { data, error } = await member.client.from('companies').select('id').limit(1);
    ok((data?.length ?? 0) === 0, 'the now-profile-less session reads 0 rows (RLS denies, not a role check)');
  }

  console.log(`\ninvite-test: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
