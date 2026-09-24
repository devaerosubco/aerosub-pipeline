// V2 Store real-browser smoke: the golden paths TASKS-v2.md's HT-B/HT-C
// "manual real-browser pass" checkboxes called for but were never actually
// run (no local Docker in that session). Follows the exact pattern of
// scripts/browser-smoke.mjs / scripts/crossbrowser-smoke.mjs (HT2/HT14) —
// bootstrap a confirmed member via Supabase Auth + Mailpit, drive headless
// Chromium against a real local Supabase, assert state persists across a
// full page reload.
//   node scripts/store-smoke.mjs   (needs `supabase start`)
//
// Covers: single-item add, bulk CSV upload (including the row-level
// validation for unknown category / negative price / oversized blurb),
// bulk archive + persistence, and members-only sharing — specifically the
// sharer-vs-recipient revoke asymmetry (a recipient must NOT see a revoke
// control; only the sharer can revoke) since that was a real bug found in
// review (the UI used to render the (x) for every viewer regardless of
// shared_by, so a recipient's click silently no-op'd against RLS).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5198;
const shotDir = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
mkdirSync(shotDir, { recursive: true });

for (const line of readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = 'http://127.0.0.1:54324';

let pass = 0, fail = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); c ? pass++ : fail++; };

async function bootstrapConfirmedMember(label, fullName) {
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = `store-${label}-${Date.now()}`;
  const email = `store-${label}-${Date.now()}@example.com`;
  const password = 'a-strong-password-1';
  const { error: invErr } = await svc.from('invites').insert({ id: crypto.randomUUID(), token });
  if (invErr) throw invErr;
  const sinceIso = new Date().toISOString();
  const { error: suErr } = await anon.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, invite_token: token }, emailRedirectTo: `http://localhost:${PORT}` },
  });
  if (suErr) throw suErr;
  let link = null;
  for (let i = 0; i < 25 && !link; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
    const hit = list.messages.find(m => m.To?.some(t => t.Address === email) && m.Created > sinceIso);
    if (hit) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json();
      const m = (full.Text || '').match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/);
      if (m) link = m[0];
    }
    if (!link) await new Promise(r => setTimeout(r, 200));
  }
  if (!link) throw new Error(`confirmation email for ${label} never arrived at Mailpit`);
  await fetch(link, { redirect: 'manual' });
  return { email, password, fullName };
}

async function signIn(page, member) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate-card', { timeout: 15000 });
  await page.fill('#aEmail', member.email);
  await page.fill('#aPass', member.password);
  await page.click('#aSubmit');
  await page.waitForSelector('#app .nav', { timeout: 15000 });
}

async function openStoreProducts(page) {
  await page.click('[data-nav="solutions"]');
  await page.waitForSelector('[data-store-tab]');
  await page.click('[data-store-tab="products"]');
  await page.waitForSelector('#addSolutionBtn');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' });
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('dev server did not come up');
}

