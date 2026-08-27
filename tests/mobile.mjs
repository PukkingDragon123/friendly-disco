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

/** Which scene is up, read off the debug shape every scene provides. */
async function sceneKind(page) {
  return page.evaluate(() => {
    const d = window.__ARK.app.scene.debug ? window.__ARK.app.scene.debug() : {};
    if (d.scriptId !== undefined) return 'cutscene';
    if (d.film) return 'film';
    if (d.basement) return 'cellar';
    if (d.arena) return 'arena';
    if (d.chart) return 'chart';
    if (d.heaven) return 'heaven';
    if (d.sights !== undefined) return 'walk';
    if (d.queue) return 'feed';
    if (d.lane) return 'island';
    if (d.encounter) return 'choice';
    if (d.rects && d.rects.gates) return 'garden';
    if (d.at && d.at.isles) return 'ocean';
    if (d.showHelp !== undefined) return 'menu';
    return 'other';
  });
}

/**
 * Get to the map.
 *
 * THIS IS A LAYOUT TEST, NOT A PLAYTHROUGH. browser.mjs plays the prologue with a real
 * mouse -- builds the golem, throws the apple, walks the causeway -- and that is where the
 * intro is checked. What this file is for is scale, touch and orientation on a phone, so it
 * gets to the ocean the shortest honest way there is: each scene's own `skip`. Escape alone
 * used to be enough and stopped being enough the moment the prologue became four scenes
 * instead of one dialogue script, and the failure it gave was "never reached the map",
 * which reads like a broken game rather than a stale harness.
 */
