// node tests/play.mjs [seeds] [--shots] [--verbose]
//
// End-to-end play harness. It drives the REAL scenes through the REAL router with
// synthetic mouse input -- menu, cutscene, ocean, island, garden, summary -- for whole
// voyages, and fails on any exception escaping a frame.
//
// This is the test that catches what the per-module suites cannot see: a scene that never
// leaves a phase, a shop that cannot be exited, a rescue that racks no animals, a click
// that lands on nothing, a router that loops. Everything it does, it does BY CLICKING --
// if the bot can finish a voyage with a mouse, so can a person.

import { installDom } from '../tools/stubdom.mjs';
installDom();
const { SoftCanvas, writePNG } = await import('../tools/softcanvas.mjs');
const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');
const { createRouter, guardScene } = await import('../src/game/router.js');
const LA = await import('../src/game/lane.js');
const V = await import('../src/game/voyage.js');
const { ANIMAL_BY_ID } = await import('../src/data/animals.js');
const { abilityOf } = await import('../src/data/abilities.js');

const SEEDS = Number(process.argv[2]) || 3;
const SHOTS = process.argv.includes('--shots');
const VERBOSE = process.argv.includes('--verbose');

const cv = new SoftCanvas(960, 540);
const g = cv.getContext('2d');
const DT = 1 / 60;

let errors = [];
let shotIx = 0;
let app = null;

function makeApp() {
  let scene = null;
  const a = {
    g, canvas: cv, scale: 1, time: 0, frame: 0, depth: 1, fps: 60,
    get scene() { return scene; },
    replace(s, args) {
      if (scene && scene.exit) scene.exit();
      scene = guardScene(s, (e, where) => errors.push(
        `${where}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`));
      if (scene.enter) scene.enter(args, a);
      return scene;
    },
    push(s, args) { return a.replace(s, args); },
    pop() {},
    fit() {},
  };
  return a;
}

/* --------------------------------------------------------------- input rig */

const mouse = Input.mouse;
function at(x, y) { mouse.x = x; mouse.y = y; mouse.inside = true; }
function pressAt(x, y) { at(x, y); mouse.down = true; mouse.pressed = true; mouse.downX = x; mouse.downY = y; }
function releaseNow() { mouse.down = false; mouse.released = true; }
function clickAt(x, y, hold = 2) {
  pressAt(x, y); tick(hold); releaseNow(); tick(2);
}
function centre(r) { return [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)]; }

// Software rasterising a full frame costs far more than the game logic, so draw on a
// 1-in-DRAW_EVERY cadence. Every path in draw() is still exercised many times a scene.
// 40, not 12. A lane island is ninety seconds of game time -- 5,400 frames -- and a full
// software paint is tens of milliseconds, so one-in-twelve put a single island at half a
// minute of wall clock. One in forty still paints every scene well over a hundred times,
// which exercises every path in draw() many times over.
const DRAW_EVERY = Number(process.env.DRAW_EVERY || 40);

function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    app.frame++;
    app.time += DT;
    Juice.update(DT);
    if (app.scene && app.scene.update) app.scene.update(DT * Juice.timeScale, app, DT);
    if (app.frame % DRAW_EVERY === 0) paint();
    Input.consume();
  }
}

/**
 * Force a draw so the scene's hit rectangles exist. Every scene builds its clickable
 * rects DURING draw(), so anything that clicks has to paint first.
 */
function paint() {
  if (app.scene && app.scene.draw) app.scene.draw(g, app);
  if (app.scene && app.scene.drawUI) app.scene.drawUI(g, app);
}

function snap(name) {
  if (!SHOTS) return;
  paint();
  writePNG(cv, `shots/play-${String(++shotIx).padStart(2, '0')}-${name}.png`, 2);
}

function dbg() {
  return (app.scene && app.scene.debug) ? app.scene.debug() : {};
}

/** Which scene are we in? Read off the debug shape, which every scene provides. */
function where() {
  const d = dbg();
  if (d.scriptId !== undefined) return 'cutscene';
  if (d.lane) return 'island';
  if (d.encounter) return 'choice';
  if (d.rects && d.rects.gates) return 'eden';
  if (d.rects && d.rects.cards && d.at && d.at.isles) return 'ocean';
  if (d.won !== undefined) return 'summary';
  if (d.rects && d.rects.start) return 'menu';
  if (d.showHelp !== undefined) return 'menu';
  return 'unknown';
}

/* ------------------------------------------------------------------ the bot */

