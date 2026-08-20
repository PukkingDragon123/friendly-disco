// node tests/browser.mjs        (needs a server running: node serve.mjs 8099)
//
// The definitive smoke test: load the real game in real Chromium, unlock real WebAudio,
// click through the real UI, take a real shot, and fail on any console error, page
// exception or failed request. Also reports the measured frame rate, which is the only
// honest way to catch a renderer that is quietly doing 160k fillRects a frame.
//
// Chromium ships with this environment at /opt/pw-browsers; PLAYWRIGHT_BROWSERS_PATH is
// already set, so nothing needs downloading.
const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const URL = process.env.URL || 'http://localhost:8099/';
const OUT = process.env.OUT || 'shots/browser';

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  logs.push(`${m.type()}: ${t}`);
  if (m.type() === 'error') errors.push(t);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message)));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));


/** Click/skip through any dialogue until the deck scene is up. */
async function skipDialogue(page, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const kind = await page.evaluate(() => {
      const d = window.__ARK.app.scene.debug ? window.__ARK.app.scene.debug() : {};
      return d.phase !== undefined ? 'deck' : d.scriptId !== undefined ? 'cutscene' : 'other';
    });
    if (kind === 'deck') return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
  }
  return false;
}

await page.goto(URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}-1-gate.png` });

// click the boarding gate — this is also the WebAudio unlock gesture
await page.click('#gate');
await page.waitForFunction(() => !!window.__ARK, null, { timeout: 15000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}-2-menu.png` });

const info = await page.evaluate(() => ({
  scale: window.__ARK.app.scale,
  fps: window.__ARK.app.fps,
  frame: window.__ARK.app.frame,
  canvas: [document.getElementById('game').width, document.getElementById('game').height],
  css: [document.getElementById('game').style.width, document.getElementById('game').style.height],
  audio: window.__ARK.Audio.debug(),
  sfx: window.__ARK.Audio.listSfx().length,
}));
console.log('runtime:', JSON.stringify(info));

// start a run through the real UI: click NEW RUN
const box = await page.evaluate(() => {
  const r = window.__ARK.app.scene.debug().rects.start;
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  return { x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h / 2) * s };
});
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}-3-prologue.png` });
if (!await skipDialogue(page)) errors.push('never reached the deck through the dialogue');
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}-4-deck.png` });

const deck = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return { phase: d.phase, balls: d.world.balls.length, gates: d.world.gates.length, target: d.run.target, ante: d.run.ante };
});
console.log('deck:', JSON.stringify(deck));

// take a real shot: hover a gate, press, hold to charge, release
const shot = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  const T = d.deck;
  void T;
  const gate = d.world.gates[0];
  // project through the same view the renderer uses
  const persp = 1 - 0.17 * (1 - Math.max(-0.35, Math.min(1.35, gate.y / 116)));
  const gx = 396 + (gate.x - 116) * 2 * persp;
  const gy = 104 + gate.y * 1.24;
  return { x: c.left + gx * s, y: c.top + gy * s };
});
await page.mouse.move(shot.x, shot.y);
await page.waitForTimeout(120);
await page.mouse.down();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}-5-charging.png` });
await page.mouse.up();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}-6-rolling.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}-7-scored.png` });

const after = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return { phase: d.phase, score: d.run.score, shotsLeft: d.run.shotsLeft, shots: d.run.stats.shotsTaken, potted: d.run.stats.potted, fps: window.__ARK.app.fps };
});
console.log('after one shot:', JSON.stringify(after));

// jump to the dock so the delivery renders in a real browser too
await page.evaluate(() => window.__ARK.dock());
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}-8-dock.png` });

console.log('\nconsole output:');
for (const l of logs.slice(0, 12)) console.log('  ' + l);
if (errors.length) {
  console.log(`\n\x1b[31m${errors.length} error(s):\x1b[0m`);
  for (const e of errors.slice(0, 10)) console.log('  ✗ ' + e);
} else {
  console.log('\n\x1b[32mno console errors, no page exceptions, no failed requests\x1b[0m');
}
await browser.close();
process.exit(errors.length ? 1 : 0);
