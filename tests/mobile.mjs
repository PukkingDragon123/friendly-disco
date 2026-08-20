// node tests/mobile.mjs      (needs a server: node serve.mjs 8099)
//
// Phone-sized landscape viewports with real touch input, driving the game with actual
// gestures. Desktop testing cannot catch the things that break a phone build: a scale
// that letterboxes the game into a strip, a tap that fires a shot instead of selecting,
// or a portrait launch with no way out.
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs');
const URL = process.env.URL || 'http://localhost:8099/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function run(label, viewport, isPortrait) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fullscreen|orientation|permissions/i.test(m.text())) errors.push(`${label} console: ${m.text()}`);
  });
  await page.goto(URL, { waitUntil: 'networkidle' });

  if (isPortrait) {
    const shown = await page.evaluate(() => {
      document.body.classList.add('portrait');
      return getComputedStyle(document.getElementById('rotate')).display;
    });
    console.log(`${label}: rotate overlay = ${shown}`);
    await page.screenshot({ path: 'shots/mobile-portrait.png' });
    await ctx.close();
    return;
  }

  await page.tap('#gate');
  await page.waitForFunction(() => !!window.__ARK, null, { timeout: 15000 });
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => ({
    scale: +window.__ARK.app.scale.toFixed(3),
    css: document.getElementById('game').style.width + 'x' + document.getElementById('game').style.height,
    touch: window.__ARK.app.touch,
    fps: window.__ARK.app.fps,
  }));
  console.log(`${label} ${viewport.width}x${viewport.height}: ${JSON.stringify(info)}`);
  await page.screenshot({ path: `shots/mobile-${label}-menu.png` });

  const b = await page.evaluate(() => {
    const r = window.__ARK.app.scene.debug().rects.start;
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    return { x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h / 2) * s };
  });
  await page.touchscreen.tap(b.x, b.y);
  await page.waitForTimeout(2200);

  const pts = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    const persp = (ty) => 1 - 0.17 * (1 - Math.max(-0.35, Math.min(1.35, ty / 116)));
    const proj = (x, y) => ({ x: c.left + (396 + (x - 116) * 2 * persp(y)) * s, y: c.top + (104 + y * 1.24) * s });
    const ball = d.world.balls.find((bb) => !bb.sunk);
    const gate = d.world.gates[0];
    return { ball: proj(ball.x, ball.y), gate: proj(gate.x, gate.y) };
  });
  await page.touchscreen.tap(pts.ball.x, pts.ball.y);
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => !!window.__ARK.app.scene.debug().selected);

  const dx = pts.gate.x - pts.ball.x, dy = pts.gate.y - pts.ball.y;
  const len = Math.hypot(dx, dy) || 1;
  const far = { x: pts.ball.x + (dx / len) * 150, y: pts.ball.y + (dy / len) * 150 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts.ball.x, y: pts.ball.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts.ball.x + (far.x - pts.ball.x) * i / 8, y: pts.ball.y + (far.y - pts.ball.y) * i / 8 }] });
    await page.waitForTimeout(45);
  }
  await page.screenshot({ path: `shots/mobile-${label}-aiming.png` });
  const charging = await page.evaluate(() => { const d = window.__ARK.app.scene.debug(); return +d.charge.toFixed(2); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(3500);
  const after = await page.evaluate(() => { const d = window.__ARK.app.scene.debug(); return { phase: d.phase, shots: d.run.stats.shotsTaken, potted: d.run.stats.potted, score: d.run.score, fps: window.__ARK.app.fps }; });
  console.log(`${label}: tap-selected=${sel} drag-charge=${charging} -> ${JSON.stringify(after)}`);
  await page.screenshot({ path: `shots/mobile-${label}-deck.png` });
  await ctx.close();
}

await run('iphone', { width: 844, height: 390 }, false);
await run('pixel', { width: 915, height: 412 }, false);
await run('portrait', { width: 390, height: 844 }, true);

if (errors.length) { console.log('\nerrors:'); errors.slice(0, 8).forEach((e) => console.log('  x ' + e)); }
else console.log('\nno page errors on any mobile viewport');
await browser.close();
process.exit(errors.length ? 1 : 0);
