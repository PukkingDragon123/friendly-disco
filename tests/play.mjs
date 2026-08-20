// node tests/play.mjs [seeds] [--shots] [--verbose]
//
// End-to-end play harness. It drives the REAL scenes through the REAL router with
// synthetic mouse input — menu, deck, dock, summary — for a whole run, and fails on any
// exception escaping a frame. This is the test that catches integration bugs the
// per-module suites cannot see: a scene that never leaves a phase, a shop that cannot be
// exited, a blind that racks zero animals, a click that lands on nothing.

import { installDom } from '../tools/stubdom.mjs';
installDom();
const { SoftCanvas, writePNG } = await import('../tools/softcanvas.mjs');
const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');
const { createRouter, guardScene } = await import('../src/game/router.js');
const PH = await import('../src/game/physics.js');
const T = await import('../src/render/table.js');
const { ANIMAL_BY_ID } = await import('../src/data/animals.js');

const SEEDS = Number(process.argv[2]) || 3;
const SHOTS = process.argv.includes('--shots');
const VERBOSE = process.argv.includes('--verbose');

const cv = new SoftCanvas(640, 360);
const g = cv.getContext('2d');
const DT = 1 / 60;

let errors = [];
let shotIx = 0;

function makeApp() {
  let scene = null;
  const app = {
    g, canvas: cv, scale: 1, time: 0, frame: 0, depth: 1, fps: 60,
    get scene() { return scene; },
    replace(s, args) {
      if (scene && scene.exit) scene.exit();
      scene = guardScene(s, (e, where) => errors.push(`${where}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`));
      if (scene.enter) scene.enter(args, app);
      return scene;
    },
    push(s, args) { return app.replace(s, args); },
    pop() {},
    fit() {},
  };
  return app;
}

/* --------------------------------------------------------------- input rig */

const mouse = Input.mouse;
function at(x, y) { mouse.x = x; mouse.y = y; mouse.inside = true; }
function pressAt(x, y) { at(x, y); mouse.down = true; mouse.pressed = true; mouse.downX = x; mouse.downY = y; }
function releaseNow() { mouse.down = false; mouse.released = true; }
function centre(r) { return [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)]; }

// Software rasterising a full frame (the seascape alone is ~250 dithered rows) costs
// far more than the game logic, so draw on a 1-in-DRAW_EVERY cadence. Every code path
// in draw() is still exercised many times per blind, and the harness is ~10x faster.
const DRAW_EVERY = Number(process.env.DRAW_EVERY || 12);

function tick(app, n = 1) {
  for (let i = 0; i < n; i++) {
    app.frame++;
    app.time += DT;
    Juice.update(DT);
    if (app.scene && app.scene.update) app.scene.update(DT * Juice.timeScale, app, DT);
    if (app.frame % DRAW_EVERY === 0) {
      if (app.scene && app.scene.draw) app.scene.draw(g, app);
      if (app.scene && app.scene.drawUI) app.scene.drawUI(g, app);
    }
    Input.consume();
  }
}

function snap(name) {
  if (!SHOTS) return;
  if (app.scene && app.scene.draw) app.scene.draw(g, app);
  writePNG(cv, `shots/play-${String(++shotIx).padStart(2, '0')}-${name}.png`, 2);
}

/* ----------------------------------------------------------------- the bot */

/** Pick the (ball, gate) pair a decent player would take: reachable, and preferably home. */
function chooseShot(world, gates) {
  let best = null;
  for (const b of world.balls) {
    if (b.sunk) continue;
    const a = ANIMAL_BY_ID[b.animalId];
    for (const gate of gates) {
      if (gate.closed) continue;
      const dx = gate.x - b.x, dy = gate.y - b.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const power = Math.min(1, 0.3 + dist / 260);
      const p = PH.predict(world, b, ang, power, 60);
      const reaches = !!(p && p.hit && p.hit.kind === 'gate' && p.hit.id === gate.id);
      const home = !!(a && (a.home === gate.habitatId || a.id === 'chameleon'));
      const score = (reaches ? 100 : 0) + (home ? 55 : 0) + (a ? a.chips * 0.06 : 0) - dist * 0.05;
      if (!best || score > best.score) best = { ball: b, gate, ang, power, score, home, reaches };
    }
  }
  return best;
}

