// AN ISLAND IS A LINE YOU HOLD. Five rows, nine columns, and everything the flood has
// ruined walking down them at the ark.
//
// WHAT THIS REPLACED, and why twice. The first island game was a flick: aim the golem's
// crook and shoot an animal into a pen. A pool table with a story on it. The second was a
// herd: animals walked, and you stood clay dolls in the mud to turn wandering into walking
// home. Better -- there was a plan in it -- but the pressure was a clock, and a clock makes
// every stage the same stage played faster.
//
// So the animals come to YOU now, and they are the enemy and the reward at the same time.
// The flood has corrupted them; they walk the wrong way; and the instant you knock one down
// it stands there dazed and ordinary again. Throw an apple and it is yours -- aboard the
// boat, and available as a blessed clay beast on the next island. Nothing you fight is
// something you wanted dead, which is the whole shape of the game:
//
//   CLAY is the mana. It drips, and the wells you plant make more of it.
//   BLESSED BEASTS are the towers. Each does exactly one thing (see data/beasts.js).
//   CORRUPTED BEASTS are the waves, and every one is an animal you are trying to collect.
//   APPLES are how you collect them, and some islands grow them.
//   THE ARK has three lives. A beast that reaches it takes one of them AND one animal.
//
// THREE THINGS DELIBERATELY LEFT OUT. There is no unit selection or movement: a planted
// beast stays where you put it, so a field of them is a plan. There is no fog: every wave's
// contents, every beast's health and every radius is visible, because the game is
// arithmetic you should be able to do. And nothing can hurt the golem -- he is not in
// danger and never was. The stakes are the animals.

import { makeRng } from '../core/rng.js';
import { clamp } from '../core/pixel.js';
import { BEAST_BY_ID, resolveBeast, STARTER_BEASTS } from '../data/beasts.js';
import { CORRUPT_BY_ID, tableFor, wavesFor, EVENTS } from '../data/corrupted.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { takeAboard, lose, say, berthsFree, isLoyal, relicBonus, relicFlag } from './voyage.js';

export const COLS = 9;
export const ROWS = 5;
export const N = ROWS * COLS;

/** Terrain. Only three things matter: can you plant on it, and does it slow a walker. */
export const L = { GROUND: 0, WATER: 1, ROCK: 2, TREE: 3 };
export const L_NAME = ['ground', 'water', 'rock', 'apple tree'];

const idx = (r, c) => r * COLS + c;
const inGrid = (r, c) => r >= 0 && c >= 0 && r < ROWS && c < COLS;

/**
 * Can this beast be planted on this tile? Returns the reason it cannot, or null.
 *
 * ONE PLACE, and pass the beast in. The first version answered only "is the tile clear"
 * and left the water rule inside plant() -- so the ghost, the play harness and the game
 * itself each had a different idea of where a thorn could go, and the harness spent a whole
 * island clicking a water row that looked legal to it and was refused every time.
 */
export function plantable(f, r, c, def) {
  if (!inGrid(r, c)) return 'off the field';
  const k = f.terrain[idx(r, c)];
  if (k === L.ROCK) return 'a rock is in the way';
  if (k === L.TREE) return 'the tree is in the way';
  if (plantAt(f, r, c)) return 'something is already there';
  if (k === L.WATER && def && def.kind !== 'pad' && !f.pads.has(idx(r, c))) {
    return 'that is water — a reed first';
  }
  return null;
}

export function plantAt(f, r, c) {
  for (const p of f.plants) if (p.row === r && p.col === c) return p;
  return null;
}

/* ------------------------------------------------------------------ generation */

