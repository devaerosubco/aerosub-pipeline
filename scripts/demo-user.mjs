// Local-dev convenience: create a confirmed member account so you can just
// `npm run dev` and sign in. Uses the well-known local demo keys.
//   node scripts/demo-user.mjs                -> demo@aerosub.local / demo-password-123
//   node scripts/demo-user.mjs you@x.com pw   -> custom
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = 'http://127.0.0.1:54324';

if (!/127\.0\.0\.1|localhost/.test(URL_ || '')) {
  console.error('Refusing to run: SUPABASE_URL is not local. This is a local-dev helper only.');
  process.exit(1);
}

const email = process.argv[2] || 'demo@aerosub.local';
const password = process.argv[3] || 'demo-password-123';
const fullName = 'Demo User';

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });

// already a member?
const existing = await svc.from('profiles').select('id').eq('email', email).maybeSingle();
if (existing.data) {
  console.log(`\n${email} is already a member. Sign in with the password you set.\n`);
  process.exit(0);
}

const token = 'demo-' + Date.now();
await svc.from('invites').insert({ id: crypto.randomUUID(), token });
const since = new Date().toISOString();
const { error } = await anon.auth.signUp({
  email, password,
  options: { data: { full_name: fullName, invite_token: token }, emailRedirectTo: 'http://localhost:5173' },
});
if (error) { console.error('signup failed:', error.message); process.exit(1); }

let link = null;
for (let i = 0; i < 25 && !link; i++) {
  const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
  const hit = list.messages.find(m => m.To?.some(t => t.Address === email) && m.Created > since);
  if (hit) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json();
    const m = (full.Text || '').match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/);
    if (m) link = m[0];
  }
  if (!link) await new Promise(r => setTimeout(r, 200));
}
if (!link) { console.error('confirmation email never arrived at Mailpit'); process.exit(1); }
await fetch(link, { redirect: 'manual' }); // confirms the address

console.log(`
Demo account ready:

  URL:       http://localhost:5173   (run: npm run dev)
  Email:     ${email}
  Password:  ${password}

Mailpit (all local email):  http://127.0.0.1:54324
Supabase Studio (DB browser): http://127.0.0.1:54323
`);