function playDeck(app, log) {
  let guard = 0;
  while (guard++ < 400) {
    const d = app.scene.debug ? app.scene.debug() : null;
    if (!d) { errors.push('deck scene exposes no debug()'); return 'error'; }
    if (d.phase === 'cleared' || d.phase === 'failed') {
      tick(app, 70);
      snap(d.phase);
      pressAt(320, 200); tick(app, 2); releaseNow(); tick(app, 4);
      return d.phase;
    }
    if (d.phase === 'intro') { tick(app, 70); continue; }
    if (d.phase !== 'aim') { tick(app, 10); continue; }

    const pick = chooseShot(d.world, d.world.gates || []);
    if (!pick) { tick(app, 5); continue; }

    // Select the ball ONLY if it is not already selected: clicking the selected ball
    // starts a charge, and releasing two frames later fires a wasted tap shot.
    if (d.selected !== pick.ball) {
      const bs = T.toScreen(pick.ball.x, pick.ball.y);
      pressAt(Math.round(bs.x), Math.round(bs.y - Math.round(T.ballPixelRadius(pick.ball.r, pick.ball.y) * 0.55)));
      tick(app, 2);
      releaseNow();
      tick(app, 3);
      const after = app.scene.debug();
      if (after.selected !== pick.ball) { tick(app, 2); continue; }   // click missed; re-plan
    }

    const tgt = T.toScreen(pick.gate.x, pick.gate.y);
    at(Math.round(tgt.x), Math.round(tgt.y));
    tick(app, 2);
    pressAt(Math.round(tgt.x), Math.round(tgt.y));
    tick(app, 2);
    // hold until the meter reaches the power we want (ramps over 0.85s)
    const holdFrames = Math.max(2, Math.round(pick.power * 0.85 * 60));
    tick(app, holdFrames);
    releaseNow();
    tick(app, 4);

    // let the shot roll and score out
    let spin = 0;
    while (spin++ < 900) {
      const dd = app.scene.debug();
      if (dd.phase === 'aim' || dd.phase === 'cleared' || dd.phase === 'failed') break;
      tick(app, 1);
    }
    if (spin >= 900) { errors.push('a shot never resolved (stuck in roll/score)'); return 'stuck'; }
    if (log) {
      const dd = app.scene.debug();
      log.push(`   shot ${dd.run.stats.shotsTaken}: score ${dd.run.score}/${dd.run.target} shots left ${dd.run.shotsLeft}`);
    }
  }
  errors.push('deck scene never finished a blind');
  return 'stuck';
}

/** Click through a dialogue script. Two clicks per line: finish the type, then advance. */
function playCutscene(app, id) {
  let guard = 0;
  while (guard++ < 400) {
    const d = app.scene.debug ? app.scene.debug() : null;
    if (!d || d.scriptId === undefined || d.scriptId !== id) return;
    if (d.outT >= 0) { tick(app, 40); return; }
    pressAt(320, 300); tick(app, 2); releaseNow(); tick(app, 3);
  }
  errors.push(`cutscene ${id} never finished`);
}