function generate(f) {
  const { rng, island } = f;
  f.terrain.fill(L.GROUND);
  const d = island.danger || 1;

  // WATER ROWS. The single most interesting thing that can happen to a lane game: a row
  // you cannot plant in until you spend a reed on it. Never the middle row, and never more
  // than two, or the field stops being a field.
  const waterRows = island.biome === 'coral' || island.biome === 'swamp' ? 2
    : rng.chance(0.35 + d * 0.05) ? 1 : 0;
  const picked = [];
  for (let i = 0; i < waterRows; i++) {
    let r = rng.chance(0.5) ? 0 : ROWS - 1;
    if (picked.indexOf(r) >= 0) r = rng.chance(0.5) ? 1 : ROWS - 2;
    if (picked.indexOf(r) >= 0) continue;
    picked.push(r);
    for (let c = 0; c < COLS; c++) f.terrain[idx(r, c)] = L.WATER;
  }
  f.waterRows = picked;

  // rocks, which are just tiles you cannot use. Never in column 0 -- the row nearest the
  // ark has to stay plantable or a row can be unwinnable before it starts.
  const rocks = Math.round(1 + d * 0.9);
  for (let i = 0; i < rocks; i++) {
    const r = rng.int(ROWS), c = 1 + rng.int(COLS - 2);
    if (f.terrain[idx(r, c)] !== L.GROUND) continue;
    f.terrain[idx(r, c)] = L.ROCK;
  }

  // APPLE TREES. Some islands grow them, and an apple is how you keep what you beat -- so
  // an island with trees on it is worth more than an island without, and you can read that
  // off the map before you sail.
  const treeCount = island.biome === 'jungle' || island.biome === 'grassland'
    || island.biome === 'sacred' ? 2 + rng.int(2)
    : island.biome === 'desert' || island.biome === 'volcano' ? 0 : 1;
  for (let i = 0; i < treeCount; i++) {
    const r = rng.int(ROWS), c = 2 + rng.int(COLS - 3);
    if (f.terrain[idx(r, c)] !== L.GROUND) continue;
    f.terrain[idx(r, c)] = L.TREE;
    f.trees.push({ row: r, col: c, ripe: i === 0, t: rng.range(0, 6) });
  }
}

/* ---------------------------------------------------------------------- setup */

export function newLane(v, island, tag) {
  const seed = `${v.seed}/${tag || 'lane'}/${island.id}`;
  const rng = makeRng(seed);
  const d = island.danger || 1;

  const f = {
    seed, rng, island, tag: tag || 'lane', voyage: v, t: 0,
    terrain: new Uint8Array(N),
    plants: [], beasts: [], shots: [], bees: [], stunned: [], trees: [], puffs: [],
    waterRows: [],

    // THE ECONOMY. A drip so a bad opening is recoverable, and wells for everything else.
    // 75 to start is a well and a wall, or one thorn and nothing -- which is the decision
    // the first twenty seconds is about.
    clay: 75, clayAcc: 0, clayDrip: 6,
    apples: 1,

    waves: wavesFor(island, rng),
    // waveT starts at the FIRST wave's lead. At zero the loop advanced on the very first
    // tick and wave one spawned at t=0 -- so the twenty-second opening the wave table was
    // carefully giving the player did not exist, and a pair of fast ones could eat a row
    // guard and breach before there was anything on the board at all.
    wave: -1, waveT: 0, queue: [], inWave: false,

    // A GUARD PER ROW, and then two lives. Plants vs Zombies gives you a lawnmower in
    // every lane for a reason: the first thing that gets through a row is nearly always a
    // mistake you have already understood, and taking the run for it teaches nothing. A
    // guard stops one beast per row -- and knocks it DOWN, so the mistake still hands you
    // something to tame.
    guards: new Array(ROWS).fill(true),
    ark: { hp: 2, max: 2 },
    saved: [], lost: [], tamed: [],
    event: null, eventT: 0, eventIn: 22 + rng.range(0, 10),
    pads: new Set(),
    notes: [], sel: null,
    over: false, why: null,
    rain: island.weather === 'storm' ? 1 : island.weather === 'rain' ? 0.7 : 0.28,
  };

  // GEAR, pointed at this game. Each relic bonus means one thing here and it is written
  // down, because a bonus you cannot feel is a bonus that may as well not exist.
  //   reach     every beast's range and radius grows
  //   patience  waves take longer to arrive
  //   dry       the ark survives one extra breach
  //   sure      one animal that would be taken from the deck is not
  f.reach = relicBonus(v, 'reach') || 0;
  f.patience = relicBonus(v, 'patience') || 0;
  f.dry = relicFlag(v, 'dry');
  f.sure = relicFlag(v, 'sure') || !!(v.flags && v.flags.whale);
  if (f.dry) { f.ark.hp += 1; f.ark.max += 1; }
  f.guardsLeft = () => f.guards.filter(Boolean).length;
  f.spare = f.sure ? 1 : 0;
  for (const w of f.waves) w.lead *= 1 + f.patience * 8;

  f.waveT = f.waves[0] ? f.waves[0].lead : 0;

  generate(f);
  f.hand = handFor(v);
  f.rng2 = rng.fork('spawn');
  return f;
}

