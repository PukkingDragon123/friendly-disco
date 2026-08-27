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
    if (d.film) return 'film';
    if (d.basement) return 'cellar';
    if (d.scriptId !== undefined) return 'cutscene';
    if (d.phase !== undefined && d.heroX !== undefined) return 'walk';
    if (d.heaven) return 'heaven';
    if (d.lane) return 'island';
    if (d.encounter) return 'choice';
    if (d.feeding) return 'feed';
    if (d.rects && d.rects.gates) return 'garden';
    if (d.at && d.at.isles) return 'ocean';
    if (d.won !== undefined) return 'summary';
    if (d.showHelp !== undefined) return 'menu';
    return 'other';
  });
}

/**
 * Click and walk through everything between the menu and the map: the prologue's
 * set-pieces, then the causeway -- which is the one scene that needs a HELD key rather
 * than a keypress, so it gets walked with a real one.
 */
async function skipDialogue(page, tries = 120) {
  for (let i = 0; i < tries; i++) {
    const kind = await sceneKind(page);
    if (kind === 'ocean') return true;
    if (kind === 'walk') {
      await walkCauseway(page);
      continue;
    }
    // THE FILM: Escape leaves a reel, but it fades out over half a second, so give it one.
    if (kind === 'film') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      continue;
    }
    // THE CELLAR is played, not skipped: it is the one place the game teaches the apple.
    if (kind === 'cellar') {
      await playCellar(page);
      continue;
    }
    if (kind === 'heaven') {
      for (let k = 0; k < 8 && (await sceneKind(page)) === 'heaven'; k++) {
        await page.mouse.click(480 * (await page.evaluate(() => window.__ARK.app.scale)), 300);
        await page.waitForTimeout(220);
      }
      continue;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
    if ((await sceneKind(page)) === 'cutscene') {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
  }
  return false;
}

/**
 * THE CELLAR, with a real mouse: eleven clicks to build the golem, one to take the apple,
 * one to throw it, and then click through what he says. This is the only place in the game
 * where the two verbs are taught, so the browser test plays it rather than skipping it.
 */
async function playCellar(page) {
  await page.screenshot({ path: `${OUT}-2b-cellar.png` });
  const scale = await page.evaluate(() => window.__ARK.app.scale);
  const box = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const clickGame = async (x, y) => {
    await page.mouse.click(box.left + x * scale, box.top + y * scale);
    await page.waitForTimeout(90);
  };
  for (let i = 0; i < 140; i++) {
    const st = await page.evaluate(() => {
      const d = window.__ARK.app.scene.debug();
      if (!d.basement) return null;
      return {
        phase: d.phase, holding: d.holding, tamed: d.tamed,
        next: (d.targets() || []).find((x) => !x.hit) || null,
        apple: d.apple, lion: d.lion(),
      };
    });
    if (!st) break;
    if (st.phase === 'build' && st.next) { await clickGame(st.next.x, st.next.y); continue; }
    if (st.phase === 'apple') {
      if (!st.holding) await clickGame(st.apple.x, st.apple.y);
      else if (!st.tamed) await clickGame(st.lion.x, st.lion.y);
      else await clickGame(480, 500);
      continue;
    }
    await clickGame(480, 500);
  }
  const out = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return d.basement ? { phase: d.phase, built: d.built, tamed: d.tamed } : null;
  });
  if (out) {
    console.log('cellar:', JSON.stringify(out));
    errors.push(`the cellar did not finish (stuck in ${out.phase})`);
  } else {
    console.log('cellar: played through');
  }
}