async function skipDialogue(page, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const kind = await sceneKind(page);
    if (kind === 'chart' || kind === 'ocean') return true;
    if (kind === 'film' || kind === 'cellar' || kind === 'walk' || kind === 'heaven') {
      await page.evaluate(() => {
        const d = window.__ARK.app.scene.debug();
        if (d.skip) d.skip();
      });
      await page.waitForTimeout(700);
      continue;
    }
    // Escape leaves a script outright; the Space is only for the frame where a line is
    // still typing. Both are checked against the CURRENT scene, so a press can never
    // land on the map behind the dialogue and choose a route for us.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(180);
    if ((await sceneKind(page)) === 'cutscene') {
      await page.keyboard.press('Space');
      await page.waitForTimeout(160);
    }
  }
  return false;
}

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
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/mobile-${label}-prologue.png` });
  if (!await skipDialogue(page)) {
    // AND SAY WHERE IT GOT STUCK. "never reached the map" was the whole message for two
    // rounds of this and it reads like a broken game; the scene it is sitting in is the
    // only fact that tells you whether the game or the harness is the thing that is stale.
    errors.push(`${label}: never reached the map (stuck in "${await sceneKind(page)}")`);
    await ctx.close();
    return;
  }
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `shots/mobile-${label}-ocean.png` });

  // tap a destination card and get through whatever is on the way in
  const card = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const r = (d.rects.cards || []).filter(Boolean)[0];
    if (!r) return null;
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    return { x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h - 14) * s };
  });
  if (!card) { errors.push(`${label}: no destination card to tap`); await ctx.close(); return; }
  await page.touchscreen.tap(card.x, card.y);
  await page.waitForTimeout(3400);
  let kind = await sceneKind(page);
  for (let i = 0; i < 40 && (kind === 'cutscene' || kind === 'choice'); i++) {
    if (process.env.TRACE) console.log('   ', label, 'step', i, kind);
    if (kind === 'choice') {
      // TAP the option and then the way ashore: this is a touch test, so it is done by
      // touching -- and it also proves the decision screen works with a finger
      const target = await page.evaluate(() => {
        const d = window.__ARK.app.scene.debug();
        const r = d.taken >= 0 ? d.rects.go : (d.rects.cards || []).filter(Boolean)[0];
        if (!r || !r.w) return null;
        const c = document.getElementById('game').getBoundingClientRect();
        const s = window.__ARK.app.scale;
        return { x: c.left + (r.x + r.w / 2) * s, y: c.top + (r.y + r.h / 2) * s };
      });
      if (target) await page.touchscreen.tap(target.x, target.y);
      await page.waitForTimeout(600);
    } else {
      // ESC leaves a script outright. Tapping through eleven typed lines needs more than
      // twenty taps and the loop ran out of them before it ever reached the island.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(260);
    }
    kind = await sceneKind(page);
  }
  if (kind !== 'arena') { errors.push(`${label}: tapping a card led to "${kind}"`); await ctx.close(); return; }
  await page.waitForTimeout(900);

  // THE WHOLE GAME IS ONE GESTURE: press on one of yours and drag. Prove it on glass with
  // real touch events, because a drag is exactly the interaction a mouse test cannot stand in
  // for -- a card that is comfortable under a cursor can still be under a thumb, and a swipe
  // that the scene reads as a tap is a game that never fires a shot.
  const pts = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const mine = d.mine().filter((m) => !m.out && !m.aboard);
    const foes = d.foes();
    if (!mine.length || !foes.length) return null;
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    const card = (d.rects.cards || [])[0];
    return {
      mx: c.left + mine[0].x * s, my: c.top + mine[0].y * s,
      fx: c.left + foes[0].x * s, fy: c.top + foes[0].y * s,
      cardH: card ? card.h * s : 0,
      cardX: card ? c.left + (card.x + card.w / 2) * s : 0,
      cardY: card ? c.top + (card.y + card.h / 2) * s : 0,
      hp: foes[0].hp, foes: foes.length, scale: s,
    };
  });
  if (!pts) { errors.push(`${label}: nothing on the table to shoot with`); await ctx.close(); return; }
  if (pts.cardH && pts.cardH < 32) {
    errors.push(`${label}: a tray card is ${Math.round(pts.cardH)}px tall, under a thumb`);
  }
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(70);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
  };
  // tap the first tray card: picking with a finger has to work
  if (pts.cardX) await tap(pts.cardX, pts.cardY);
  await page.screenshot({ path: `shots/mobile-${label}-arena.png` });

  // then the drag: touchStart on the animal, move toward the beast, touchEnd
  const ang = Math.atan2(pts.fy - pts.my, pts.fx - pts.mx);
  const far = { x: pts.mx + Math.cos(ang) * 150 * pts.scale, y: pts.my + Math.sin(ang) * 150 * pts.scale };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts.mx, y: pts.my }] });
  await page.waitForTimeout(90);
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: pts.mx + (far.x - pts.mx) * (i / 6), y: pts.my + (far.y - pts.my) * (i / 6) }],
    });
    await page.waitForTimeout(45);
  }
  await page.screenshot({ path: `shots/mobile-${label}-aiming.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  for (let i = 0; i < 40; i++) {
    const ph = await page.evaluate(() => window.__ARK.app.scene.debug().phase);
    if (ph !== 'roll') break;
    await page.waitForTimeout(200);
  }
  const after = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const f0 = d.foes()[0];
    return { round: d.round, foes: d.foes().length, hp: f0 ? f0.hp : 0, fps: window.__ARK.app.fps };
  });
  if (after.round === 0 && after.foes === pts.foes && after.hp >= pts.hp) {
    errors.push(`${label}: a drag on glass fired nothing`);
  }
  console.log(`${label}: drag -> ${JSON.stringify(after)}`);
  await page.screenshot({ path: `shots/mobile-${label}-rescue.png` });
  await ctx.close();
}


await run('iphone', { width: 844, height: 390 }, false);
await run('pixel', { width: 915, height: 412 }, false);
await run('portrait', { width: 390, height: 844 }, true);

if (errors.length) { console.log('\nerrors:'); errors.slice(0, 8).forEach((e) => console.log('  x ' + e)); }
else console.log('\nno page errors on any mobile viewport');
await browser.close();
process.exit(errors.length ? 1 : 0);