/** The beasts this run can plant, resolved against its upgrades. */
export function handFor(v) {
  const known = (v.beasts && v.beasts.length) ? v.beasts : STARTER_BEASTS;
  const bought = v.beastUpgrades || [];
  return known.map((id) => resolveBeast(id, bought)).filter(Boolean);
}

export function note(f, text, color) {
  f.notes.unshift({ text, color: color || 'parch', t: 0 });
  if (f.notes.length > 5) f.notes.length = 5;
}

/* ------------------------------------------------------------------- planting */

export function select(f, sel) { f.sel = sel; return f.sel; }

export function canAfford(f, def) { return def && f.clay >= def.cost; }

/**
 * Plant a beast.
 *
 * Water needs a reed under it first, which is the one geometry rule in the game and the
 * reason the reed exists at all. Everything else is: is the tile clear, and can you pay.
 */
export function plant(f, id, r, c) {
  if (f.over) return { ok: false, why: 'no' };
  const def = f.hand.find((b) => b.id === id);
  if (!def) return { ok: false, why: 'you do not know that one' };
  const bad = plantable(f, r, c, def);
  if (bad) return { ok: false, why: bad };
  if (!canAfford(f, def)) return { ok: false, why: `${def.cost} clay` };

  f.clay -= def.cost;
  const p = {
    def, id, row: r, col: c,
    hp: def.hp, max: def.hp,
    cd: def.rate ? def.rate * 0.5 : 0,
    born: f.t, flash: 0,
  };
  f.plants.push(p);
  if (def.kind === 'pad') f.pads.add(idx(r, c));
  note(f, `${def.name.toUpperCase()} PLANTED`, 'clay4');
  for (let i = 0; i < 5; i++) f.puffs.push({ r, c, t: 0, i, kind: 'plant' });
  return { ok: true, plant: p };
}

/** Dig one back up. You get a third of the clay, which makes it a correction, not a free undo. */
export function uproot(f, r, c) {
  const p = plantAt(f, r, c);
  if (!p) return { ok: false, why: 'nothing there' };
  f.plants.splice(f.plants.indexOf(p), 1);
  if (p.def.kind === 'pad') f.pads.delete(idx(r, c));
  f.clay += Math.round(p.def.cost / 3);
  note(f, `${p.def.name.toUpperCase()} TAKEN UP`, 'grey2');
  return { ok: true };
}

/* --------------------------------------------------------------------- apples */

/** Pick a ripe tree. */
export function harvest(f, r, c) {
  const tree = f.trees.find((x) => x.row === r && x.col === c);
  if (!tree) return { ok: false, why: 'no tree' };
  if (!tree.ripe) return { ok: false, why: 'not ripe' };
  tree.ripe = false;
  tree.t = 0;
  f.apples++;
  note(f, 'AN APPLE', 'red2');
  return { ok: true };
}

/**
 * Throw an apple at a beast you have already knocked down.
 *
 * THIS IS HOW YOU KEEP ANYTHING. A defeated corrupted beast stands there ordinary and dazed
 * for a few seconds; an apple in that window tames it for good. Miss the window and it
 * wanders off -- not a loss, but not a gain either, and the whole tension of a wave is
 * whether you can spare the attention.
 */
