// HT0 smoke test: load the Vite-split app under jsdom, boot it with the default
// seed, and assert the dashboard renders with seeded data — no browser needed.
// Run: node scripts/smoke-ht0.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const js = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.stack || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="app"></div>
<div class="scrim" id="scrim"></div>
<div class="drawer" id="drawer"></div>
<div class="modal-scrim" id="modalScrim"><div class="modal" id="modalBody"></div></div>
<div class="toast" id="toast"></div>
<script>${js.replace(/<\/script>/gi, '<\\/script>')}</script>
</body></html>`;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
  virtualConsole: vc,
});

// let the deferred boot + any microtasks settle
await new Promise((r) => setTimeout(r, 200));

const doc = dom.window.document;
const appHtml = doc.getElementById('app')?.innerHTML || '';
const bodyText = doc.body.textContent || '';

const checks = [
  ['#app is non-empty', appHtml.length > 500],
  ['nav rendered (Dashboard)', /Dashboard|Overview/i.test(appHtml)],
  ['nav rendered (Companies)', /Companies/i.test(appHtml)],
  ['seeded company: Seplat', /Seplat/.test(bodyText)],
  ['seeded company: TotalEnergies', /TotalEnergies/.test(bodyText)],
  ['seeded company: NLNG', /NLNG/.test(bodyText)],
  ['pipeline stage label present', /Researching|Contact ID|Proposal/i.test(bodyText)],
  ['localStorage seeded', !!dom.window.localStorage.getItem('aerosub_pipeline_v1')],
  ['no jsdom/runtime errors', errors.length === 0],
];

let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) ok = false;
}
if (errors.length) {
  console.log('\n--- errors ---');
  for (const e of errors.slice(0, 5)) console.log(e.slice(0, 800));
}
console.log(`\nHT0 smoke: ${ok ? 'OK' : 'FAILED'}`);
process.exit(ok ? 0 : 1);
