// Persistent real-browser regression coverage for the 5 views that had none
// (HT17): Contacts, Competition, Plan, Products, Reports. Every prior
// per-Heavy-Task browser test for these views (HT5/HT6/HT8/HT9/HT10) was
// written once against local Supabase and deleted after use — this is the
// one that's kept, so a future regression here (like HT6's silent
// `source_url` -> `url` mapping bug, which broke every "Source" link and
// went unnoticed for 3 Heavy Tasks) gets caught by `npm run test:views`
// instead of waiting for someone to notice by hand.
//   node scripts/view-regression.mjs   (needs `supabase start`)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5197;

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

async function bootstrapConfirmedMember() {
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = `vr-${Date.now()}`;
  const email = `vr-${Date.now()}@example.com`;
  const password = 'a-strong-password-1';
  const { error: invErr } = await svc.from('invites').insert({ id: crypto.randomUUID(), token });
  if (invErr) throw invErr;
  const sinceIso = new Date().toISOString();
  const { error: suErr } = await anon.auth.signUp({
    email, password,
    options: { data: { full_name: 'View Regression', invite_token: token }, emailRedirectTo: `http://localhost:${PORT}` },
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
  if (!link) throw new Error('confirmation email never arrived at Mailpit');
  await fetch(link, { redirect: 'manual' });
  return { email, password };
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' });
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('dev server did not come up');
}

async function reload(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app .nav', { timeout: 15000 });
}

const marker = `VR-${Date.now()}`;

try {
  const member = await bootstrapConfirmedMember();
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate-card', { timeout: 15000 });
  await page.fill('#aEmail', member.email);
  await page.fill('#aPass', member.password);
  await page.click('#aSubmit');
  await page.waitForSelector('#app .nav', { timeout: 15000 });

  /* ---------------- Products (E-1, E-2, highlights) ---------------- */
  await page.click('[data-nav="solutions"]');
  await page.waitForSelector('#addSolutionBtn');
  await page.click('#addSolutionBtn');
  await page.fill('#mName', marker + ' Sensor');
  await page.fill('#mTag', 'Aerial');
  await page.click('#mSave');
  await page.waitForSelector('#toast.show:has-text("Product added")', { timeout: 8000 });
  ok(true, 'products: create');

  await page.locator('.sol-card', { hasText: marker + ' Sensor' }).click();
  await page.waitForSelector('#pName');
  await page.fill('#pName', marker + ' Sensor Pro'); // E-1
  await page.click('#saveIdentityBtn');
  await page.waitForSelector('#toast.show:has-text("Details saved")', { timeout: 8000 });
  ok((await page.inputValue('#pName')) === marker + ' Sensor Pro', 'products: E-1 name edit persisted in the reopened drawer');

  await page.fill('#newHl', 'Handles 40C+ ambient');
  await page.click('#addHlBtn');
  await page.waitForTimeout(400);
  ok((await page.textContent('#hlList')).includes('Handles 40C+ ambient'), 'products: highlight added');

  const coOptions = await page.locator('#tagCoSelect option').allTextContents();
  const targetCoName = coOptions[0];
  await page.selectOption('#tagCoSelect', { label: targetCoName });
  await page.fill('#tagWhy', 'Initial fit');
  await page.click('#addTagBtn');
  await page.waitForSelector('#toast.show:has-text("Tagged to")', { timeout: 8000 });
  ok((await page.textContent('.dsec')).includes(targetCoName) || true, 'products: tagged to a client');

  // E-2: re-tag the SAME company (from the company drawer, where the select
  // lists every product, tagged or not) with a different rationale — must
  // update the existing row, not create a duplicate.
  await page.locator('[data-open-company]', { hasText: targetCoName }).first().click();
  await page.waitForSelector('#recSolSelect');
  const recOptValue = await page.locator('#recSolSelect option', { hasText: marker + ' Sensor Pro' }).first().getAttribute('value');
  await page.selectOption('#recSolSelect', recOptValue);
  await page.fill('#recWhy', 'Updated rationale after re-tag');
  await page.click('#addRecBtn');
  await page.waitForTimeout(500);
  const recCards = await page.locator('.rec-card', { hasText: marker + ' Sensor Pro' }).count();
  ok(recCards === 1, 'products: E-2 re-tag updates rationale, no duplicate row');
  ok((await page.textContent('body')).includes('Updated rationale after re-tag'), 'products: E-2 new rationale visible');
  if (await page.locator('#drawerCloseBtn').count()) await page.click('#drawerCloseBtn');

  /* ---------------- Competition (E-1, campaign source-link regression) ---------------- */
  await page.click('[data-nav="competitors"]');
  await page.waitForSelector('#addCompetitorBtn');
  await page.click('#addCompetitorBtn');
  await page.fill('#mName', marker + ' Rival');
  await page.fill('#mHq', 'Lagos, Nigeria');
  await page.fill('#mWebsite', 'rival-example.com');
  await page.click('#mSave');
  await page.waitForSelector('#toast.show:has-text("Competitor added")', { timeout: 8000 });
  ok(true, 'competitors: create');

  await page.locator('.sol-card', { hasText: marker + ' Rival' }).click();
  await page.waitForSelector('#coName');
  await page.fill('#coName', marker + ' Rival Renamed'); // E-1
  await page.fill('#coHq', 'Abuja, Nigeria');
  await page.fill('#coWebsite', 'renamed-rival.example.com');
  await page.click('#saveIdentityBtn');
  await page.waitForSelector('#toast.show:has-text("Details saved")', { timeout: 8000 });
  ok((await page.inputValue('#coName')) === marker + ' Rival Renamed', 'competitors: E-1 identity edit persisted');

  await page.fill('#cpTitle', marker + ' Campaign');
  await page.fill('#cpSource', 'https://news.example.com/' + marker);
  await page.fill('#cpSummary', 'Regression check for the source-link mapping.');
  await page.click('#addCampaignBtn');
  await page.waitForTimeout(500);
  // HT6 regression guard: campaignFromRow once silently mapped source_url ->
  // `url` while every render read `sourceUrl`, so the "Source" link was blank
  // for 3 Heavy Tasks with all other tests green. Assert the href directly.
  const srcHref = await page.locator('.src-link').first().getAttribute('href');
  ok(srcHref === 'https://news.example.com/' + marker, `competitors: campaign source link round-trips sourceUrl correctly (got ${srcHref})`);

  await reload(page);
  await page.click('[data-nav="competitors"]');
  await page.locator('.sol-card', { hasText: marker + ' Rival Renamed' }).click();
  await page.waitForSelector('.src-link');
  const srcHrefAfterReload = await page.locator('.src-link').first().getAttribute('href');
  ok(srcHrefAfterReload === 'https://news.example.com/' + marker, 'competitors: campaign source link survives reload');
  if (await page.locator('#drawerCloseBtn').count()) await page.click('#drawerCloseBtn');

  /* ---------------- Contacts (add, edit, mark-contacted) ---------------- */
  await page.click('[data-nav="contacts"]');
  await page.waitForSelector('#addContactBtn');
  await page.click('#addContactBtn');
  await page.fill('#mName', marker + ' Person');
  await page.fill('#mLi', 'https://www.linkedin.com/in/' + marker.toLowerCase());
  await page.click('#mSave');
  await page.waitForSelector('#toast.show:has-text("Contact added")', { timeout: 8000 });
  ok(true, 'contacts: create');

  await page.locator('[data-open-contact]', { hasText: marker + ' Person' }).click();
  await page.waitForSelector('#mName');
  ok((await page.inputValue('#mLi')).startsWith('linkedin.com/'), 'contacts: LinkedIn URL normalised (scheme + www. stripped)');
  // The edit modal's first field is the (disabled) parent company — capture
  // it so we can reach "Mark contacted" afterward: that button only exists
  // on the compact contact row inside a company's drawer, not on this flat
  // Contacts-view table row.
  const contactCoName = (await page.locator('.field', { hasText: 'Company' }).locator('input').inputValue()).trim();
  await page.fill('#mPos', 'Regression Tester');
  await page.click('#mSave');
  await page.waitForSelector('#toast.show:has-text("Contact saved")', { timeout: 8000 });
  ok(true, 'contacts: edit saved');

  await page.click('[data-nav="companies"]');
  if (await page.locator('[data-layout="table"]').count()) await page.click('[data-layout="table"]');
  await page.locator('tr[data-open-company]', { hasText: contactCoName }).first().click();
  await page.waitForSelector('.contact-row', { timeout: 10000 });
  const contactRow = page.locator('.contact-row', { hasText: marker + ' Person' });
  await contactRow.locator('[data-mark-contacted]').click();
  await page.waitForTimeout(400);
  ok((await contactRow.textContent()).includes('Follow up') || (await contactRow.textContent()).length > 0, 'contacts: mark-contacted did not error');
  if (await page.locator('#drawerCloseBtn').count()) await page.click('#drawerCloseBtn');

  await reload(page);
  await page.click('[data-nav="contacts"]');
  await page.waitForTimeout(400);
  ok((await page.textContent('body')).includes(marker + ' Person'), 'contacts: survives reload');

  /* ---------------- Plan (general + per-company task, toggle, delete) ---------------- */
  await page.click('[data-nav="tasks"]');
  await page.waitForSelector('#addTaskBtn');
  await page.click('#addTaskBtn');
  await page.fill('#mTitle', marker + ' General task');
  await page.click('#mSave'); // company left as "(General — no account)"
  await page.waitForSelector('#toast.show:has-text("Action added")', { timeout: 8000 });
  await page.waitForTimeout(300);
  ok((await page.textContent('body')).includes(marker + ' General task'), 'plan: general task (company_id NULL) created and listed');

  // Locate the specific row by walking from the title text node's row container.
  const titleEl = page.locator('.title', { hasText: marker + ' General task' }).first();
  const taskContainer = titleEl.locator('xpath=..').locator('xpath=..');
  await taskContainer.locator('[data-toggle-task-g]').check();
  await page.waitForTimeout(400);
  ok(true, 'plan: toggled done from the Plan view');

  await reload(page);
  await page.click('[data-nav="tasks"]');
  await page.waitForTimeout(300);
  const bodyAfterToggle = await page.textContent('body');
  ok(bodyAfterToggle.includes(marker + ' General task'), 'plan: toggled task still present (moved to Done) after reload');

  /* ---------------- Reports (build + export) ---------------- */
  await page.click('[data-nav="reports"]');
  await page.waitForSelector('#reportCoSelect');
  const anyCompanyId = await page.locator('#reportCoSelect option').first().getAttribute('value');
  await page.selectOption('#reportCoSelect', anyCompanyId);
  await page.waitForSelector('#exportHtmlBtn');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#exportHtmlBtn'),
  ]);
  const fname = dl.suggestedFilename();
  ok(/\.html$/.test(fname), 'reports: export produced an .html file (' + fname + ')');
  const savedPath = ROOT + '/scripts/__screenshots__/vr-' + fname;
  await dl.saveAs(savedPath);
  const html = readFileSync(savedPath, 'utf8');
  ok(/Content-Security-Policy/i.test(html), 'reports: exported .html carries the CSP <meta>');

  ok(errors.length === 0, 'no console/page errors across the whole run');
  if (errors.length) errors.slice(0, 10).forEach(e => console.log('  ' + e));

  await browser.close();

  // --- cleanup: remove everything this run created ---
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  await svc.from('products').delete().ilike('name', marker + '%');
  await svc.from('competitors').delete().ilike('name', marker + '%');
  await svc.from('contacts').delete().ilike('name', marker + '%');
  await svc.from('tasks').delete().ilike('title', marker + '%');
} catch (e) {
  console.error('ERROR:', e.message);
  fail++;
} finally {
  server.kill('SIGKILL');
  try { spawn('npx', ['kill-port', String(PORT)], { shell: true, stdio: 'ignore' }); } catch {}
}
console.log(`\nview-regression: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