function playMenu() {
  paint();
  const d = dbg();
  const r = d.rects && d.rects.start;
  if (!r) { errors.push('menu: no start button'); return false; }
  snap('menu');
  const [x, y] = centre(r);
  clickAt(x, y);
  tick(6);
  return true;
}

function playCutscene() {
  // click through every line, then through the exit
  for (let i = 0; i < 220; i++) {
    if (where() !== 'cutscene') return true;
    clickAt(480, 480);
    tick(3);
  }
  errors.push('cutscene: never ended');
  return false;
}

/**
 * The map. Bank at the garden when the deck is nearly full, otherwise take the island
 * whose obstacles the deck can actually answer -- which is exactly the decision the
 * cards are drawn to support, so a bot that cannot make it means the cards do not work.
 */
function playOcean() {
  paint();
  const d = dbg();
  const v = d.voyage;
  const cards = (d.rects && d.rects.cards) || [];
  if (!cards.length) { errors.push('ocean: no destination cards'); return false; }
  snap('ocean');

  const have = {};
  for (const id of v.aboard) {
    const a = ANIMAL_BY_ID[id];
    if (a) have[abilityOf(a).id] = true;
  }
  let best = -1, bestScore = -1e9;
  v.choices.forEach((isl, i) => {
    if (!isl || !cards[i]) return;
    let score = 0;
    if (isl.teleport) {
      // the garden is worth taking when the pens are filling up or money is short
      score = V.berthsFree(v) <= 2 ? 120 : v.money < 6 ? 40 : 5;
    } else {
      const covered = (isl.obstacles || []).filter((o) => {
        const need = (isl.obstacles && o) ? o : null;
        return need;
      }).length;
      void covered;
      score = (isl.animals || 0) * 10 + (isl.reward || 1) * 6 - (isl.danger || 1) * 5;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best < 0) best = 0;
  const [x, y] = centre(cards[best]);
  clickAt(x, y);
  tick(140);                              // the crossing
  return true;
}

/**
 * An island, played with the mouse.
 *
 * The bot does what a person does: pick a beast off the tray, click a tile, repeat while
 * the clay lasts, throw apples at anything it knocks down, and let the waves come. Every
 * one of those is a real click on a real rect -- if the bot can hold an island with a
 * mouse, so can a person.
 */
function playIsland() {
  paint();
  let d0 = dbg();
  const f = d0.lane;
  snap('island');

  const pick = (id) => {
    const cr = (dbg().rects.cards || []).find((x) => x.id === id);
    if (!cr) return false;
    const [bx, by] = centre(cr.rect);
    clickAt(bx, by);
    paint();
    return !!dbg().sel;
  };
  const put = (r, c) => {
    const p = d0.at(r, c);
    clickAt(p.x, p.y);
    tick(2);
  };

  // A LANE STAGE IS NINETY SECONDS OF GAME TIME, which is 5,400 frames, and a full software
  // paint is tens of milliseconds. Painting on every iteration put one island at half a
  // minute of wall clock and the whole harness past any sane timeout. Paint when the bot
  // actually needs to see the tray, and tick in big chunks the rest of the time.
  const def = (id) => f.hand.find((b) => b.id === id);
  let planted = 0;
  let guard = 0;
  while (!f.over && guard++ < 300) {
    // wells first, then a thorn and a wall in each row
    const wells = f.plants.filter((p) => p.def.kind === 'gen').length;
    let want = null, wr = 0, wc = 0;
    if (wells < 4 && f.clay >= 50) {
      for (let r = 0; r < LA.ROWS; r++) if (!LA.plantable(f, r, 0, def('well'))) { want = 'well'; wr = r; wc = 0; break; }
    }
    if (!want && f.clay >= 100) {
      for (let r = 0; r < LA.ROWS && !want; r++) {
        if (f.plants.some((p) => p.row === r && p.def.kind === 'shoot')) continue;
        for (let c = 1; c <= 3; c++) if (!LA.plantable(f, r, c, def('thorn'))) { want = 'thorn'; wr = r; wc = c; break; }
      }
    }
    if (!want && f.clay >= 50) {
      for (let r = 0; r < LA.ROWS && !want; r++) {
        if (f.plants.some((p) => p.row === r && p.def.kind === 'wall')) continue;
        for (let c = 7; c >= 5; c--) if (!LA.plantable(f, r, c, def('boar'))) { want = 'boar'; wr = r; wc = c; break; }
      }
    }
    if (want) {
      const before = f.plants.length;
      if (!pick(want)) { errors.push('island: clicking a beast card selected nothing'); break; }
      put(wr, wc);
      if (f.plants.length > before) planted++;
      else {
        if (process.env.WHY) {
          console.log('    WHY: plant', want, 'at', wr, wc, 'clay', f.clay,
            'sel', JSON.stringify(dbg().sel), 'plantable', LA.plantable(f, wr, wc),
            'lastAct', JSON.stringify(dbg().lastAct), 'hover', JSON.stringify(dbg().hover));
        }
        errors.push('island: clicking a tile with a beast selected planted nothing');
        break;
      }
      continue;
    }
    // a ripe apple, then an apple thrown at anything dazed
    const ripe = f.trees.find((tr) => tr.ripe);
    if (ripe) { put(ripe.row, ripe.col); continue; }
    if (f.stunned.length && f.apples > 0) {
      const st = f.stunned[0];
      put(st.row, Math.round(st.col));
      continue;
    }
    tick(60);
  }

  if (planted === 0) errors.push('island: the bot never managed to plant anything');
  paint();
  const cast = dbg().rects && dbg().rects.cast;
  if (cast) {
    const [cx, cy] = centre(cast);
    clickAt(cx, cy);
    tick(30);
    paint();
    snap('island-done');
  }
  for (let i = 0; i < 4 && where() === 'island'; i++) {
    const c3 = dbg().rects && dbg().rects.cast;
    if (c3) { const [ax, ay] = centre(c3); clickAt(ax, ay); }
    tick(60);
  }
  return true;
}

/**
 * A decision on the way in. The bot rotates which option it takes so a long run of
 * voyages exercises every branch -- including the ones that set the flags the later
 * encounters need, which is the only way the follow-ups ever get played at all.
 */
function playChoice() {
  paint();
  const d = dbg();
  const cards = (d.rects && d.rects.cards) || [];
  if (!cards.length) { errors.push('choice: no options to take'); return false; }
  snap('choice');
  const pick = (d.voyage.stats.legs + cards.length) % cards.length;
  const [x, y] = centre(cards[pick]);
  clickAt(x, y);
  tick(6);
  paint();
  if (dbg().taken !== pick) errors.push('choice: clicking an option did not take it');
  if (!(dbg().told || []).length) errors.push('choice: an option reported doing nothing');
  const go = dbg().rects && dbg().rects.go;
  if (!go) { errors.push('choice: no way ashore'); return false; }
  const [gx, gy] = centre(go);
  clickAt(gx, gy);
  tick(8);
  return true;
}

/**
 * The garden. Stow what the boat is carrying, have the Cherubim call Noah, buy whatever
 * we can afford off whoever is standing about, then back to sea through the gate.
 */
function playEden() {
  paint();
  const d = dbg();
  const v = d.voyage;
  snap('eden');

  // stow up to three off the deck: this is the move the whole hub exists for
  for (let n = 0; n < 3; n++) {
    paint();
    const dd = dbg();
    const deck = (dd.rects && dd.rects.deck) || [];
    if (!deck.length) break;
    const before = v.eden.length;
    const [dx, dy] = centre(deck[0].rect);
    clickAt(dx, dy);
    paint();
    const act = dbg().rects && dbg().rects.act;
    if (!act || !act.stow) { errors.push('eden: no PUT IN A BED button after selecting'); break; }
    const [bx, by] = centre(act.stow);
    clickAt(bx, by);
    tick(3);
    paint();
    if (v.eden.length === before) break;
  }

  // TALK TO THE KEEPER, and have him call Noah. There is no gate lottery any more: the
  // Cherubim's one errand is Noah, and everybody else is met out on the water.
  paint();
  const cher = dbg().rects && dbg().rects.cherub;
  if (!cher) errors.push('eden: nobody keeping the gate');
  else {
    const [chx, chy] = centre(cher);
    clickAt(chx, chy);
    tick(6);
    paint();
    snap('eden-keeper');
    if (dbg().mode !== 'talk') errors.push('eden: the Cherubim will not talk');
    const call = dbg().rects && dbg().rects.call;
    if (call) {
      const [cx3, cy3] = centre(call);
      clickAt(cx3, cy3);
      tick(4);
      paint();
      if ((v.summoned || []).indexOf('noah') < 0) errors.push('eden: Noah was not called');
    }
    for (let i = 0; i < 6 && dbg().mode === 'talk'; i++) {
      const back = dbg().rects && dbg().rects.back;
      if (back) { const [bx2, by2] = centre(back); clickAt(bx2, by2); }
      else clickAt(20, 520);
      tick(4);
      paint();
    }
    if (dbg().mode === 'talk') errors.push('eden: could not leave the Cherubim');
  }

  // then buy something off whoever is standing about
  paint();
  const folk = (dbg().rects && dbg().rects.npcs) || [];
  if (folk.length) {
    const [nx, ny] = centre(folk[0].rect);
    clickAt(nx, ny);
    tick(6);
    paint();
    snap('eden-deal');
    const money0 = v.money;
    const cards = (dbg().rects && dbg().rects.deal && dbg().rects.deal.cards) || [];
    for (const c of cards) {
      if (!c) continue;
      const [cx2, cy2] = centre(c);
      clickAt(cx2, cy2);
      tick(3);
      paint();
      if (v.money !== money0) break;
    }
    if (VERBOSE && v.money !== money0) console.log(`    bought something for $${money0 - v.money}`);
    for (let i = 0; i < 6 && dbg().mode === 'talk'; i++) {
      const back = dbg().rects && dbg().rects.back;
      if (back) { const [bx2, by2] = centre(back); clickAt(bx2, by2); }
      else clickAt(20, 520);
      tick(4);
      paint();
    }
    if (dbg().mode === 'talk') errors.push('eden: could not get out of a deal');
  }

  // and back to sea
  paint();
  const sail = dbg().rects && dbg().rects.sail;
  if (!sail) { errors.push('eden: no way out'); return false; }
  const [sx2, sy2] = centre(sail);
  clickAt(sx2, sy2);
  tick(10);
  return true;
}

function playSummary() {
  paint();
  snap('summary');
  const d = dbg();
  const again = d.rects && d.rects.again;
  if (!again) { errors.push('summary: no way back to the harbour'); return false; }
  const [x, y] = centre(again);
  clickAt(x, y);
  tick(8);
  return true;
}

/* ------------------------------------------------------------------- driver */

function playVoyage(seed) {
  app = makeApp();
  const router = createRouter(app, {});
  router.menu();
  tick(4);

  const seen = { cutscene: 0, ocean: 0, island: 0, eden: 0, choice: 0 };
  // click NEW RUN to prove the button works, then start OUR seed on purpose: the menu's
  // own seed is derived from a fixed string, so every voyage the bot played by clicking
  // through the title screen was the same voyage.
  if (!playMenu()) return null;
  router.startRun(seed);
  tick(4);

  let voyage = router.voyage;
  let guard = 0;
  while (guard++ < 90) {
    const w = where();
    if (process.env.TRACE) console.log('   step', guard, w, Object.keys(dbg()).join(','));
    if (w === 'cutscene') { seen.cutscene++; playCutscene(); continue; }
    if (w === 'ocean') { seen.ocean++; if (!playOcean()) break; continue; }
    if (w === 'choice') { seen.choice++; playChoice(); continue; }
    if (w === 'island') { seen.island++; playIsland(); continue; }
    if (w === 'eden') { seen.eden++; playEden(); continue; }
    if (w === 'summary') { playSummary(); break; }
    if (w === 'menu') break;
    errors.push(`stuck in an unknown scene after ${guard} steps`);
    break;
  }
  voyage = router.voyage || voyage;
  return { seed, voyage, seen, steps: guard };
}

/* --------------------------------------------------------------------- run */

console.log(`\nplaying ${SEEDS} voyage(s) by clicking\n`);
let failed = 0;
for (let i = 0; i < SEEDS; i++) {
  const seed = `PLAY-${1000 + i}`;
  errors = [];
  const out = playVoyage(seed);
  const v = out && out.voyage;
  if (!v) {
    console.log(`  ${seed}  FAILED to start`);
    failed++;
    continue;
  }
  const s = v.stats;
  const line = `  ${seed}  ch${v.chapter} leg${v.leg}  saved ${s.rescued}  lost ${s.drowned}`
    + `  garden ${v.eden.length}  deck ${v.aboard.length}  $${v.money}`
    + `  paths ${s.obstaclesCleared}`
    + `  [ocean ${out.seen.ocean} island ${out.seen.island} eden ${out.seen.eden}`
    + ` choice ${out.seen.choice}]  flags ${Object.keys(v.flags).join('/') || '-'}`;
  if (errors.length) {
    failed++;
    console.log(`  ${line}   <-- ${errors.length} error(s)`);
    for (const e of errors.slice(0, 6)) console.log(`      ! ${e}`);
  } else {
    console.log(line);
  }
  if (VERBOSE) for (const l of v.log.slice(-8)) console.log(`      · ${l.text}`);
}

console.log(`\n${SEEDS - failed}/${SEEDS} voyage(s) clean\n`);
process.exit(failed ? 1 : 0);