export function tame(f, r, c) {
  if (f.apples <= 0) return { ok: false, why: 'no apples' };
  let best = null, bd = 1.4;
  for (const s of f.stunned) {
    const dd = Math.hypot(s.col - c, s.row - r);
    if (dd < bd) { bd = dd; best = s; }
  }
  if (!best) return { ok: false, why: 'nothing to throw it to' };

  f.apples--;
  f.stunned.splice(f.stunned.indexOf(best), 1);
  const a = ANIMAL_BY_ID[best.baseId];
  const gives = best.def.gives;

  // aboard, if there is a berth. A full ark is a real wall and this is where it bites.
  let boarded = false;
  if (a && takeAboard(f.voyage, a.id)) { boarded = true; f.saved.push(a.id); }

  // and the shape it teaches, which is permanent for the run
  let learned = false;
  if (gives && BEAST_BY_ID[gives]) {
    f.voyage.beasts = f.voyage.beasts || STARTER_BEASTS.slice();
    if (f.voyage.beasts.indexOf(gives) < 0) {
      f.voyage.beasts.push(gives);
      learned = true;
      f.hand = handFor(f.voyage);
    }
  }
  f.tamed.push(best.baseId);
  const nm = (a && a.name.toUpperCase()) || 'IT';
  note(f, learned ? `${nm} TAMED — ${BEAST_BY_ID[gives].name.toUpperCase()} LEARNED`
    : boarded ? `${nm} IS ABOARD` : `${nm} TAMED, BUT NO BERTH`, learned ? 'gold' : 'leaf3');
  for (let i = 0; i < 8; i++) f.puffs.push({ r: best.row, c: best.col, t: 0, i, kind: 'bless' });
  return { ok: true, learned, boarded };
}

/** What a click on the field does, given what is selected. */
export function actAt(f, r, c) {
  if (f.over) return { ok: false, why: 'no' };
  // a ripe tree is always worth a click, selection or not
  const tree = f.trees.find((x) => x.row === r && x.col === c);
  if (tree && tree.ripe) return harvest(f, r, c);
  if (!f.sel) {
    // no selection: a click on a stunned beast throws an apple, because that is the thing
    // you are always in a hurry to do
    if (f.stunned.some((s) => s.row === r && Math.abs(s.col - c) < 1.2)) return tame(f, r, c);
    return { ok: false, why: 'pick something first' };
  }
  if (f.sel.kind === 'apple') { const res = tame(f, r, c); if (res.ok) f.sel = null; return res; }
  const res = plant(f, f.sel.id, r, c);
  if (res.ok && !canAfford(f, f.hand.find((b) => b.id === f.sel.id))) f.sel = null;
  return res;
}

/* -------------------------------------------------------------------- the update */

const MAX_STEP = 1 / 30;

export function update(f, dt) {
  // clamp the step, or a backgrounded tab teleports a wave into the ark
  let left = Math.min(dt, 0.5);
  while (left > 0) {
    const step = Math.min(left, MAX_STEP);
    tick(f, step);
    left -= step;
  }
}

function tick(f, dt) {
  f.t += dt;
  for (const n of f.notes) n.t += dt;
  for (let i = f.puffs.length - 1; i >= 0; i--) {
    f.puffs[i].t += dt;
    if (f.puffs[i].t > 0.7) f.puffs.splice(i, 1);
  }
  if (f.over) return;

  tickEvent(f, dt);
  tickClay(f, dt);
  tickTrees(f, dt);
  tickWaves(f, dt);
  tickBeasts(f, dt);
  tickPlants(f, dt);
  tickShots(f, dt);
  tickBees(f, dt);
  tickStunned(f, dt);

  // won when every wave is empty and the field is clear
  if (f.wave >= f.waves.length - 1 && !f.queue.length && !f.beasts.length && !f.inWave) {
    endLane(f, 'clear');
  }
}

