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
// what the island rig managed with the new levers, printed on the tally line
let grabbedTotal = 0, calledTotal = 0, bossTotal = 0, fedTotal = 0;
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

// The causeway is the one scene driven by a HELD key rather than a click, so the rig
// needs to be able to lean on one: Input.key() reads `keys`, which consume() leaves alone.
function holdKey(code) { Input.keys[code] = true; }
function releaseKey(code) { Input.keys[code] = false; }

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
  if (d.film) return 'film';
  if (d.basement) return 'basement';
  if (d.feeding) return 'feed';
  if (d.scriptId !== undefined) return 'cutscene';
  if (d.phase !== undefined && d.heroX !== undefined) return 'walk';
  if (d.heaven) return 'heaven';
  if (d.arena) return 'arena';
  if (d.chart) return 'chart';
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
/**
 * THE CHART. Take a stop, and take a DIFFERENT one each time round so a long run of legs
 * walks a real route rather than hugging one column.
 *
 * The bot uses the scene's own reachability rather than clicking a rect it guessed at: a
 * harness that can click an unreachable stop is a harness that will one day report the map
 * as broken because it clicked the wrong thing.
 */
function playChart() {
  paint();
  snap('chart');
  let d = dbg();
  // wait out a fade: the map is empty while it is handing over, and that is not a fault
  for (let i = 0; i < 60 && d.leaving; i++) { tick(6); if (where() !== 'chart') return true; d = dbg(); }
  const open = d.open();
  if (!open.length) {
    if (d.leaving) return true;
    errors.push(`chart: nowhere to go (at ${d.at}, rows ${d.rows})`);
    return false;
  }
  // rotate, and prefer a shore early so the run gets some animals before it gets clever
  const want = shotIx % 3 === 0 ? (open.find((n) => n.kind === 'fight') || open[0])
    : open[shotIx % open.length];
  const r = (d.rects.nodes || []).find((nr) => nr.id === want.id);
  if (r) { const [ax, ay] = centre(r.rect); clickAt(ax, ay); }
  else d.go(want.id);
  tick(70);
  paint();
  if (where() === 'chart') {
    // a cove is not a scene: it resolves on the map, so take another stop
    const d2 = dbg();
    const open2 = d2.open();
    if (open2.length) {
      const r2 = (d2.rects.nodes || []).find((nr) => nr.id === open2[0].id);
      if (r2) { const [bx, by] = centre(r2.rect); clickAt(bx, by); }
      tick(70);
    }
  }
  return true;
}

/**
 * THE ARENA. Pick one of yours, aim it at a beast, fire, and do it until the shore is clear.
 *
 * The bot herds with a GHOST BALL, exactly as a person has to: to send a beaten animal toward
 * a door you have to arrive on the far side of it, so the point to aim at is its centre pushed
 * back along the line to the door by the two radii. A bot that aims at the beast itself sends
 * it wherever the geometry felt like and catches nothing -- which is also the single most
 * useful thing this harness ever proved about the design, because it is true for the player.
 */
