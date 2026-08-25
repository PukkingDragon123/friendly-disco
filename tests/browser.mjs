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


/**
 * Median milliseconds spent inside scene.draw() over 60 frames.
 *
 * This, not fps, is the number the renderer controls. Headless Chromium has no GPU and
 * presents through a software compositor, so its frame time sits around 23-25ms
 * REGARDLESS of how much the scene draws -- the menu at 800 canvas calls and the garden
 * at 13000 both report about 40fps here. Reading that as a game problem sends you
 * optimising things that are already fast. Draw time separates the two.
 */
async function drawTime(page) {
  return page.evaluate(() => new Promise((res) => {
    const app = window.__ARK.app;
    if (!app.scene || !app.scene.draw) { res(null); return; }
    const times = [];
    const orig = app.scene.draw.bind(app.scene);
    app.scene.draw = (g, a) => {
      const t0 = performance.now();
      orig(g, a);
      times.push(performance.now() - t0);
    };
    let frames = 0;
    function tick() {
      if (++frames < 62) { requestAnimationFrame(tick); return; }
      app.scene.draw = orig;
      const sorted = times.slice().sort((a, b) => a - b);
      res({
        drawMs: +(sorted[Math.floor(sorted.length / 2)] || 0).toFixed(2),
        worstMs: +(sorted[sorted.length - 1] || 0).toFixed(2),
        frames: times.length,
      });
    }
    requestAnimationFrame(tick);
  }));
}

/** Which scene is up, read off the debug shape every scene provides. */
async function sceneKind(page) {
  return page.evaluate(() => {
    const d = window.__ARK.app.scene.debug ? window.__ARK.app.scene.debug() : {};
    if (d.scriptId !== undefined) return 'cutscene';
    if (d.field) return 'island';
    if (d.encounter) return 'choice';
    if (d.rects && d.rects.gates) return 'garden';
    if (d.at && d.at.isles) return 'ocean';
    if (d.won !== undefined) return 'summary';
    if (d.showHelp !== undefined) return 'menu';
    return 'other';
  });
}

/** Click through any dialogue until we are out on the map. */
async function skipDialogue(page, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const kind = await sceneKind(page);
    if (kind === 'ocean') return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
    if ((await sceneKind(page)) === 'cutscene') {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
  }
  return false;
}

/** Click a rect from the current scene's debug hooks, in page coordinates. */
async function clickRect(page, path) {
  const box = await page.evaluate((p) => {
    const d = window.__ARK.app.scene.debug();
    let r = d;
    for (const k of p) r = r && r[k];
    if (!r) return null;
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    return { x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h / 2) * s };
  }, path);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
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
if (!await skipDialogue(page)) errors.push('never reached the map through the dialogue');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}-4-ocean.png` });

const ocean = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  const v = d.voyage;
  return {
    choices: (v.choices || []).map((c) => c && c.id),
    aboard: v.aboard.length, capacity: v.tiers && v.aboard.length,
    flood: +v.flood.toFixed(3), cards: (d.rects.cards || []).filter(Boolean).length,
  };
});
console.log('ocean:', JSON.stringify(ocean));
if (ocean.cards < 3) errors.push(`the map offered ${ocean.cards} destinations, not three`);

const oceanT = await drawTime(page);
console.log('ocean draw:', JSON.stringify(oceanT));
if (oceanT && oceanT.drawMs > 16.6) errors.push(`ocean draw ${oceanT.drawMs}ms exceeds a 60fps frame`);

// sail somewhere by clicking a card, then get through whatever is on the way in
await clickRect(page, ['rects', 'cards', 0]);
await page.waitForTimeout(3200);
let kind = await sceneKind(page);
if (kind === 'cutscene') {
  for (let i = 0; i < 30 && kind === 'cutscene'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(140);
    kind = await sceneKind(page);
  }
}
if (kind === 'choice') {
  await page.screenshot({ path: `${OUT}-5-choice.png` });
  const choiceT = await drawTime(page);
  console.log('choice draw:', JSON.stringify(choiceT));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1600);
  kind = await sceneKind(page);
}
if (kind !== 'island') errors.push(`sailing led to "${kind}" instead of an island`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-6-island.png` });

const island = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return {
    island: d.island.id,
    ashore: d.field.animals.length,
    dolls: (d.rects.dolls || []).length,
    secondsLeft: Math.round(d.field.limit),
  };
});
console.log('island:', JSON.stringify(island));
if (!island.ashore) errors.push('the island had nobody on it to rescue');
if (!island.dolls) errors.push('the tray offered no dolls to place');

// PUT A DOLL DOWN WITH A REAL MOUSE. Two clicks -- the tray button, then a tile -- which
// is the entire control scheme, so if this works the game is playable.
const placed = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  const cr = d.field.animals.find((a) => a.state !== 'safe' && a.state !== 'lost');
  if (!cr || !d.rects.dolls.length) return null;
  const btn = d.rects.dolls[0];
  const tile = d.at(cr.c | 0, cr.r | 0);
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  return {
    before: d.field.dolls.length,
    bx: c.left + (btn.rect.x + btn.rect.w / 2) * s,
    by: c.top + (btn.rect.y + btn.rect.h / 2) * s,
    tx: c.left + tile.x * s,
    ty: c.top + tile.y * s,
  };
});
if (placed) {
  await page.mouse.click(placed.bx, placed.by);
  await page.waitForTimeout(120);
  const sel = await page.evaluate(() => JSON.stringify(window.__ARK.app.scene.debug().sel));
  if (sel === 'null') errors.push('clicking a doll button selected nothing');
  await page.mouse.click(placed.tx, placed.ty);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__ARK.app.scene.debug().field.dolls.length);
  if (after <= placed.before) errors.push('a real click on a tile put no doll down');
  else console.log(`doll: ${placed.before} -> ${after} on the field`);
  // and it should actually start moving animals home
  await page.waitForTimeout(2500);
  const homing = await page.evaluate(() => window.__ARK.app.scene.debug()
    .field.animals.filter((a) => a.homing).length);
  if (!homing) errors.push('a herder doll set nobody walking home');
  else console.log(`homing: ${homing} animals heading for the ark`);
}
const islandT = await drawTime(page);
console.log('island draw:', JSON.stringify(islandT));
if (islandT && islandT.drawMs > 16.6) errors.push(`island draw ${islandT.drawMs}ms exceeds a 60fps frame`);
await page.screenshot({ path: `${OUT}-7-rescue.png` });

// and the garden, which is the heaviest static scene
await page.evaluate(() => window.__ARK.eden());
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}-8-garden.png` });
const gardenT = await drawTime(page);
console.log('garden draw:', JSON.stringify(gardenT));
if (gardenT && gardenT.drawMs > 16.6) errors.push(`garden draw ${gardenT.drawMs}ms exceeds a 60fps frame`);
const garden = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return { gates: (d.rects.gates || []).length, beds: (d.rects.beds || []).length };
});
console.log('garden:', JSON.stringify(garden));
if (!garden.gates) errors.push('the Cherubim offered no gates');

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