/* ------------------------------------------------------------------- the economy */

function tickClay(f, dt) {
  const dry = f.event && f.event.id === 'drought' ? 0.5 : 1;
  f.clayAcc += f.clayDrip * dry * dt;
  while (f.clayAcc >= 1) { f.clayAcc -= 1; f.clay++; }
}

function tickTrees(f, dt) {
  for (const tr of f.trees) {
    if (tr.ripe) continue;
    tr.t += dt;
    if (tr.t > 24) { tr.t = 0; tr.ripe = true; note(f, 'AN APPLE HAS RIPENED', 'red2'); }
  }
}

/* --------------------------------------------------------------------- the waves */

function tickWaves(f, dt) {
  if (f.wave >= f.waves.length && !f.queue.length) return;
  if (!f.inWave) {
    f.waveT -= dt;
    if (f.waveT > 0) return;
    f.wave++;
    if (f.wave >= f.waves.length) return;
    const w = f.waves[f.wave];
    f.inWave = true;
    f.queue = [];
    const table = tableFor(f.island, f.wave, f.waves.length);
    const all = f.event && f.event.id === 'stampede';
    for (let i = 0; i < w.count; i++) {
      const def = table[f.rng2.int(table.length)];
      f.queue.push({ def, at: all ? 0 : i * w.gap, row: f.rng2.int(ROWS) });
    }
    f.queueT = 0;
    note(f, w.big ? 'THE LAST OF THEM · EVERYTHING AT ONCE' : `WAVE ${f.wave + 1} OF ${f.waves.length}`,
      w.big ? 'red2' : 'gold');
    return;
  }
  f.queueT += dt;
  while (f.queue.length && f.queue[0].at <= f.queueT) {
    const s = f.queue.shift();
    spawn(f, s.def, s.row);
  }
  if (!f.queue.length) {
    f.inWave = false;
    // the next wave waits for the field to be nearly clear, so a bad wave is not made
    // unrecoverable by the next one landing on top of it
    const nxt = f.waves[f.wave + 1];
    f.waveT = nxt ? nxt.lead : 0;
  }
}

function spawn(f, def, row) {
  const n = def.kind === 'flock' ? 3 : 1;
  for (let i = 0; i < n; i++) {
    f.beasts.push({
      def, row: clamp(row + (i - 1) * (n > 1 ? 1 : 0), 0, ROWS - 1),
      x: COLS + 0.4 + i * 0.5,
      hp: def.hp, max: def.hp,
      slowT: 0, leapt: false, dug: 0, walk: 0, hitT: 0, flash: 0,
    });
  }
}

/* ------------------------------------------------------------------- the events */

function tickEvent(f, dt) {
  if (f.event) {
    f.eventT -= dt;
    if (f.eventT <= 0) {
      note(f, `${f.event.name} PASSES`, 'grey2');
      f.event = null;
      f.eventIn = 26 + f.rng.range(0, 12);
    }
    return;
  }
  f.eventIn -= dt;
  if (f.eventIn > 0) return;
  const e = EVENTS[f.rng.int(EVENTS.length)];
  f.event = e;
  f.eventT = e.dur;
  f.eventRow = f.rng.int(ROWS);
  note(f, `${e.name} — ${e.blurb.toUpperCase()}`, e.color);
  if (e.id === 'harvest') for (const tr of f.trees) { tr.ripe = true; tr.t = 0; }
}

/* -------------------------------------------------------------------- the walkers */