try {
  const memberA = await bootstrapConfirmedMember('a', 'Smoke Store A');
  const memberB = await bootstrapConfirmedMember('b', 'Smoke Store B');
  await waitForServer();

  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const pageA = await ctxA.newPage();
  const errorsA = [];
  pageA.on('console', m => { if (m.type() === 'error') errorsA.push('console: ' + m.text()); });
  pageA.on('pageerror', e => errorsA.push('pageerror: ' + e.message));

  await signIn(pageA, memberA);

  // --- Store dashboard renders ---
  await pageA.click('[data-nav="solutions"]');
  await pageA.waitForSelector('.card.panel');
  const dashText = await pageA.textContent('#app');
  ok(/Recently added/.test(dashText) && /Most searched/.test(dashText), 'Store dashboard tiles render');

  // --- single-item add + persistence ---
  await openStoreProducts(pageA);
  const productName = `Smoke Product ${Date.now()}`;
  await pageA.click('#addSolutionBtn');
  await pageA.waitForSelector('#mCategory');
  await pageA.fill('#mName', productName);
  await pageA.selectOption('#mCategory', { label: 'Other' });
  await pageA.click('#mSave');
  await pageA.waitForSelector(`.sol-card:has-text("${productName}")`, { timeout: 8000 });
  ok(true, 'single-item add: product appears in the grid');
  await pageA.reload({ waitUntil: 'networkidle' });
  await openStoreProducts(pageA);
  ok(await pageA.locator(`.sol-card:has-text("${productName}")`).count() === 1,
    'single-item add persisted across a full reload');

  // --- bulk CSV upload: valid row + 3 deliberately-invalid rows ---
  const csvName = `Smoke CSV Valid ${Date.now()}`;
  const longBlurb = 'x'.repeat(4001);
  const csv = [
    'name,category,blurb,price,currency',
    `${csvName},Other,a fine blurb,100,NGN`,
    `Smoke CSV Bad Category ${Date.now()},NoSuchCategory,x,50,NGN`,
    `Smoke CSV Bad Price ${Date.now()},Other,x,-5,NGN`,
    `Smoke CSV Bad Blurb ${Date.now()},Other,${longBlurb},10,NGN`,
  ].join('\n');
  await pageA.click('#bulkUploadStoreBtn');
  await pageA.setInputFiles('#mFile', { name: 'bulk.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await pageA.waitForSelector('#mSave:not([disabled])', { timeout: 8000 });
  const importLabel = await pageA.textContent('#mSave');
  ok(importLabel.trim() === 'Import 1 row', `bulk upload preview flags 3 bad rows, only the valid one is importable (got "${importLabel.trim()}")`);
  const previewText = await pageA.textContent('#mPreview');
  ok(/unknown category/.test(previewText), 'preview flags the unknown-category row');
  ok(/invalid price/.test(previewText), 'preview flags the negative-price row');
  ok(/blurb too long/.test(previewText), 'preview flags the oversized-blurb row');
  await pageA.click('#mSave');
  await pageA.waitForSelector(`.sol-card:has-text("${csvName}")`, { timeout: 8000 });
  ok(/Pending Review/.test(await pageA.locator(`.sol-card:has-text("${csvName}")`).textContent()),
    'imported row lands as Pending Review');

  // --- bulk archive + persistence ---
  const card = pageA.locator(`.sol-card:has-text("${productName}")`);
  await card.locator('[data-store-select]').click();
  await pageA.click('#storeBulkArchiveBtn');
  await pageA.waitForTimeout(500);
  ok(await pageA.locator(`.sol-card:has-text("${productName}")`).count() === 0,
    'archived item drops out of the default (non-archived) view');
  await pageA.check('#storeShowArchived');
  await pageA.waitForSelector(`.sol-card:has-text("${productName}")`, { timeout: 8000 });
  await pageA.reload({ waitUntil: 'networkidle' });
  await openStoreProducts(pageA);
  await pageA.check('#storeShowArchived');
  ok(await pageA.locator(`.sol-card:has-text("${productName}")`).count() === 1,
    'bulk archive persisted across a full reload');

  // --- members-only sharing: sharer sees revoke, recipient does not ---
  const shareProductName = `Smoke Share Product ${Date.now()}`;
  await pageA.click('#addSolutionBtn');
  await pageA.waitForSelector('#mCategory');
  await pageA.fill('#mName', shareProductName);
  await pageA.selectOption('#mCategory', { label: 'Other' });
  await pageA.click('#mSave');
  await pageA.waitForSelector(`.sol-card:has-text("${shareProductName}")`, { timeout: 8000 });
  await pageA.click(`.sol-card:has-text("${shareProductName}")`);
  await pageA.waitForSelector('#shareTeammate', { timeout: 8000 });
  await pageA.selectOption('#shareTeammate', { label: memberB.fullName });
  await pageA.click('#shareBtn');
  await pageA.waitForSelector('[data-revoke-share]', { timeout: 8000 });
  ok(true, 'sharer (A) sees a revoke control on their own share');

  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const pageB = await ctxB.newPage();
  const errorsB = [];
  pageB.on('console', m => { if (m.type() === 'error') errorsB.push('console: ' + m.text()); });
  pageB.on('pageerror', e => errorsB.push('pageerror: ' + e.message));

  await signIn(pageB, memberB);
  await openStoreProducts(pageB);
  await pageB.click(`.sol-card:has-text("${shareProductName}")`);
  // "Share" itself is always the section heading, even mid-load — wait for
  // its actual (async) content instead of just the heading being present.
  await pageB.waitForFunction(
    () => /Shared with you by|Not shared with anyone yet/.test(document.getElementById('drawer')?.textContent || ''),
    { timeout: 8000 },
  );
  const recipientShareText = await pageB.textContent('#drawer');
  ok(/Shared with you by/.test(recipientShareText), 'recipient (B) sees "Shared with you by ..."');
  ok(await pageB.locator('[data-revoke-share]').count() === 0,
    'recipient (B) does NOT see a revoke control (RLS only allows the sharer to revoke)');

  // --- sharer revokes; recipient no longer sees the share ---
  await pageA.click('[data-revoke-share]');
  await pageA.waitForFunction(
    () => /Not shared with anyone yet/.test(document.getElementById('drawer')?.textContent || ''),
    { timeout: 8000 },
  );
  ok(true, 'sharer (A) revoked the share');
  await pageB.reload({ waitUntil: 'networkidle' });
  await openStoreProducts(pageB);
  await pageB.click(`.sol-card:has-text("${shareProductName}")`);
  await pageB.waitForFunction(
    () => /Shared with you by|Not shared with anyone yet/.test(document.getElementById('drawer')?.textContent || ''),
    { timeout: 8000 },
  );
  ok(!/Shared with you by/.test(await pageB.textContent('#drawer')), 'revoke removed the share from the recipient\'s view too');

  ok(errorsA.length === 0, `no console/page errors for A (${errorsA.slice(0, 4).join(' | ')})`);
  ok(errorsB.length === 0, `no console/page errors for B (${errorsB.slice(0, 4).join(' | ')})`);

  await pageA.screenshot({ path: shotDir + 'store-smoke-a.png', fullPage: true });
  await pageB.screenshot({ path: shotDir + 'store-smoke-b.png', fullPage: true });
  await browser.close();
} catch (e) {
  console.error('ERROR:', e.message);
  fail++;
} finally {
  server.kill('SIGKILL');
  try { spawn('npx', ['kill-port', String(PORT)], { shell: true, stdio: 'ignore' }); } catch {}
}
console.log(`\nstore-smoke: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