function playDock(app) {
  tick(app, 20);
  snap('dock');
  const d0 = app.scene.debug ? app.scene.debug() : null;
  if (!d0) { errors.push('dock scene exposes no debug()'); return; }

  // Prefer a crate with a relic in it — relics are the most complex acquisition path
  // (hooks, modifyRun, slot limits), so the harness should hit it every visit it can.
  const hasRelic = (c) => (c.contents || []).some((it) => it.kind === 'relic');
  const affordable = (d0.manifest || [])
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.price <= d0.run.money)
    .sort((a, b) => (hasRelic(b.c) ? 1000 : 0) + b.c.price - ((hasRelic(a.c) ? 1000 : 0) + a.c.price))[0];

  if (affordable && d0.rects.crates[affordable.i]) {
    const [cx, cy] = centre(d0.rects.crates[affordable.i]);
    pressAt(cx, cy); tick(app, 2); releaseNow(); tick(app, 4);
    // sit through the whole delivery
    let guard = 0;
    while (guard++ < 1400) {
      const d = app.scene.debug();
      if (d.mode !== 'deliver') break;
      if (guard === 120) snap('boat-inbound');
      if (d.revealIx > 0 && guard % 400 === 0) snap('crate-open');
      // once everything is revealed the scene waits for a click
      if (d.revealIx >= (d.gotItems || []).length && d.seqT > 1.2) {
        snap('unloaded');
        pressAt(320, 200); tick(app, 2); releaseNow();
      }
      tick(app, 1);
    }
    if (guard >= 1400) errors.push('delivery sequence never finished');
  }

  tick(app, 10);
  const d1 = app.scene.debug();
  const [bx, by] = centre(d1.rects.cast);
  pressAt(bx, by); tick(app, 2); releaseNow(); tick(app, 4);
}

/* -------------------------------------------------------------------- run */

let app = makeApp();
const summary = [];

for (let s = 0; s < SEEDS; s++) {
  errors = [];
  app = makeApp();
  const router = createRouter(app);
  const seed = 'PLAY-' + s;

  router.menu();
  tick(app, 30);
  const md = app.scene.debug();
  const [mx, my] = centre(md.rects.start);
  pressAt(mx, my); tick(app, 2); releaseNow(); tick(app, 6);
  snap('menu');

  // the menu's own seed is random; force ours so the run is reproducible
  router.startRun(seed);
  tick(app, 4);

  const log = [];
  let blinds = 0;
  let outcome = 'ran out of steps';
  for (let guard = 0; guard < 80; guard++) {
    const d = app.scene.debug ? app.scene.debug() : {};
    if (d.scriptId !== undefined) { playCutscene(app, d.scriptId); continue; }  // dialogue
    if (d.rects && d.rects.crates) { playDock(app); continue; }         // dock
    if (d.rects && d.rects.again) {                                      // summary
      outcome = d.won ? 'WON THE RUN' : `died on ante ${d.run.ante}`;
      snap('summary');
      break;
    }
    if (d.phase !== undefined) {
      const kind = d.run.blind ? d.run.blind.kind : '?';
      log.push(` ante ${d.run.ante} ${kind} target ${d.run.target} flood/shot ${(d.run.floodPerShot || 0).toFixed(2)}`);
      if (blinds === 0) snap('deck');
      const r = playDeck(app, VERBOSE ? log : null);
      blinds++;
      log.push(`   -> ${r} at ${d.run.score}`);
      if (r === 'stuck' || r === 'error') break;
      tick(app, 6);
      continue;
    }
    tick(app, 10);
  }

  const dr = app.scene.debug && app.scene.debug().run;
  const money = dr ? dr.money : 0;
  summary.push({ seed, blinds, outcome, money, errors: errors.slice() });
  const extra = dr ? ` · $${dr.money} · ${dr.caravan.length} animals · ${dr.relics.length} relics · ${dr.stats.cratesBought} crates` : '';
  console.log(`\n\x1b[1m${seed}\x1b[0m — ${blinds} blinds played, ${outcome}${extra}`);
  for (const l of log) console.log(l);
  if (errors.length) { console.log('  \x1b[31merrors:\x1b[0m'); for (const e of errors.slice(0, 8)) console.log('   ✗ ' + e); }
}

const bad = summary.filter((x) => x.errors.length);
const played = summary.reduce((a, b) => a + b.blinds, 0);
console.log(`\n${'═'.repeat(62)}`);
console.log(`${summary.length} runs, ${played} blinds played end to end`);
if (bad.length) {
  console.log(`\x1b[31m${bad.length} run(s) hit errors\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mno exceptions escaped a frame\x1b[0m');