function tickBeasts(f, dt) {
  for (let i = f.beasts.length - 1; i >= 0; i--) {
    const b = f.beasts[i];
    b.flash = Math.max(0, b.flash - dt * 4);
    b.slowT = Math.max(0, b.slowT - dt);

    if (b.hp <= 0) { fell(f, b); f.beasts.splice(i, 1); continue; }

    // the caller heals what is around it, which is the one thing that makes a wave a
    // priority problem rather than a queue
    if (b.def.kind === 'caller') {
      for (const o of f.beasts) {
        if (o === b || Math.hypot(o.x - b.x, o.row - b.row) > 1.6) continue;
        o.hp = Math.min(o.max, o.hp + 12 * dt);
      }
    }

    const col = Math.floor(b.x);
    const onWater = inGrid(b.row, col) && f.terrain[idx(b.row, col)] === L.WATER;
    let sp = b.def.walk;
    if (b.slowT > 0) sp *= b.slowT > 0 ? (b.slowFactor || 0.5) : 1;
    if (onWater && b.def.kind !== 'swim') sp *= 0.5;

    // what is in the way
    const blocker = blockerFor(f, b);
    if (blocker) {
      if (b.def.kind === 'leap' && !b.leapt) {
        b.leapt = true;
        b.x -= 1.15;
        note(f, `${b.def.name.toUpperCase()} WENT OVER`, 'orange');
        continue;
      }
      if (b.def.kind === 'digger' && b.dug < 2) {
        b.dug++;
        b.x -= 1.05;
        continue;
      }
      blocker.hp -= b.def.hit * dt;
      blocker.flash = 0.25;
      b.hitT += dt;
      // a thistle bites back. It is the answer to anything with a lot of health and a slow
      // walk, because those are exactly the things that stand there chewing.
      if (blocker.def.spike) {
        b.hp -= blocker.def.spike * dt;
        b.flash = 0.2;
      }
      if (blocker.hp <= 0) {
        f.plants.splice(f.plants.indexOf(blocker), 1);
        if (blocker.def.kind === 'pad') f.pads.delete(idx(blocker.row, blocker.col));
        note(f, `${blocker.def.name.toUpperCase()} IS GONE`, 'red2');
      }
      continue;
    }

    b.x -= sp * dt;
    b.walk = (b.walk + sp * dt * 2.2) % 1;

    if (b.x <= -0.35) { breach(f, b); f.beasts.splice(i, 1); }
  }
}

/** The first plant in this beast's row that it has to get through. */
function blockerFor(f, b) {
  const col = Math.round(b.x - 0.5);
  for (const p of f.plants) {
    if (p.row !== b.row) continue;
    if (p.def.kind === 'pad') continue;           // you walk over a reed
    if (Math.abs(p.col - (b.x - 0.5)) < 0.55) return p;
    if (col === p.col && b.x - 0.5 <= p.col + 0.5) return p;
  }
  return null;
}

/**
 * A corrupted beast goes down.
 *
 * It does not die. It stands there dazed and ordinary -- its own animal again -- for eight
 * seconds, and an apple in that window keeps it. That window is the entire game: the reason
 * you cannot simply build the strongest wall and watch.
 */
function fell(f, b) {
  const a = ANIMAL_BY_ID[b.def.base];
  f.stunned.push({
    def: b.def, baseId: b.def.base, a,
    row: b.row, col: clamp(b.x - 0.5, 0, COLS - 1),
    t: 0, life: 8,
  });
  note(f, `${b.def.name.toUpperCase()} IS DOWN — THROW AN APPLE`, 'gold');
  for (let i = 0; i < 6; i++) f.puffs.push({ r: b.row, c: b.x - 0.5, t: 0, i, kind: 'free' });
}

function tickStunned(f, dt) {
  for (let i = f.stunned.length - 1; i >= 0; i--) {
    const s = f.stunned[i];
    s.t += dt;
    if (s.t < s.life) continue;
    f.stunned.splice(i, 1);
    note(f, `${(s.a && s.a.name.toUpperCase()) || 'IT'} WANDERED OFF`, 'grey2');
  }
}

