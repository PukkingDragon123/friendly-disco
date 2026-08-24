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
const { likeness } = await import('../src/data/habitats.js');

const SEEDS = Number(process.argv[2]) || 3;
const SHOTS = process.argv.includes('--shots');
const VERBOSE = process.argv.includes('--verbose');

const cv = new SoftCanvas(960, 540);
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
      // traits, not biomes: a berth is worth what the animal thinks of it
      const fit = a ? (a.id === 'chameleon' ? 1 : likeness(a, gate.habitatId)) : 0;
      const home = fit >= 0.999;
      const score = (reaches ? 100 : 0) + fit * 55 + (a ? a.chips * 0.06 : 0) - dist * 0.05;
      if (!best || score > best.score) best = { ball: b, gate, ang, power, score, home, reaches };
    }
  }
  return best;
}

/**
 * The ramp: pick the eight head with the best board coverage. The scene's own
 * auto-fill does exactly this, so the bot mostly exists to prove that CLICKING the
 * cards works -- it takes four by hand and lets the fill finish the job.
 */
function playDraft(app) {
  const d = app.scene.debug();
  snap('ramp');
  const rects = d.rects.cards || [];
  let taken = 0;
  for (let i = 0; i < rects.length && taken < 4; i++) {
    const r = rects[i];
    if (!r) continue;
    const [cx, cy] = centre(r);
    pressAt(cx, cy); tick(app, 2); releaseNow(); tick(app, 2);
    taken++;
  }
  const after = app.scene.debug();
  if (after.chosen.length !== taken) errors.push(`ramp: clicked ${taken} cards, chose ${after.chosen.length}`);
  const [bx, by] = centre(d.rects.board);
  pressAt(bx, by); tick(app, 2); releaseNow(); tick(app, 8);
  const run = after.run || null;
  void run;
  return 'boarded';
}

/**
 * The garden. This is the one scene with a modal in it, so the bot's real job here is
 * to prove the whole chain works from a click: buy an apple, plant it, sit through the
 * shake, click the eye, and take one of the three.
 */
function playEden(app) {
  const d0 = app.scene.debug();
  snap('eden');
  const money0 = d0.run.money;

  // buy the cheapest apple we can afford
  let bought = -1;
  for (let i = 0; i < d0.apples.length; i++) {
    if (d0.run.money >= d0.apples[i].price) {
      const [ax, ay] = centre(d0.rects.apples[i]);
      pressAt(ax, ay); tick(app, 2); releaseNow(); tick(app, 3);
      if (app.scene.debug().basket.length) { bought = i; break; }
    }
  }
  if (bought >= 0) {
    if (app.scene.debug().run.money >= money0) errors.push('eden: apple was free');
    // plant it in the first bush
    const [bx, by] = centre(app.scene.debug().rects.bushes[0]);
    pressAt(bx, by); tick(app, 2); releaseNow(); tick(app, 4);
    let rv = app.scene.debug().reveal;
    if (!rv) errors.push('eden: planting did not open a bush');
    else {
      // sit through the shake, then click the eye
      tick(app, 80);
      snap('eden-eye');
      rv = app.scene.debug().reveal;
      if (!rv || rv.phase !== 'eye') errors.push(`eden: expected the eye, got ${rv ? rv.phase : 'nothing'}`);
      // the eye ignores a click until it has finished opening, on purpose -- so does
      // the bot have to wait for it
      tick(app, 40);
      pressAt(480, 250); tick(app, 2); releaseNow(); tick(app, 50);
      rv = app.scene.debug().reveal;
      if (!rv || rv.phase !== 'choose') errors.push(`eden: expected a choice, got ${rv ? rv.phase : 'nothing'}`);
      else {
        snap('eden-choose');
        const cr = app.scene.debug().rects.choices;
        // Take the first one we can pay the lure on. Success is the reveal reaching
        // 'done', NOT the caravan growing -- a poison apple boards one animal and
        // drowns another, so the count is unchanged and that is correct.
        let took = false;
        for (let i = 0; i < cr.length; i++) {
          if (!cr[i]) continue;
          const [cx2, cy2] = centre(cr[i]);
          pressAt(cx2, cy2); tick(app, 2); releaseNow(); tick(app, 6);
          const now = app.scene.debug().reveal;
          if (!now || now.phase === 'done') { took = true; break; }
        }
        // Not affording any lure is legitimate -- the apple stays in the bush. What
        // must NOT happen is being trapped in the modal with no way out.
        if (!took) {
          const lr = app.scene.debug().rects.leave;
          if (!lr || !lr.w) { errors.push('eden: no lure affordable and no way out of the modal'); }
          else {
            const [lx, ly] = centre(lr);
            pressAt(lx, ly); tick(app, 2); releaseNow(); tick(app, 6);
            if (app.scene.debug().reveal) errors.push('eden: LEAVE IT did not close the reveal');
            const bs = app.scene.debug().bushes;
            if (!bs.some(Boolean)) errors.push('eden: leaving lost the apple');
          }
        }
      }
      tick(app, 40);
    }
  }

  // buy a blessing and a tool if we can, then cast off
  const d1 = app.scene.debug();
  for (let i = 0; i < d1.rects.cards.length; i++) {
    if (d1.cards[i] && d1.run.money >= d1.cards[i].price && !d1.run.blessing) {
      const [x2, y2] = centre(d1.rects.cards[i]);
      pressAt(x2, y2); tick(app, 2); releaseNow(); tick(app, 3);
    }
  }
  const d2 = app.scene.debug();
  for (let i = 0; i < d2.rects.tools.length; i++) {
    if (d2.tools[i] && d2.run.money >= d2.tools[i].price) {
      const [x2, y2] = centre(d2.rects.tools[i]);
      pressAt(x2, y2); tick(app, 2); releaseNow(); tick(app, 3);
    }
  }
  const [sx2, sy2] = centre(app.scene.debug().rects.sail);
  pressAt(sx2, sy2); tick(app, 2); releaseNow(); tick(app, 8);
}

function playDeck(app, log) {
  let guard = 0;
  while (guard++ < 400) {
    const d = app.scene.debug ? app.scene.debug() : null;
    if (!d) { errors.push('deck scene exposes no debug()'); return 'error'; }
    if (d.phase === 'cleared' || d.phase === 'failed') {
      tick(app, 70);
      snap(d.phase);
      pressAt(480, 300); tick(app, 2); releaseNow(); tick(app, 4);
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
    if (d.stock !== undefined) { playDraft(app); continue; }             // the ramp
    if (d.rects && d.rects.sail) { playEden(app); continue; }            // the garden
    if (d.rects && d.rects.crates) { playDock(app); continue; }          // the freighter
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
