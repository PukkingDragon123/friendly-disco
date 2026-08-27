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
    if (d.arena) return 'arena';
    if (d.chart) return 'chart';
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
    if (kind === 'chart' || kind === 'ocean') return true;
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

const chart = await page.evaluate(() => {
  const d = window.__ARK.app.scene.debug();
  return { rows: d.rows, open: d.open(), at: d.at,
    stops: (d.rects.nodes || []).length };
});
console.log('chart:', JSON.stringify(chart));
// six rows: a chapter is one chart and a chapter is six legs
if (chart.rows < 6) errors.push(`the chart is only ${chart.rows} rows deep`);
if (!chart.open.length) errors.push('the chart offered nowhere to sail');
if (chart.stops < 12) errors.push(`the chart drew only ${chart.stops} stops`);

const oceanT = await drawTime(page);
console.log('chart draw:', JSON.stringify(oceanT));
if (oceanT && oceanT.drawMs > 16.6) errors.push(`chart draw ${oceanT.drawMs}ms exceeds a frame`);

// SAIL TO A SHORE, by clicking the stop rather than by asking the scene to go there: the
// click has to land on a reachable node's own rect, which is the thing that breaks when a
// layout changes and the thing a debug call would hide.
{
  const target = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const open = d.open();
    const want = open.find((n) => n.kind === 'fight') || open[0];
    if (!want) return null;
    const nr = (d.rects.nodes || []).find((x) => x.id === want.id);
    if (!nr) return null;
    const c = document.getElementById('game').getBoundingClientRect();
    const s = window.__ARK.app.scale;
    return { x: c.left + (nr.rect.x + nr.rect.w / 2) * s,
      y: c.top + (nr.rect.y + nr.rect.h / 2) * s, kind: want.kind };
  });
  if (!target) errors.push('no reachable stop had a rect to click');
  else {
    console.log('sailing to:', target.kind);
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(140);
    await page.mouse.click(target.x, target.y);
  }
}
await page.waitForTimeout(3600);
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
if (kind !== 'arena') {
  errors.push(`sailing led to "${kind}" instead of the shore`);
  console.log('logs:', logs.slice(-12).join(' | '));
} else {
  await page.screenshot({ path: `${OUT}-6-arena.png` });
  const scale = await page.evaluate(() => window.__ARK.app.scale);
  const box = await page.evaluate(() => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { left: r.left, top: r.top };
  });
  const at = (x, y) => ({ x: box.left + x * scale, y: box.top + y * scale });

  const open = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return { phase: d.phase, mine: d.mine().length, foes: d.foes().length,
      apples: d.apples, wave: d.wave };
  });
  console.log('arena:', JSON.stringify(open));
  if (!open.mine) errors.push('nothing of yours on the table');
  if (!open.foes) errors.push('nothing to shoot at');

  // A REAL DRAG SHOT, with a real mouse: press on the picked animal, pull toward a beast,
  // let go. This is the whole interface and it has to be exercised as a gesture rather than
  // through the debug hook, because the gesture is where the bugs are.
  const shot = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const me = d.mine().filter((m) => !m.out && !m.aboard)[0];
    const foe = d.foes()[0];
    return { mx: me.x, my: me.y, fx: foe.x, fy: foe.y, hp: foe.hp, id: foe.id };
  });
  {
    const a = Math.atan2(shot.fy - shot.my, shot.fx - shot.mx);
    const p0 = at(shot.mx, shot.my);
    const p1 = at(shot.mx + Math.cos(a) * 150, shot.my + Math.sin(a) * 150);
    // ONE FRAME PER STEP OF THE GESTURE. Pressing, dragging and releasing inside a single
    // frame is a legal thing for a mouse to do and the scene handles it, but a test that does
    // it cannot tell a dropped shot from a shot that has not landed -- so the harness slows
    // down to human speed and the scene is left to cope with the fast case on its own.
    await page.mouse.move(p0.x, p0.y);
    await page.waitForTimeout(90);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.move(p1.x, p1.y, { steps: 8 });
    await page.waitForTimeout(160);
    await page.screenshot({ path: `${OUT}-6b-aim.png` });
    await page.mouse.up();
    // AND WAIT FOR THE TABLE TO STOP -- but wait for it to START first. Sampling the phase
    // straight after the release read 'aim', because the release had not been through a frame
    // yet, so the loop exited before the shot existed and the check reported that a full-power
    // drag-shot changed nothing. Twice.
    await page.waitForTimeout(260);
    for (let i = 0; i < 50; i++) {
      const ph = await page.evaluate(() => window.__ARK.app.scene.debug().phase);
      if (ph !== 'roll') break;
      await page.waitForTimeout(200);
    }
  }
  const after = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    const f0 = d.foes()[0];
    return { phase: d.phase, round: d.round, foes: d.foes().length,
      hp: f0 ? f0.hp : 0, beaten: d.foes().filter((x) => x.dazed).length };
  });
  console.log('shot:', JSON.stringify(shot), '->', JSON.stringify(after));
  if (after.round === 0 && after.foes === open.foes && after.hp >= shot.hp) {
    errors.push('a full drag-shot at a beast changed nothing');
  }
  const arenaT = await drawTime(page);
  console.log('arena draw:', JSON.stringify(arenaT));
  if (arenaT && arenaT.drawMs > 16.6) errors.push(`arena draw ${arenaT.drawMs}ms exceeds a frame`);

  // the apple, through its own button
  const beforeApple = await page.evaluate(() => window.__ARK.app.scene.debug().apples);
  await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    if (d.phase === 'aim') d.apple(0);
  });
  await page.waitForTimeout(300);
  const afterApple = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return { apples: d.apples, beaten: d.foes().filter((x) => x.dazed).length };
  });
  console.log('apple:', beforeApple, '->', JSON.stringify(afterApple));

  // then play it out with the debug aim, and leave through the button. THIS RUNS IN REAL
  // TIME -- a round is a second of rolling -- so the budget is progress rather than a
  // finished fight: a browser check that needs ninety seconds of pool to pass is a browser
  // check nobody runs.
  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => {
      const d = window.__ARK.app.scene.debug();
      if (['won', 'lost', 'left'].indexOf(d.phase) >= 0) return { done: d.phase };
      if (d.phase !== 'aim') return { wait: true };
      const foes = d.foes();
      if (!foes.length) return { wait: true };
      const b = foes.find((x) => x.dazed) || foes[0];
      if (b.dazed) {
        const doors = [211, 480, 749];
        let dx = doors[0];
        for (const dd of doors) if (Math.abs(dd - b.x) < Math.abs(dx - b.x)) dx = dd;
        const ang = Math.atan2(150 - b.y, dx - b.x);
        d.aimAt(b.x - Math.cos(ang) * 46, b.y - Math.sin(ang) * 30);
      } else d.aimAt(b.x, b.y);
      return { shot: true };
    });
    if (st.done) { console.log('arena over:', st.done); break; }
    await page.waitForTimeout(st.wait ? 150 : 420);
  }
  await page.screenshot({ path: `${OUT}-7-arena-over.png` });
  const res = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return { phase: d.phase, caught: d.caught, r: d.result() };
  });
  console.log('result:', JSON.stringify({ phase: res.phase, caught: res.caught,
    rounds: res.r.rounds, shots: res.r.shots }));
  if (['won', 'lost', 'left'].indexOf(res.phase) < 0 && res.r.rounds < 4) {
    errors.push(`the fight made no progress (${res.phase}, ${res.r.rounds} rounds)`);
  }
  const dr = await page.evaluate(() => {
    const d = window.__ARK.app.scene.debug();
    return d.rects && d.rects.done ? d.rects.done : null;
  });
  if (dr) {
    const c = at(dr.x + dr.w / 2, dr.y + dr.h / 2);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(1400);
  }
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