/** Something reached the ark. */
function breach(f, b) {
  if (f.guards[b.row]) {
    f.guards[b.row] = false;
    fell(f, b);
    note(f, 'THE ROW GUARD BROKE — AND IT IS DOWN', 'brass3');
    for (let i = 0; i < 8; i++) f.puffs.push({ r: b.row, c: 0, t: 0, i, kind: 'guard' });
    return;
  }
  if (f.spare > 0) {
    f.spare--;
    note(f, 'SOMETHING TURNED IT BACK', 'gold');
    return;
  }
  f.ark.hp--;
  // it takes an animal with it, which is the real cost. The ledger, not the health bar.
  const deck = f.voyage.aboard;
  let taken = null;
  for (let i = deck.length - 1; i >= 0; i--) {
    if (isLoyal(f.voyage, deck[i])) continue;      // a loyal animal is never the one taken
    taken = deck[i];
    break;
  }
  if (taken) {
    lose(f.voyage, taken, `taken by the ${b.def.name.toLowerCase()}`);
    f.lost.push(taken);
    const a = ANIMAL_BY_ID[taken];
    note(f, `${(a && a.name.toUpperCase()) || 'AN ANIMAL'} WAS TAKEN`, 'red2');
  } else {
    note(f, 'IT GOT ABOARD AND FOUND NOTHING', 'red2');
  }
  if (f.ark.hp <= 0) endLane(f, 'overrun');
}

/* -------------------------------------------------------------------- the towers */

function tickPlants(f, dt) {
  const squall = f.event && f.event.id === 'squall' ? 1.45 : 1;
  for (let i = f.plants.length - 1; i >= 0; i--) {
    const p = f.plants[i];
    p.flash = Math.max(0, p.flash - dt * 4);
    // the rot eats one row
    if (f.event && f.event.id === 'rot' && p.row === f.eventRow) {
      p.hp -= 9 * dt;
      if (p.hp <= 0) {
        f.plants.splice(i, 1);
        if (p.def.kind === 'pad') f.pads.delete(idx(p.row, p.col));
        note(f, `THE ROT TOOK THE ${p.def.name.toUpperCase()}`, 'moss');
        continue;
      }
    }
    if (!p.def.rate) continue;
    p.cd -= dt / squall;
    if (p.cd > 0) continue;

    const k = p.def.kind;
    if (k === 'gen') {
      p.cd = p.def.rate;
      f.clay += p.def.amount;
      f.puffs.push({ r: p.row, c: p.col, t: 0, i: 0, kind: 'clay' });
      continue;
    }
    // everything else needs something in its row to be worth doing
    const targets = f.beasts.filter((b) => b.row === p.row);
    if (k === 'shoot') {
      const ahead = targets.filter((b) => b.x > p.col);
      if (!ahead.length) { p.cd = 0; continue; }
      p.cd = p.def.rate;
      if (p.def.far) {
        // the owl takes the one at the BACK, instantly, with a tracer. A projectile that
        // has to fly past everything to reach the far one would be hit by the near one.
        const far = ahead.reduce((a, b) => (b.x > a.x ? b : a), ahead[0]);
        hurt(f, far, p.def.damage);
        f.shots.push({ row: p.row, x: p.col + 0.4, to: far.x, tracer: true, t: 0 });
      } else {
        f.shots.push({
          row: p.row, x: p.col + 0.5, vx: p.def.speed / 96,
          dmg: p.def.damage, t: 0,
        });
      }
      continue;
    }
    if (k === 'aoe') {
      const rad = p.def.radius * (1 + f.reach);
      const near = f.beasts.filter((b) => Math.hypot(b.x - 0.5 - p.col, b.row - p.row) <= rad);
      if (!near.length) { p.cd = 0; continue; }
      p.cd = p.def.rate;
      for (const b of near) hurt(f, b, p.def.damage);
      f.shots.push({ row: p.row, x: p.col, burst: rad, t: 0 });
      continue;
    }
    if (k === 'slow') {
      if (!targets.length) { p.cd = 0; continue; }
      p.cd = p.def.rate;
      for (const b of targets) { b.slowT = p.def.rate + 0.4; b.slowFactor = p.def.slow; }
      f.shots.push({ row: p.row, x: p.col, ring: true, t: 0 });
      continue;
    }
    if (k === 'spawn') {
      if (!f.beasts.length) { p.cd = 0; continue; }
      p.cd = p.def.rate;
      const n = p.def.twin ? 2 : 1;
      for (let j = 0; j < n; j++) {
        f.bees.push({ x: p.col + 0.5, row: p.row + (j ? 0.4 : -0.4), dmg: p.def.damage, t: 0 });
      }
    }
  }
}