/** Walk the causeway with a held key, click the dying man out, and board the ark. */
async function walkCauseway(page) {
  await page.screenshot({ path: `${OUT}-3b-causeway.png` });
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 140; i++) {
    await page.waitForTimeout(200);
    const p = await page.evaluate(() => {
      const d = window.__ARK.app.scene.debug();
      return { phase: d.phase, x: d.heroX, seen: d.seen };
    });
    if (p.phase !== 'walk') break;
  }
  await page.keyboard.up('KeyD');
  const at = await page.evaluate(() => window.__ARK.app.scene.debug());
  if (at.phase !== 'talk') errors.push(`the causeway stalled at x=${at.heroX} (${at.phase})`);
  else if (at.seen < 4) errors.push(`only ${at.seen} sights on the causeway`);
  await page.screenshot({ path: `${OUT}-3c-noah.png` });
  for (let i = 0; i < 40; i++) {
    const d = await page.evaluate(() => window.__ARK.app.scene.debug());
    if (!d || d.phase !== 'talk') break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(240);
    if ((await sceneKind(page)) !== 'walk') break;
  }
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(600);
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
  // Two presses a line -- one to finish the typing, one to advance -- so the budget has
  // to be twice the longest script plus the fade out, not a round number that happened to
  // fit the scripts that were there when this was written.
  for (let i = 0; i < 90 && kind === 'cutscene'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(90);
    kind = await sceneKind(page);
  }
  await page.waitForTimeout(900);
  kind = await sceneKind(page);
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
if (kind !== 'island') {
  errors.push(`sailing led to "${kind}" instead of an island`);
  console.log('logs:', logs.slice(-12).join(' | '));
  console.log('errors so far:', errors.join(' | '));
  await page.screenshot({ path: `${OUT}-x-stuck.png` });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}-6-island.png` });

const island = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return {
    island: d.island.id,
    clay: d.lane.clay,
    cards: (d.rects.cards || []).length,
    guards: d.lane.guards.filter(Boolean).length,
    firstWaveIn: Math.round(d.lane.waveT),
  };
});
console.log('island:', JSON.stringify(island));
if (!island.cards) errors.push('the tray offered no beasts to plant');
if (island.clay < 50) errors.push('not enough clay to open with');
if (island.firstWaveIn < 8) errors.push('no real opening before the first wave');

// PLANT ONE WITH A REAL MOUSE. Two clicks -- a tray card, then a tile -- which is the
// entire control scheme, so if this works the game is playable.
const placed = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  d.lane.clay = 400;
  // AND CLEAR THE LOOSE CLAY FIRST. A mote outranks a plant on purpose, so one sitting on
  // the tile this test aims at would eat the click and the test would be right to fail --
  // about the wrong thing. The mote's own click is checked below.
  d.lane.motes.length = 0;
  const card = d.rects.cards[0];
  const tile = d.at(2, 1);
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  return {
    before: d.lane.plants.length,
    bx: c.left + (card.rect.x + card.rect.w / 2) * s,
    by: c.top + (card.rect.y + card.rect.h / 2) * s,
    tx: c.left + tile.x * s,
    ty: c.top + tile.y * s,
  };
});
if (placed) {
  await page.mouse.click(placed.bx, placed.by);
  await page.waitForTimeout(140);
  const sel = await page.evaluate(() => JSON.stringify(window.__ARK.app.scene.debug().sel));
  if (sel === 'null') errors.push('clicking a beast card selected nothing');
  await page.mouse.click(placed.tx, placed.ty);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__ARK.app.scene.debug().lane.plants.length);
  if (after <= placed.before) errors.push('a real click on a tile planted nothing');
  else console.log(`planted: ${placed.before} -> ${after} on the field`);
  // and it should start shooting once something walks into its row
  const fought = await page.evaluate(async () => {
    const d = window.__ARK.app.scene.debug();
    d.lane.waveT = 0.1;
    await new Promise((r) => setTimeout(r, 4000));
    return { beasts: d.lane.beasts.length, shots: d.lane.shots.length, wave: d.lane.wave };
  });
  console.log('fight:', JSON.stringify(fought));
  if (fought.wave < 0) errors.push('the first wave never started');
}
// GRAB A MOTE WITH A REAL MOUSE, at the pixel it is drawn at rather than on its tile.
const mote = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  d.lane.motes.length = 0;
  d.lane.motes.push({ row: 3, col: 6, t: 0, life: 9, amount: 20 });
  const q = d.motes()[0];
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  return { clay: d.lane.clay, x: c.left + q.x * s, y: c.top + q.y * s };
});
if (mote) {
  await page.mouse.click(mote.x, mote.y);
  await page.waitForTimeout(160);
  const paid = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return { clay: d.lane.clay, left: d.lane.motes.length, grabbed: d.lane.grabbed };
  });
  console.log('mote:', JSON.stringify(paid));
  if (paid.clay <= mote.clay) errors.push('clicking a clay mote paid nothing');
  if (paid.left) errors.push('the mote was still on the field after being clicked');
}

// CALL THE NEXT WAVE ON EARLY, which is the other new verb on this screen.
const called = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  const f = d.lane;
  // put the fight in a breather so the button is live
  f.inWave = false;
  f.queue.length = 0;
  f.beasts.length = 0;
  f.wave = 0;
  f.waveT = 12;
  const c = document.getElementById('game').getBoundingClientRect();
  const s = window.__ARK.app.scale;
  const r = d.rects.call;
  return r ? { clay: f.clay, wave: f.wave,
    x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h / 2) * s } : null;
});
if (!called) errors.push('there is no way to call the next wave on');
else {
  await page.mouse.click(called.x, called.y);
  await page.waitForTimeout(400);
  const now = await page.evaluate(() => {
    const f = window.__ARK.app.scene.debug().lane;
    return { clay: f.clay, wave: f.wave, called: f.called };
  });
  console.log('called:', JSON.stringify(now));
  if (!now.called) errors.push('the call button did not bring the wave on');
  if (now.clay <= called.clay) errors.push('calling a wave on early paid nothing');
}

const islandT = await drawTime(page);
console.log('island draw:', JSON.stringify(islandT));
if (islandT && islandT.drawMs > 16.6) errors.push(`island draw ${islandT.drawMs}ms exceeds a 60fps frame`);
await page.screenshot({ path: `${OUT}-7-rescue.png` });

// THE RAMP, with a real mouse: knock the island's waves down, then feed what is lying
// there. This is the scene the whole stage is for, so it gets clicked rather than skipped.
const ramp = await page.evaluate(async () => {
  const app = window.__ARK.app;
  const d = app.scene.debug();
  // end the fight where it stands and hand the field to the feeding, the way the island
  // does when you cast off
  const f = d.lane;
  const C = await import('/src/data/corrupted.js');
  const A = await import('/src/data/animals.js');
  for (let i = 0; i < 4; i++) {
    const def = C.CORRUPTED[i % C.CORRUPTED.length];
    f.held.push({ def, baseId: def.base, a: A.ANIMAL_BY_ID[def.base], row: i, col: 2 + i, t: 0 });
  }
  f.apples = 3;
  d.finish();
  return { held: f.held.length, apples: f.apples };
});
console.log('ramp in:', JSON.stringify(ramp));
for (let i = 0; i < 12 && (await sceneKind(page)) === 'island'; i++) {
  await page.mouse.click(480 * (await page.evaluate(() => window.__ARK.app.scale)), 400);
  await page.waitForTimeout(200);
}
if ((await sceneKind(page)) === 'feed') {
  await page.screenshot({ path: `${OUT}-7b-ramp.png` });
  const scale = await page.evaluate(() => window.__ARK.app.scale);
  const box = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const before = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return { apples: d.apples, left: d.left, aboard: d.voyage.aboard.length };
  });
  for (let i = 0; i < 6; i++) {
    const q = await page.evaluate(() => {
      const d = window.__ARK.app.scene.debug();
      if (!d.feeding) return null;
      const n = (d.queue() || []).find((x) => !x.fed);
      return n ? { x: n.x, y: n.y, apples: d.apples } : null;
    });
    if (!q || q.apples <= 0) break;
    await page.mouse.click(box.left + q.x * scale, box.top + q.y * scale);
    await page.waitForTimeout(260);
  }
  const after = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return d.feeding ? { apples: d.apples, fed: d.fed, aboard: d.voyage.aboard.length } : null;
  });
  console.log('ramp:', JSON.stringify(before), '->', JSON.stringify(after));
  if (after && after.fed <= 0) errors.push('clicking an animal on the ramp fed nothing');
  const rampT = await drawTime(page);
  console.log('ramp draw:', JSON.stringify(rampT));
  if (rampT && rampT.drawMs > 16.6) errors.push(`ramp draw ${rampT.drawMs}ms exceeds a frame`);
} else {
  errors.push('the island never handed over to the ramp');
}

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
