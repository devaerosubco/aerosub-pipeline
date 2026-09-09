// HT14 cross-browser smoke: run the core interactions in BOTH Chromium and
// Firefox against the real local Supabase — board move (kanban), a drawer
// identity edit (E-1), and a report export — asserting each persists across a
// full page reload and that neither browser logs a console/page error.
//   node scripts/crossbrowser-smoke.mjs   (needs `supabase start`)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, firefox } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5196;
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

async function bootstrapConfirmedMember() {
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, detectSessionInUrl: false } });
  const token = `xb-${Date.now()}`;
  const email = `xb-${Date.now()}@example.com`;
  const password = 'a-strong-password-1';
  const { error: invErr } = await svc.from('invites').insert({ id: crypto.randomUUID(), token });
  if (invErr) throw invErr;
  const sinceIso = new Date().toISOString();
  const { error: suErr } = await anon.auth.signUp({
    email, password,
    options: { data: { full_name: 'Cross Browser', invite_token: token }, emailRedirectTo: `http://localhost:${PORT}` },
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

// HTML5 drag-and-drop isn't driven by synthetic mouse moves — dispatch the
// DnD event sequence with a shared DataTransfer, the way the browser would.
async function html5Drag(page, fromSel, toSel) {
  await page.evaluate(({ fromSel, toSel }) => {
    const src = document.querySelector(fromSel);
    const dst = document.querySelector(toSel);
    const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(src, 'dragstart');
    fire(dst, 'dragover');
    fire(dst, 'drop');
    fire(src, 'dragend');
  }, { fromSel, toSel });
}

async function signIn(page, member) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gate-card', { timeout: 15000 });
  await page.fill('#aEmail', member.email);
  await page.fill('#aPass', member.password);
  await page.click('#aSubmit');
  await page.waitForSelector('#app .nav', { timeout: 15000 });
}

async function runBrowser(name, type, member) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  try {
    await signIn(page, member);

    // --- board renders ---
    await page.click('[data-nav="companies"]');
    await page.waitForSelector('.board .col');
    ok(await page.locator('.board .col').count() === 8, `[${name}] kanban shows all 8 stage columns`);
    ok(await page.locator('.kcard').count() >= 8, `[${name}] seeded company cards render on the board`);

    // --- board move + persistence ---
    // pick a card and read its current column, move it to a different one
    const card = page.locator('.kcard').first();
    const companyId = await card.getAttribute('data-company');
    const fromStage = await card.evaluate(el => el.closest('.col').dataset.stage);
    const stages = await page.locator('.board .col').evaluateAll(cols => cols.map(c => c.dataset.stage));
    const toStage = stages.find(s => s !== fromStage);
    await html5Drag(page, `.kcard[data-company="${companyId}"]`, `.col[data-stage="${toStage}"]`);
    await page.waitForFunction(
      ({ id, stage }) => document.querySelector(`.kcard[data-company="${id}"]`)?.closest('.col')?.dataset.stage === stage,
      { id: companyId, stage: toStage }, { timeout: 8000 },
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-nav="companies"]');
    await page.waitForSelector('.board .col');
    const afterReload = await page.locator(`.kcard[data-company="${companyId}"]`).evaluate(el => el.closest('.col').dataset.stage);
    ok(afterReload === toStage, `[${name}] board move persisted across a full reload (${fromStage} → ${toStage})`);

    // --- drawer identity edit (E-1) + persistence ---
    await page.locator(`.kcard[data-company="${companyId}"]`).click();
    await page.waitForSelector('#coSummary');
    const marker = `xb-${name}-${Date.now()}`;
    await page.fill('#coSummary', marker);
    await page.click('#saveIdentityBtn');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-nav="companies"]');
    await page.locator(`.kcard[data-company="${companyId}"]`).click();
    await page.waitForSelector('#coSummary');
    ok((await page.inputValue('#coSummary')) === marker, `[${name}] drawer summary edit (E-1) persisted across reload`);
    if (await page.locator('#drawerCloseBtn').count()) await page.locator('#drawerCloseBtn').click();

    // --- report export ---
    await page.click('[data-nav="reports"]');
    await page.waitForSelector('#reportCoSelect');
    await page.selectOption('#reportCoSelect', companyId);
    await page.check('[data-section="notes"]').catch(() => {});
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportHtmlBtn'),
    ]);
    const fname = dl.suggestedFilename();
    const path = shotDir + `xb-${name}-` + fname;
    await dl.saveAs(path);
    const html = readFileSync(path, 'utf8');
    ok(/\.html$/.test(fname), `[${name}] report exported as an .html file (${fname})`);
    ok(/Content-Security-Policy/i.test(html), `[${name}] exported report carries the CSP <meta>`);

    ok(errors.length === 0, `[${name}] no console/page errors across the run`);
    if (errors.length) errors.slice(0, 6).forEach(e => console.log('  ' + e));
    await page.screenshot({ path: shotDir + `xb-${name}.png`, fullPage: true });
  } catch (e) {
    console.log(`FAIL  [${name}] threw: ${e.message}`);
    fail++;
  } finally {
    await browser.close();
  }
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
  const member = await bootstrapConfirmedMember();
  await waitForServer();
  await runBrowser('chromium', chromium, member);
  await runBrowser('firefox', firefox, member);
} catch (e) {
  console.error('ERROR:', e.message);
  fail++;
} finally {
  server.kill('SIGKILL');
  try { spawn('npx', ['kill-port', String(PORT)], { shell: true, stdio: 'ignore' }); } catch {}
}
console.log(`\ncrossbrowser-smoke: ${fail === 0 ? 'OK' : 'FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