function hurt(f, b, dmg) {
  const real = Math.max(1, dmg - (b.def.armour || 0));
  b.hp -= real;
  b.flash = 0.25;
}

function tickShots(f, dt) {
  for (let i = f.shots.length - 1; i >= 0; i--) {
    const s = f.shots[i];
    s.t += dt;
    if (s.tracer || s.burst || s.ring) { if (s.t > 0.2) f.shots.splice(i, 1); continue; }
    s.x += s.vx * dt;
    if (s.x > COLS + 0.5) { f.shots.splice(i, 1); continue; }
    let hit = null;
    for (const b of f.beasts) {
      if (b.row !== s.row) continue;
      if (Math.abs(b.x - 0.5 - s.x) < 0.45) { hit = b; break; }
    }
    if (hit) { hurt(f, hit, s.dmg); f.shots.splice(i, 1); }
  }
}

function tickBees(f, dt) {
  for (let i = f.bees.length - 1; i >= 0; i--) {
    const bee = f.bees[i];
    bee.t += dt;
    let best = null, bd = 1e9;
    for (const b of f.beasts) {
      const dd = Math.hypot(b.x - 0.5 - bee.x, b.row - bee.row);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (!best || bee.t > 6) { f.bees.splice(i, 1); continue; }
    const a = Math.atan2(best.row - bee.row, best.x - 0.5 - bee.x);
    bee.x += Math.cos(a) * 4.2 * dt;
    bee.row += Math.sin(a) * 4.2 * dt;
    if (bd < 0.3) { hurt(f, best, bee.dmg); f.bees.splice(i, 1); }
  }
}

/* ------------------------------------------------------------------- outcomes */

export function endLane(f, why) {
  if (f.over) return;
  f.over = true;
  f.why = why || 'clear';
  // anything still dazed on the field when the fight ends is kept for free: you earned it
  for (const s of f.stunned.slice()) {
    const a = ANIMAL_BY_ID[s.baseId];
    if (a && takeAboard(f.voyage, a.id)) f.saved.push(a.id);
    const gives = s.def.gives;
    if (gives && BEAST_BY_ID[gives]) {
      f.voyage.beasts = f.voyage.beasts || STARTER_BEASTS.slice();
      if (f.voyage.beasts.indexOf(gives) < 0) f.voyage.beasts.push(gives);
    }
  }
  f.stunned.length = 0;
  if (f.saved.length > f.voyage.stats.bestRescue) f.voyage.stats.bestRescue = f.saved.length;
  say(f.voyage, `${f.island.name}: ${f.saved.length} tamed, ${f.lost.length} taken.`,
    f.saved.length >= f.lost.length ? 'leaf4' : 'rust');
  return f;
}

export function result(f) {
  return {
    island: f.island.id,
    saved: f.saved.slice(), lost: f.lost.slice(), tamed: f.tamed.slice(),
    why: f.why, seconds: f.t, waves: f.wave + 1,
  };
}

export function waveText(f) {
  if (f.wave < 0) return 'THE FIRST OF THEM IS COMING';
  if (f.wave >= f.waves.length) return 'THAT WAS THE LAST';
  const w = f.waves[f.wave];
  if (f.inWave) return w.big ? 'THE LAST OF THEM' : `WAVE ${f.wave + 1} OF ${f.waves.length}`;
  return `WAVE ${f.wave + 2} IN ${Math.ceil(f.waveT)}s`;
}

export function threat(f) { return f.beasts.length; }
export function berths(f) { return berthsFree(f.voyage); }

export const _internals = { idx, inGrid, blockerFor };