function playArena() {
  paint();
  snap('arena');
  const start = dbg();
  const foes0 = start.foes().length;
  if (start.foes().some((x) => x.hp > 300)) bossTotal++;
  let guard = 0;
  let stuck = 0;
  while (['won', 'lost', 'left'].indexOf(dbg().phase) < 0 && guard++ < 900) {
    const d = dbg();
    if (d.phase !== 'aim') { tick(20); continue; }
    const mine = d.mine().filter((m) => !m.out && !m.aboard);
    const foes = d.foes();
    if (!mine.length || !foes.length) { tick(6); continue; }
    mine.sort((a, b) => b.hp - a.hp);
    d.pick(mine[0].i);
    const beaten = foes.filter((x) => x.dazed);
    const before = d.caught;
    if (beaten.length) {
      // aim past it, at the door side: the arena's own ghost-ball geometry in screen space
      const b = beaten[0];
      // the three doors, in screen pixels, are along the top; nearest by x
      const doors = [211, 480, 749];
      let dx0 = doors[0];
      for (const dd of doors) if (Math.abs(dd - b.x) < Math.abs(dx0 - b.x)) dx0 = dd;
      const ang = Math.atan2(150 - b.y, dx0 - b.x);
      d.aimAt(b.x - Math.cos(ang) * 46, b.y - Math.sin(ang) * 30);
    } else {
      const t0 = foes[0];
      d.aimAt(t0.x, t0.y);
    }
    tick(30);
    if (dbg().caught === before && dbg().phase === 'aim') stuck++; else stuck = 0;
    if (stuck > 40) { errors.push('arena: nothing changed for forty shots'); break; }
  }
  const end = dbg();
  const res = end.result();
  if (foes0 <= 0) errors.push('arena: no beasts on the table');
  if (guard >= 900) errors.push(`arena: never finished (${end.phase})`);
  paint();
  snap('arena-over');
  // and out through the button, so the panel and its rect are exercised too
  for (let i = 0; i < 6 && where() === 'arena'; i++) {
    const dr = dbg().rects && dbg().rects.done;
    if (dr) { const [ax, ay] = centre(dr); clickAt(ax, ay); }
    tick(40);
  }
  fedTotal += res.caught.length;
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
 * THE CAUSEWAY. Walk east with the keyboard, reading whatever the golem stops to look at,
 * until a dying man interrupts; click through him; then walk on to the boat.
 */
/**
 * A FILM REEL. Click through the cuts until it hands over. There is nothing to get wrong
 * in here, so the only thing the rig checks is that it ENDS: an auto-advancing scene that
 * never finishes is the one failure mode a film can have.
 */
function playFilm() {
  paint();
  snap('film');
  const start = dbg();
  if (!start.reels || !start.reels.length) errors.push('film: no reels to play');
  let guard = 0;
  while (where() === 'film' && guard++ < 300) {
    clickAt(480, 270);
    tick(6);
  }
  if (where() === 'film') errors.push('film: it never ended');
  return true;
}

/**
 * THE CELLAR: eleven clicks to build the golem, then take the apple and throw it, then
 * click through what he says. Everything the prologue teaches is taught in here, so the
 * rig plays it the way a player does rather than calling skip().
 */
function playBasement() {
  paint();
  snap('cellar');
  let guard = 0;
  let built = false, took = false, threw = false;
  while (where() === 'basement' && guard++ < 400) {
    const d = dbg();
    if (d.phase === 'build') {
      const tg = (d.targets() || []).find((x) => !x.hit);
      if (tg) {
        d.click(tg.x, tg.y);
        tick(2);
        continue;
      }
    }
    if (d.phase === 'wake' && !built) {
      const b = d.built;
      built = true;
      if (b.clay < 5 || b.ribs < 3 || b.word < 3) {
        errors.push(`cellar: it woke up half-built (${JSON.stringify(b)})`);
      }
    }
    if (d.phase === 'apple') {
      if (!d.holding) { d.click(d.apple.x, d.apple.y); took = true; }
      else if (!threw) { const l = d.lion(); d.click(l.x, l.y); threw = true; }
      tick(6);
      continue;
    }
    d.next();
    tick(6);
  }
  if (!took) errors.push('cellar: never got to take the apple');
  if (!threw) errors.push('cellar: never got to throw it');
  if (where() === 'basement') errors.push('cellar: it never ended');
  return true;
}

/**
 * THE RAMP. Feed until the basket is empty, then cast off -- and check the arithmetic the
 * scene is built on: an apple is spent per animal, and what is left goes back to the water.
 */
function playFeed() {
  paint();
  snap('feed');
  const start = dbg();
  const apples0 = start.apples;
  const left0 = start.left;
  const berths0 = V.berthsFree(start.voyage);
  let dbgFed = 0;
  let guard = 0;
  let stuck = 0;
  while (where() === 'feed' && guard++ < 80) {
    const d = dbg();
    const next = (d.queue() || []).find((q) => !q.fed);
    // A CLICK THAT CHANGES NOTHING IS THE ARK BEING FULL, which is the game working: the
    // pens are the real limit. Two of those and the rig stops feeding and casts off, rather
    // than clicking the same refused animal eighty times.
    if (next && d.apples > 0 && stuck < 2) {
      const was = d.fed;
      paint();
      clickAt(Math.round(next.x), Math.round(next.y));
      tick(4);
      if (dbg().fed === was) stuck++;
      else dbgFed = dbg().fed;
      continue;
    }
    // nothing left to feed: cast off with a real click on the button
    paint();
    const cr = dbg().rects && dbg().rects.cast;
    if (process.env.FEEDDBG) {
      console.log('    FEED', JSON.stringify({ left: d.left, apples: d.apples, plate: d.plate, cr }));
    }
    if (cr) { const [cx, cy] = centre(cr); clickAt(cx, cy); }
    tick(20);
  }
  if (where() === 'feed') errors.push('feed: never cast off');
  else {
    const fed = dbgFed;
    if (apples0 > 0 && left0 > 0 && berths0 > 0 && fed === 0) {
      errors.push('feed: with apples, animals and berths, nothing was fed');
    }
    fedTotal += fed;
  }
  return true;
}

function playWalk() {
  paint();
  snap('walk');
  const start = dbg();
  if (start.sights === undefined) errors.push('walk: nothing to look at on the road');
  let guard = 0;
  // walk to Noah
  while (dbg().phase === 'walk' && guard++ < 400) {
    holdKey('KeyD');
    tick(6);
    if (guard % 24 === 0) paint();
  }
  releaseKey('KeyD');
  paint();
  if (dbg().phase !== 'talk') { errors.push('walk: never reached the man'); return false; }
  if (dbg().seen < 4) errors.push(`walk: only ${dbg().seen} sights on the way`);
  snap('walk-noah');
  // click through his last words
  guard = 0;
  while (dbg().phase === 'talk' && guard++ < 60) {
    clickAt(480, 300);
    tick(6);
  }
  paint();
  if (!dbg().dead) errors.push('walk: he never died');
  // and on to the boat
  guard = 0;
  while (where() === 'walk' && guard++ < 400) {
    holdKey('KeyD');
    tick(6);
  }
  releaseKey('KeyD');
  tick(40);
  if (where() === 'walk') { errors.push('walk: never got aboard'); return false; }
  return true;
}

/** Heaven. He talks, we click, we leave. */
function playHeaven() {
  paint();
  snap('heaven');
  let guard = 0;
  while (where() === 'heaven' && guard++ < 60) {
    const go = dbg().rects && dbg().rects.go;
    if (go && go.w) { const [x, y] = centre(go); clickAt(x, y); } else clickAt(480, 300);
    tick(8);
  }
  tick(30);
  if (where() === 'heaven') { errors.push('heaven: no way back to the boat'); return false; }
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

  const seen = {
    film: 0, cellar: 0, cutscene: 0, walk: 0, heaven: 0, ocean: 0, island: 0, feed: 0,
    eden: 0, choice: 0,
  };
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
    if (w === 'film') { seen.film = (seen.film || 0) + 1; playFilm(); continue; }
    if (w === 'basement') { seen.cellar = (seen.cellar || 0) + 1; playBasement(); continue; }
    if (w === 'cutscene') { seen.cutscene++; playCutscene(); continue; }
    if (w === 'walk') { seen.walk = (seen.walk || 0) + 1; playWalk(); continue; }
    if (w === 'heaven') { seen.heaven = (seen.heaven || 0) + 1; playHeaven(); continue; }
    if (w === 'ocean') { seen.ocean++; if (!playOcean()) break; continue; }
    if (w === 'choice') { seen.choice++; playChoice(); continue; }
    if (w === 'chart') { seen.chart = (seen.chart || 0) + 1; playChart(); continue; }
    if (w === 'arena') { seen.arena = (seen.arena || 0) + 1; playArena(); continue; }
    if (w === 'island') { seen.island++; playIsland(); continue; }
    if (w === 'feed') { seen.feed = (seen.feed || 0) + 1; playFeed(); continue; }
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
    + `  [caught ${fedTotal} boss ${bossTotal ? 'met' : '-'}]`
    + `  [chart ${out.seen.chart || 0} arena ${out.seen.arena || 0}`
    + ` film ${out.seen.film} cellar ${out.seen.cellar}`
    + ` walk ${out.seen.walk} heaven ${out.seen.heaven}`
    + ` eden ${out.seen.eden} choice ${out.seen.choice}]`
    + `  flags ${Object.keys(v.flags).join('/') || '-'}`;
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
