// Real-browser smoke: start the Vite dev server, load the app in headless
// Chromium, sign in as a bootstrapped member (real invite -> signup -> confirm,
// via Supabase + the Mailpit catch-all mailbox — HT2), and assert the
// dashboard renders with seeded data. Fails on any console/page error.
// Run: node scripts/browser-smoke.mjs   (needs `supabase start`)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5199;
const shotDir = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
mkdirSync(shotDir, { recursive: true });

// load .env.test (service_role — setup only, never shipped to the app)
for (const line of readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = 'http://127.0.0.1:54324';

async function bootstrapConfirmedMember() {
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = `smoke-${Date.now()}`;
  const email = `smoke-${Date.now()}@example.com`;
  const password = 'a-strong-password-1';
  const { error: invErr } = await svc.from('invites').insert({ id: crypto.randomUUID(), token });
  if (invErr) throw invErr;

  const sinceIso = new Date().toISOString();
  const { error: suErr } = await anon.auth.signUp({
    email, password,
    options: { data: { full_name: 'Smoke Test', invite_token: token }, emailRedirectTo: `http://localhost:${PORT}` },
  });
  if (suErr) throw suErr;

  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=20`);
    const list = await res.json();
    const hit = list.messages.find(m => m.To?.some(t => t.Address === email) && m.Created > sinceIso);
    if (hit) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json();
      const m = (full.Text || '').match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/);
      if (m) link = m[0];
    }
    if (!link) await new Promise(r => setTimeout(r, 200));
  }
  if (!link) throw new Error('confirmation email never arrived at Mailpit');
  await fetch(link, { redirect: 'manual' }); // confirms the email server-side
  return { email, password };
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, shell: true, stdio: 'ignore',
});

const url = `http://localhost:${PORT}/`;
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not come up');
}

let failed = false;
try {
  const member = await bootstrapConfirmedMember();
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // --- auth screen ---
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate-card', { timeout: 10000 });
  const authChecks = [
    ['sign-in heading', /Sign in/i.test(await page.textContent('.gate-card'))],
    ['email + password fields', await page.locator('#aEmail').count() === 1 && await page.locator('#aPass').count() === 1],
  ];
  for (const [l, p] of authChecks) { console.log(`${p ? 'PASS' : 'FAIL'}  ${l}`); if (!p) failed = true; }
  await page.screenshot({ path: shotDir + 'ht2-signin.png', fullPage: true });

  // --- sign in as the bootstrapped member ---
  await page.fill('#aEmail', member.email);
  await page.fill('#aPass', member.password);
  await page.click('#aSubmit');
  await page.waitForSelector('#app .nav', { timeout: 10000 });

  const bodyText = await page.textContent('body');
  const appChecks = [
    ['nav present', await page.locator('#app .nav-item').count() >= 5],
    ['seeded companies visible', /Seplat/.test(bodyText) && /TotalEnergies/.test(bodyText)],
    ['dashboard tiles', await page.locator('#app .tile, #app .grid-tiles').count() > 0],
    ['signed-in name shown', await page.locator('.who-name').count() === 1],
    ['no console/page errors', errors.length === 0],
  ];
  for (const [l, p] of appChecks) { console.log(`${p ? 'PASS' : 'FAIL'}  ${l}`); if (!p) failed = true; }
  if (errors.length) errors.slice(0, 8).forEach((e) => console.log('  ' + e));

  await page.screenshot({ path: shotDir + 'ht2-dashboard.png', fullPage: true });
  console.log('\nscreenshots: ' + shotDir + 'ht2-signin.png, ' + shotDir + 'ht2-dashboard.png');
  await browser.close();
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
} finally {
  server.kill('SIGKILL');
  try { spawn('npx', ['kill-port', String(PORT)], { shell: true, stdio: 'ignore' }); } catch {}
}
console.log(`\nbrowser smoke: ${failed ? 'FAILED' : 'OK'}`);
process.exit(failed ? 1 : 0);
