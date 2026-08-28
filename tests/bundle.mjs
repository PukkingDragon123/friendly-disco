// node tests/bundle.mjs   --   does the ONE-FILE build actually play?
//
// tests/browser.mjs proves the game works when a server hands the browser sixty-three
// modules. This proves the bundle works when nobody hands it anything: it opens
// dist/pocket-ark.html straight off the disk with a file:// URL -- no origin, no fetch, no
// module resolution -- boards, clicks through the menu into a run, and fails on any console
// error, page exception or failed request.
//
// It also checks the two things a bundler can silently break and a smoke test can miss:
// that the module registry is COMPLETE (every module evaluated to an object), and that a
// live binding is still live (GRID reads through the registry rather than a stale copy).

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
const FILE = process.env.FILE || 'dist/pocket-ark.html';

if (!existsSync(FILE) || process.env.REBUILD !== '0') {
  execFileSync('node', ['tools/bundle.mjs', FILE], { stdio: 'inherit' });
}
const html = readFileSync(FILE, 'utf8');

let fails = 0;
const ok = (cond, what, extra = '') => {
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${what}`);
  else { fails++; console.log(`  \x1b[31m✗\x1b[0m ${what}${extra ? '  <- ' + extra : ''}`); }
};

/* ------------------------------------------------------- the file, statically */

console.log('\n\x1b[1m── the file ──────────────────────────────────────────────\x1b[0m');
ok(!/<\/?(html|head|body)\b/i.test(html), 'no html/head/body tags: it is artifact-ready');
ok(!/\bimport\s+[{*]/.test(html) && !/\bfrom\s+['"]\.\//.test(html),
  'no ES import statements survive the transform');
ok(!/src\s*=\s*["']\.?\/?src\//.test(html), 'nothing is loaded from a relative path');
ok(/<title>[^<]+<\/title>/.test(html), 'it names itself');
ok(html.length < 16 * 1024 * 1024, `under the 16MB artifact cap (${(html.length / 1024 / 1024).toFixed(2)}MB)`);
const externals = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:[^"']+)/g)].map((m) => m[1]);
const allowed = /^https:\/\/(fonts\.googleapis\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net\/npm\/|code\.jquery\.com)/;
ok(externals.every((u) => allowed.test(u)),
  'every external URL is on the artifact CSP allowlist', externals.filter((u) => !allowed.test(u)).join(' '));

/* ------------------------------------------------------------- and in a browser */

const { chromium } = await import(PW);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
// the display face is a nicety and this sandbox has no outbound network: a font that does
// not arrive is a fallback stack doing its job, not a broken page
const fontNoise = (s) => /fonts\.(googleapis|gstatic)\.com/.test(s)
  || (/Failed to load resource/.test(s) && !/\.js|\.css|src\//.test(s));
page.on('console', (m) => { if (m.type() === 'error' && !fontNoise(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
page.on('requestfailed', (r) => {
  // the font is a nicety, not a dependency: offline is fine, anything else is not
  if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) {
    errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText));
  }
});

console.log('\n\x1b[1m── in chromium, off the disk ─────────────────────────────\x1b[0m');
await page.goto('file://' + process.cwd() + '/' + FILE, { waitUntil: 'load' });
await page.waitForTimeout(300);
ok(await page.isVisible('#gate'), 'the boarding gate is up');

await page.click('#gate');
await page.waitForTimeout(1500);
ok(await page.evaluate(() => !!window.__ARK), 'the game booted and exposed its debug handle');
ok(await page.evaluate(() => document.body.classList.contains('ready')), 'the cabinet is showing');

const reg = await page.evaluate(() => {
  const M = window.__ARK && window.__ARK.modules;
  return M ? { n: Object.keys(M).length, bad: Object.entries(M).filter(([, v]) => !v).map(([k]) => k) } : null;
});
if (reg) {
  ok(reg.n > 40, `every module evaluated (${reg.n})`);
  ok(reg.bad.length === 0, 'none of them came back empty', reg.bad.join(' '));
}

// a live binding is still live: living() flips GRID to 2 inside its callback, and uikit --
// a DIFFERENT module -- has to see the 2, not the 1 it was worth when the bundle loaded
const live = await page.evaluate(() => {
  const px = window.__ARK && window.__ARK.modules && window.__ARK.modules['src/core/pixel.js'];
  if (!px || !px.living) return 'no handle';
  let inside = null;
  px.living(() => { inside = px.GRID; });
  return { inside, after: px.GRID };
});
ok(live && live.inside === 2 && live.after === 1,
  'live bindings are live: GRID reads 2 inside living(), 1 outside', JSON.stringify(live));

// and it plays: menu -> a run -> the prologue is skippable -> a real scene draws
const shot = async (name) => page.screenshot({ path: `shots/bundle-${name}.png` });
await shot('menu');
const canvasBox = await page.$eval('#game', (c) => {
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const clickGame = async (gx, gy) => {
  await page.mouse.click(canvasBox.x + (gx / 960) * canvasBox.w, canvasBox.y + (gy / 540) * canvasBox.h);
};
// NEW RUN sits at the middle of the menu's button stack
await clickGame(480, 384);
await page.waitForTimeout(900);
for (let i = 0; i < 24; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); }
await page.waitForTimeout(600);
const where = await page.evaluate(() => {
  const a = window.__ARK && window.__ARK.app;
  const s = a && a.scene;
  return { scene: (s && (s.id || s.name)) || 'unknown', depth: a ? a.depth : -1 };
});
ok(where.depth >= 0, `it got somewhere: depth ${where.depth}`);
await shot('playing');

// the canvas is actually painting, not sitting on a cleared frame
const paint = await page.evaluate(() => {
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 197) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
});
ok(paint > 12, `the canvas is painting a real frame (${paint} distinct colours)`);

ok(errors.length === 0, 'no console errors, page exceptions or failed requests',
  errors.slice(0, 4).join(' | '));

await browser.close();
console.log(`\n${fails ? `\x1b[31m${fails} failure(s)\x1b[0m` : '\x1b[32mthe one-file build plays\x1b[0m'}\n`);
process.exit(fails ? 1 : 0);
