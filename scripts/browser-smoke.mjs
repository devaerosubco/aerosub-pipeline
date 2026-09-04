// Real-browser smoke: start the Vite dev server, load the app in headless
// Chromium, screenshot, and fail on any console error / page error.
// Run: node scripts/browser-smoke.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 5199;
const shotDir = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
mkdirSync(shotDir, { recursive: true });

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
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app .nav', { timeout: 10000 });

  // dismiss the "who's using this" boot modal if present
  const skip = page.locator('#modalBody button', { hasText: /skip/i });
  if (await skip.count()) await skip.first().click();

  const bodyText = await page.textContent('body');
  const checks = [
    ['nav present', await page.locator('#app .nav-item').count() >= 5],
    ['seeded companies visible', /Seplat/.test(bodyText) && /TotalEnergies/.test(bodyText)],
    ['dashboard tiles', await page.locator('#app .tile, #app .grid-tiles').count() > 0],
    ['no console/page errors', errors.length === 0],
  ];
  for (const [l, p] of checks) { console.log(`${p ? 'PASS' : 'FAIL'}  ${l}`); if (!p) failed = true; }
  if (errors.length) errors.slice(0, 8).forEach((e) => console.log('  ' + e));

  await page.screenshot({ path: shotDir + 'ht0-dashboard.png', fullPage: true });
  console.log('\nscreenshot: ' + shotDir + 'ht0-dashboard.png');
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
