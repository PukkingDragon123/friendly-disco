// THE ISLAND STAGE. A tile grid, a rising flood, and animals with their own opinions.
//
// WHAT THIS REPLACED, and why. The old rescue level was a flick: you aimed the golem's
// crook at an animal and shot it across an open field into a pen. It worked, but it was a
// pool table with a story on it -- the animals were balls, the field was baize, and the
// only decision was angle and power. Nothing on the board wanted anything.
//
// Now the animals walk. They wander when nothing is happening, they bolt from whatever the
// storm has just dropped on the field, and they will not go home on their own. The golem
// cannot herd them himself: he is enormous and slow, and a stranded goat runs from him. So
// he pinches figures out of his own body and stands them in the mud, and each doll is a
// small rule that applies to a circle of ground (see data/dolls.js).
//
// That makes a stage a plan rather than a shot. Where does the herder go so its circle
// covers three animals and not one? Is it worth a bridge doll to open the short way across
// the shallows, or is the long way round still quicker than the flood? The flood is the
// clock, the monsters are the pressure, and the dolls are the only verbs.
//
// THREE THINGS ARE DELIBERATELY NOT HERE. There is no unit selection -- a doll cannot be
// moved or picked back up, so placing one is a decision you live with. There is no combat:
// nothing on the field can hurt the golem, and the monsters' whole job is to frighten
// animals into running the wrong way, which is worse. And there is no fog: every animal,
// every monster's scare radius and every doll's circle is visible from the first frame,
// because the game is about arithmetic you can actually do.

import { makeRng } from '../core/rng.js';
import { clamp } from '../core/pixel.js';
import { T, walkable, breakable, variantAt, tileHash } from '../render/tiles.js';
import { DOLL_BY_ID } from '../data/dolls.js';
import { rollMonster } from '../data/monsters.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import {
  takeAboard, lose, say, berthsFree, isLoyal, relicBonus, relicFlag, holdSize, makeLoyal,
} from './voyage.js';
import { ITEM_BY_ID } from '../data/items.js';
import { abilityOf } from '../data/abilities.js';

export const COLS = 29;
export const ROWS = 11;
export const ARK_COLS = 2;                 // columns 0 and 1 are the ark's deck
export const N = COLS * ROWS;

const idx = (c, r) => r * COLS + c;
const inGrid = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

/* ------------------------------------------------------------------ generation */

/** Which open terrain this biome's floor is made of. */
function floorFor(biome) {
  if (biome === 'desert' || biome === 'coral') return T.SAND;
  return T.GRASS;
}

/**
 * Lay out one island.
 *
 * The shape of a stage is three decisions: how much of the floor is blocked, whether a
 * river cuts it in half, and where the animals start. Everything else is dressing.
 */
function generate(f) {
  const { rng, island } = f;
  const floor = floorFor(island.biome);
  f.grid.fill(floor);

  // the ark, and a clear gangway column in front of it, so the last step home is never
  // the step that is blocked
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < ARK_COLS; c++) f.grid[idx(c, r)] = T.DECK;
    f.grid[idx(ARK_COLS, r)] = T.SAND;
  }

  const danger = island.danger || 1;

  // A RIVER, sometimes. It is the single most interesting thing that can happen to a
  // stage: it turns "walk left" into "walk left THROUGH somewhere", and it is what makes
  // the bridge doll worth carrying.
  if (rng.chance(0.55 + danger * 0.06)) {
    let c = 8 + rng.int(COLS - 16);
    const wide = rng.chance(0.4) ? 2 : 1;
    for (let r = 0; r < ROWS; r++) {
      for (let w = 0; w < wide; w++) {
        const cc = clamp(c + w, ARK_COLS + 2, COLS - 1);
        f.grid[idx(cc, r)] = T.WATER;
      }
      if (rng.chance(0.45)) c += rng.chance(0.5) ? 1 : -1;
      c = clamp(c, ARK_COLS + 2, COLS - 2 - wide);
    }
    // one or two fords, or a stage with no bridge doll left is unwinnable rather than hard
    const fords = rng.chance(0.45) ? 1 : 2;
    for (let i = 0; i < fords; i++) {
      const r = 1 + rng.int(ROWS - 2);
      for (let c2 = ARK_COLS + 2; c2 < COLS; c2++) {
        if (f.grid[idx(c2, r)] === T.WATER) f.grid[idx(c2, r)] = T.MUD;
      }
    }
  }

  // Obstacles, scaled by danger. The island's own obstacle list decides the flavour --
  // and the names have to be the ones data/islands.js actually uses. The first cut matched
  // 'boulder' and 'briar', which appear nowhere in the roster, so every island came out as
  // twenty-eight identical briars: the mapping silently fell through to one kind.
  //
  // The real vocabulary is: bolt cliff current deep gap ice lava log mud rock rubble
  // thorns wind.
  const kinds = [];
  for (const ob of (island.obstacles || [])) {
    if (ob === 'rock' || ob === 'rubble' || ob === 'lava') kinds.push(T.ROCK);
    else if (ob === 'thorns' || ob === 'ice') kinds.push(T.BUSH);
    else if (ob === 'log') kinds.push(T.TREE);
    else if (ob === 'cliff' || ob === 'gap' || ob === 'wind' || ob === 'bolt') kinds.push(T.CLIFF);
    else if (ob === 'mud') kinds.push(T.MUD);
    else if (ob === 'deep' || ob === 'current') kinds.push(T.WATER);
  }
  // always at least two kinds, so no stage is a field of one thing
  if (kinds.length < 2) kinds.push(T.ROCK, T.BUSH, T.TREE);
  const blockers = Math.round((14 + danger * 9) * (0.8 + rng.range(0, 0.5)));
  for (let i = 0; i < blockers; i++) {
    const c = ARK_COLS + 2 + rng.int(COLS - ARK_COLS - 3);
    const r = rng.int(ROWS);
    if (f.grid[idx(c, r)] !== floor) continue;
    f.grid[idx(c, r)] = kinds[rng.int(kinds.length)];
  }

  // NO DECORATIVE FLOOR SWAPS. Sprinkling sand tiles across grass for "texture" draws
  // hard-edged beige squares on a 32-pixel grid, which is the most visible tiling artifact
  // there is -- it announces the grid rather than hiding it. Texture comes from the render
  // side, from a scatter pass placed off world position (see tiles.drawScatter).

  for (let i = 0; i < N; i++) f.vari[i] = variantAt(i % COLS, (i / COLS) | 0);
}

/** Never strand a stage: make sure every animal can actually reach the ark somehow. */
function unblockStarts(f) {
  computeFlow(f);
  for (const a of f.animals) {
    if (f.flow[idx(a.c | 0, a.r | 0)] >= 0) continue;
    // carve straight left until it joins the reachable set
    let c = a.c | 0;
    const r = a.r | 0;
    while (c > ARK_COLS && f.flow[idx(c, r)] < 0) {
      if (!walkable(f.grid[idx(c, r)])) f.grid[idx(c, r)] = floorFor(f.island.biome);
      c--;
      computeFlow(f);
    }
  }
}

/* ------------------------------------------------------------------- the flow field

One breadth-first sweep from every deck tile gives every walkable tile its distance home.
An animal that is being led just steps to whichever neighbour has a smaller number, which
is a perfect path for free -- and, more usefully, a path that reroutes itself the instant a
bridge goes down or the flood takes a column.
*/

/**
 * Mark the terrain as changed.
 *
 * Bumps `rev` as well as the flow flag, because the renderer bakes the whole floor into one
 * canvas and needs to know when to throw it away. One counter, one place to bump it.
 */
export function touch(f) {
  f.flowDirty = true;
  f.rev = (f.rev || 0) + 1;
}

export function computeFlow(f) {
  const flow = f.flow;
  flow.fill(-1);
  const q = f._q || (f._q = new Int32Array(N));
  let head = 0, tail = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < ARK_COLS; c++) {
      const i = idx(c, r);
      flow[i] = 0;
      q[tail++] = i;
    }
  }
  while (head < tail) {
    const i = q[head++];
    const c = i % COLS, r = (i / COLS) | 0;
    const d = flow[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!inGrid(nc, nr)) continue;
      const j = idx(nc, nr);
      if (flow[j] >= 0) continue;
      if (!walkable(f.grid[j])) continue;
      if (f.blocked[j]) continue;                 // a cairn doll
      if (nc >= COLS - Math.floor(f.floodCols)) continue;   // drowned
      flow[j] = d;
      q[tail++] = j;
    }
  }
  f.flowDirty = false;
}

/* ------------------------------------------------------------------------ setup */

export function newField(v, island, tag) {
  const seed = `${v.seed}/${tag || 'field'}/${island.id}`;
  const rng = makeRng(seed);
  const danger = island.danger || 1;

  const f = {
    seed, rng, island, tag: tag || 'field', t: 0,
    grid: new Uint8Array(N),
    vari: new Uint8Array(N),
    flow: new Int16Array(N),
    blocked: new Uint8Array(N),
    flowDirty: true, rev: 0,
    animals: [], monsters: [], dolls: [], strikes: [], puffs: [],
    voyage: v,
    // THE CLOCK. Enough time to cross the field about three times, less on a bad island.
    limit: Math.max(42, 78 - danger * 6),
    floodCols: 0,
    saved: [], lost: [], used: [],
    notes: [],
    over: false, why: null,
    sel: null,
    stock: Object.create(null),
    strikeIn: Math.max(6, 15 - danger * 1.6),
    rain: island.weather === 'storm' ? 1 : island.weather === 'rain' ? 0.7 : 0.32,
  };
  // GEAR BITES HERE. The relic bonuses were written for a flick game and pointed at a
  // physics world that no longer exists; each one now means something on a tile field:
  //
  //   reach     a wider circle on every doll -- a longer crook herds more ground
  //   patience  the water comes slower
  //   dry       an animal the water reaches is washed back to the gangway, once
  //   sure      the first loss on this island simply does not happen
  f.reach = relicBonus(v, 'reach') || 0;
  f.patience = relicBonus(v, 'patience') || 0;
  f.dry = relicFlag(v, 'dry');       // a flag, not a number: relicBonus only sums numerics
  f.sure = relicFlag(v, 'sure');
  // SPARES. `sure` from a relic and the whale that shadows the boat are the same mechanic:
  // one animal a stage that the water reaches anyway, and does not take. Counted, not
  // boolean, so two sources stack the way the player would expect.
  f.spare = (f.sure ? 1 : 0) + ((v.flags && v.flags.whale) ? 1 : 0);
  f.limit = Math.round(f.limit * (1 + f.patience * 6));
  // the flood eats the whole board over `limit` seconds, minus the two ark columns
  f.floodRate = (COLS - ARK_COLS) / f.limit;

  generate(f);

  // the animals ashore
  const pool = (island.pool && island.pool.length) ? island.pool : null;
  // MORE THAN THE BERTHS. A stage where everything ashore fits on the boat has no
  // decision in it; the whole game is choosing which ones. Roughly half again as many as
  // the island advertises, and never fewer than nine on a field this wide.
  const count = Math.max(9, Math.round((island.animals || 6) * 1.6));
  for (let i = 0; i < count; i++) {
    const id = pool ? pool[rng.int(pool.length)] : null;
    const a = (id && ANIMAL_BY_ID[id]) || pickLoose(rng, island);
    if (!a) continue;
    // spread them over the right two thirds, and never on top of an obstacle
    let c = 0, r = 0, tries = 0;
    do {
      c = Math.round(COLS * 0.35) + rng.int(Math.round(COLS * 0.6));
      r = rng.int(ROWS);
      tries++;
    } while (tries < 40 && !walkable(f.grid[idx(clamp(c, 0, COLS - 1), r)]));
    const cr = makeCreature(a, clamp(c, ARK_COLS + 2, COLS - 1) + 0.5, r + 0.5, rng);
    cr.loyal = isLoyal(v, a.id);       // a loyal apple means this one does not die here
    f.animals.push(cr);
  }

  unblockStarts(f);
  f.startBerths = berthsFree(v);      // recorded so a harness can tell a full ark from a bug
  return f;
}

function pickLoose(rng, island) {
  const home = island.biome;
  const all = Object.keys(ANIMAL_BY_ID);
  for (let i = 0; i < 24; i++) {
    const a = ANIMAL_BY_ID[all[rng.int(all.length)]];
    if (a && (!home || a.home === home)) return a;
  }
  return ANIMAL_BY_ID[all[rng.int(all.length)]];
}

function makeCreature(a, c, r, rng) {
  return {
    a, id: a.id,
    c, r,
    // tiles a second. Big animals are slower, which is exactly the reason to spend a
    // herder on them early rather than hope.
    speed: 1.35 / (0.75 + (a.mass || 1) * 0.3),
    state: 'wander',
    heading: rng.range(0, Math.PI * 2),
    turnIn: rng.range(0.4, 1.8),
    walk: rng.range(0, 1),
    fear: 0, panic: 0, led: 0, calmed: 0, wet: 0, homing: false,
    loyal: false,   // set from the voyage's loyal list at spawn
    blink: rng.range(0, 4),
    face: rng.chance(0.5) ? -1 : 1,
  };
}

/* ------------------------------------------------------------------------ notes */

export function note(f, text, color) {
  f.notes.unshift({ text, color: color || 'parch', t: 0 });
  if (f.notes.length > 4) f.notes.length = 4;
}

/* ---------------------------------------------------------------- placing things */

/** What is the player about to put down? `sel` is {kind:'doll'|'animal', id} or null. */
export function select(f, sel) { f.sel = sel; return f.sel; }

/** A doll's circle, after the crook's reach bonus. */
export function radiusOf(f, d) {
  if (!d || !d.radius) return d ? d.radius : 0;
  return d.radius * (1 + (f.reach || 0));
}

export function dollCharges(f, id) {
  const d = DOLL_BY_ID[id];
  if (!d) return 0;
  const owned = (f.voyage.dolls && f.voyage.dolls[id]) || 0;
  const used = f.stock[id] || 0;
  return Math.max(0, Math.min(owned, d.charges) - used);
}

/** Can this tile take a doll at all? */
export function canPlaceDoll(f, d, c, r) {
  if (!inGrid(c, r)) return 'off the island';
  const k = f.grid[idx(c, r)];
  if (k === T.DECK) return 'not on the deck';
  for (const o of f.dolls) if ((o.c | 0) === c && (o.r | 0) === r) return 'one already stands there';
  // a bridge doll is the one that WANTS to be in the water
  if (d.effect === 'span') return (k === T.WATER) ? null : 'a bridge wants water';
  if (d.effect === 'break') return null;      // it works from open ground beside the thing
  if (!walkable(k)) return 'nothing can stand there';
  return null;
}

export function placeDoll(f, id, c, r) {
  const d = DOLL_BY_ID[id];
  if (!d || f.over) return { ok: false, why: 'no' };
  if (dollCharges(f, id) <= 0) return { ok: false, why: 'none left' };
  const bad = canPlaceDoll(f, d, c, r);
  if (bad) return { ok: false, why: bad };

  f.stock[id] = (f.stock[id] || 0) + 1;
  const doll = { d, id, c: c + 0.5, r: r + 0.5, born: f.t, life: d.life || 0, lit: false };
  f.dolls.push(doll);

  // the instant effects
  if (d.effect === 'span') {
    for (let dr = -d.radius; dr <= d.radius; dr++) {
      for (let dc = -d.radius; dc <= d.radius; dc++) {
        const cc = c + dc, rr = r + dr;
        if (!inGrid(cc, rr)) continue;
        if (f.grid[idx(cc, rr)] === T.WATER) f.grid[idx(cc, rr)] = T.PLANK;
      }
    }
    touch(f);
    note(f, 'THE SHALLOWS ARE CROSSABLE', 'sky');
  } else if (d.effect === 'break') {
    let n = 0;
    for (let dr = -d.radius; dr <= d.radius; dr++) {
      for (let dc = -d.radius; dc <= d.radius; dc++) {
        const cc = c + dc, rr = r + dr;
        if (!inGrid(cc, rr)) continue;
        if (breakable(f.grid[idx(cc, rr)])) { f.grid[idx(cc, rr)] = floorFor(f.island.biome); n++; }
      }
    }
    touch(f);
    note(f, n ? `${n} CLEARED` : 'NOTHING TO BREAK', n ? 'gold' : 'grey2');
    for (let i = 0; i < 6; i++) f.puffs.push({ c: c + 0.5, r: r + 0.5, t: 0, kind: 'dust', i });
  } else if (d.effect === 'block') {
    f.blocked[idx(c, r)] = 1;
    touch(f);
    note(f, 'THE WAY IS SHUT', 'stone3');
  } else {
    note(f, d.name.toUpperCase() + ' STANDS', 'clay4');
  }
  return { ok: true, doll };
}

/**
 * Put one of your own animals down to use its ability.
 *
 * It does its job and then walks itself home, which means placing it is not a sacrifice --
 * but it is not free either, because it now has to survive the walk like everything else.
 */
export function placeAnimal(f, animalId, c, r) {
  if (f.over) return { ok: false, why: 'no' };
  const v = f.voyage;
  // `aboard` is the deck, `hold` is apples and gear -- two different lists, and reaching
  // into the wrong one silently never finds the animal
  const held = v.aboard || [];
  const at = held.indexOf(animalId);
  if (at < 0) return { ok: false, why: 'not aboard' };
  if (!inGrid(c, r)) return { ok: false, why: 'off the island' };
  const a = ANIMAL_BY_ID[animalId];
  const ab = abilityOf(a);
  const k = f.grid[idx(c, r)];
  const wet = k === T.WATER;
  if (!walkable(k) && !(wet && ab.id === 'ferry')) return { ok: false, why: 'nothing can stand there' };

  let did = '';
  const around = (rad, fn) => {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const cc = c + dc, rr = r + dr;
        if (inGrid(cc, rr)) fn(idx(cc, rr), cc, rr);
      }
    }
  };
  const clear = (want, name) => {
    let n = 0;
    around(1, (i) => { if (f.grid[i] === want) { f.grid[i] = floorFor(f.island.biome); n++; } });
    if (n) { touch(f); did = `${n} ${name} CLEARED`; }
    return n;
  };

  if (ab.id === 'smash') clear(T.ROCK, 'ROCK');
  else if (ab.id === 'graze') clear(T.BUSH, 'BRIAR');
  else if (ab.id === 'tunnel') { if (!clear(T.TREE, 'DEADFALL')) clear(T.MUD, 'MIRE'); }
  else if (ab.id === 'climb') clear(T.CLIFF, 'CLIFF');
  else if (ab.id === 'ferry') {
    let n = 0;
    around(1, (i) => { if (f.grid[i] === T.WATER) { f.grid[i] = T.PLANK; n++; } });
    if (n) { touch(f); did = 'A CROSSING'; }
  } else if (ab.id === 'lift') {
    // carries the animal nearest the drop point straight home
    let best = null, bd = 1e9;
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      const dd = (cr.c - c - 0.5) ** 2 + (cr.r - r - 0.5) ** 2;
      if (dd < bd) { bd = dd; best = cr; }
    }
    if (best) { arrive(f, best, true); did = `${best.a.name.toUpperCase()} CARRIED HOME`; }
  } else if (ab.id === 'rally') {
    let n = 0;
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      if (Math.hypot(cr.c - c - 0.5, cr.r - r - 0.5) > 6) continue;
      cr.led = Math.max(cr.led, 6); n++;
    }
    if (n) did = `${n} ANSWERED THE CALL`;
  } else if (ab.id === 'warm') {
    f.floodCols = Math.max(0, f.floodCols - 1.4);
    touch(f);
    did = 'THE WATER DREW BACK';
  }

  held.splice(at, 1);
  f.used.push(animalId);
  // it lands on the field and heads home under its own steam
  const cr = makeCreature(a, c + 0.5, r + 0.5, f.rng);
  cr.led = 4;
  cr.mine = true;
  f.animals.push(cr);
  note(f, did || `${a.name.toUpperCase()} IS DOWN`, 'gold');
  for (let i = 0; i < 5; i++) f.puffs.push({ c: c + 0.5, r: r + 0.5, t: 0, kind: 'dust', i });
  return { ok: true, did };
}

/**
 * Use an apple.
 *
 * The basket is small on purpose -- two, three at most -- so an apple is a moment you
 * choose rather than a resource you manage. Each one is one line of effect:
 *
 *   loyal  the animal it hits never dies on a field again
 *   tide   the water draws back
 *   call   everything in a wide circle remembers the way home
 *   free   whatever is in the way, is not
 */
export function useApple(f, itemId, c, r) {
  if (f.over) return { ok: false, why: 'no' };
  const it = ITEM_BY_ID[itemId];
  if (!it) return { ok: false, why: 'no such thing' };
  const hold = f.voyage.hold || [];
  const at = hold.indexOf(itemId);
  if (at < 0) return { ok: false, why: 'not in the basket' };
  if (!inGrid(c, r)) return { ok: false, why: 'off the island' };

  let did = '';
  if (it.effect === 'loyal') {
    let best = null, bd = 4;
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      const dd = Math.hypot(cr.c - c - 0.5, cr.r - r - 0.5);
      if (dd < bd) { bd = dd; best = cr; }
    }
    if (!best) return { ok: false, why: 'nothing to throw it to' };
    best.loyal = true;
    makeLoyal(f.voyage, best.id);
    did = `${best.a.name.toUpperCase()} IS LOYAL`;
  } else if (it.effect === 'tide') {
    f.floodCols = Math.max(0, f.floodCols - (it.power || 2));
    touch(f);
    did = 'THE WATER DREW BACK';
  } else if (it.effect === 'call') {
    let n = 0;
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      if (Math.hypot(cr.c - c - 0.5, cr.r - r - 0.5) > 8) continue;
      cr.led = Math.max(cr.led, 7); n++;
    }
    did = `${n} ANSWERED`;
  } else if (it.effect === 'free') {
    let n = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const cc = c + dc, rr = r + dr;
        if (!inGrid(cc, rr)) continue;
        if (breakable(f.grid[idx(cc, rr)])) { f.grid[idx(cc, rr)] = floorFor(f.island.biome); n++; }
      }
    }
    if (n) touch(f);
    did = `${n} CLEARED`;
  } else {
    return { ok: false, why: 'not for out here' };
  }
  hold.splice(at, 1);
  f.voyage.stats.applesUsed = (f.voyage.stats.applesUsed || 0) + 1;
  note(f, did, 'red2');
  for (let i = 0; i < 6; i++) f.puffs.push({ c: c + 0.5, r: r + 0.5, t: 0, kind: 'dust', i });
  return { ok: true, did };
}

export function basket(f) {
  const cap = holdSize(f.voyage);
  return (f.voyage.hold || []).slice(0, Math.max(cap, 2));
}

/** Place whatever is selected. The scene calls this with a tile it worked out from a click. */
export function placeAt(f, c, r) {
  if (!f.sel) return { ok: false, why: 'nothing selected' };
  const res = f.sel.kind === 'doll' ? placeDoll(f, f.sel.id, c, r)
    : f.sel.kind === 'apple' ? useApple(f, f.sel.id, c, r)
      : placeAnimal(f, f.sel.id, c, r);
  if (res.ok) {
    if (f.sel.kind === 'animal' || f.sel.kind === 'apple') f.sel = null;
    else if (dollCharges(f, f.sel.id) <= 0) f.sel = null;
  }
  return res;
}

/* ------------------------------------------------------------------- outcomes */

/**
 * An animal reaches the deck.
 *
 * A FULL ARK IS A REAL WALL. If there is no berth the animal does not board -- it turns
 * round and stands on the gangway, and it will drown there like anything else. That is the
 * whole point of the berth economy: the decision about who to bring is made on the map,
 * and this is where it bites.
 */
function arrive(f, cr, carried) {
  if (cr.state === 'safe') return;
  if (!takeAboard(f.voyage, cr.id)) {
    cr.c = ARK_COLS + 1.6;
    cr.led = 0;
    cr.turnIn = 0.1;
    if (!cr.toldFull) {
      cr.toldFull = true;
      note(f, 'NO BERTH LEFT', 'red2');
    }
    return;
  }
  cr.state = 'safe';
  cr.loyal = cr.loyal || isLoyal(f.voyage, cr.id);
  f.saved.push(cr.id);
  note(f, `${cr.a.name.toUpperCase()} IS ABOARD`, 'leaf3');
  void carried;
}

function drown(f, cr, why) {
  if (cr.state === 'lost' || cr.state === 'safe') return;
  // three separate reprieves, checked in the order the player paid for them
  if (cr.loyal) {
    // a loyal apple means it does not die here. It gets one free save and it uses it.
    cr.loyal = false;
    cr.c = Math.max(ARK_COLS + 1.5, cr.c - 3);
    cr.led = 5;
    note(f, `${cr.a.name.toUpperCase()} WAS SPARED`, 'red2');
    return;
  }
  if (f.spare > 0) {
    f.spare--;
    cr.c = ARK_COLS + 1.6;
    cr.led = 4;
    note(f, `SOMETHING PULLED THE ${cr.a.name.toUpperCase()} OUT`, 'gold');
    return;
  }
  if (f.dry && !cr.washed) {
    cr.washed = true;
    cr.c = ARK_COLS + 1.6;
    cr.panic = 0.6;
    note(f, `${cr.a.name.toUpperCase()} WASHED BACK`, 'sky');
    return;
  }
  cr.state = 'lost';
  f.lost.push(cr.id);
  // an animal that was already on the deck (put down to use its ability) has to come OFF
  // the ledger as well as off the field
  if (cr.mine) lose(f.voyage, cr.id, why.toLowerCase());
  note(f, `${cr.a.name.toUpperCase()} ${why}`, 'red2');
}

export function berths(f) { return berthsFree(f.voyage); }

export function remaining(f) {
  return f.animals.filter((a) => a.state !== 'safe' && a.state !== 'lost').length;
}

export function secondsLeft(f) {
  return Math.max(0, (COLS - ARK_COLS - f.floodCols) / f.floodRate);
}

export function endField(f, why) {
  if (f.over) return;
  f.over = true;
  f.why = why || 'flood';
  for (const cr of f.animals) if (cr.state !== 'safe' && cr.state !== 'lost') drown(f, cr, 'WAS LEFT BEHIND');
  if (f.saved.length > f.voyage.stats.bestRescue) f.voyage.stats.bestRescue = f.saved.length;
  say(f.voyage, `${f.island.name}: ${f.saved.length} saved, ${f.lost.length} lost.`,
    f.saved.length >= f.lost.length ? 'leaf4' : 'rust');
}

export function result(f) {
  return {
    island: f.island.id,
    saved: f.saved.slice(),
    lost: f.lost.slice(),
    used: f.used.slice(),
    why: f.why,
    seconds: f.t,
  };
}

/* -------------------------------------------------------------------- the update */

const MAX_STEP = 1 / 30;

export function update(f, dt) {
  // clamp the step so a tab that was in the background does not teleport the flood
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
    if (f.puffs[i].t > 0.6) f.puffs.splice(i, 1);
  }
  for (let i = f.strikes.length - 1; i >= 0; i--) {
    f.strikes[i].t += dt;
    if (f.strikes[i].t > 0.34 && !f.strikes[i].spawned) {
      f.strikes[i].spawned = true;
      spawnMonster(f, f.strikes[i].c, f.strikes[i].r);
    }
    if (f.strikes[i].t > 0.6) f.strikes.splice(i, 1);
  }
  if (f.over) return;

  // --- the flood
  const before = Math.floor(f.floodCols);
  f.floodCols += f.floodRate * dt;
  if (Math.floor(f.floodCols) !== before) {
    const col = COLS - Math.floor(f.floodCols);
    for (let r = 0; r < ROWS; r++) {
      if (col >= 0 && col < COLS) f.grid[idx(col, r)] = T.WATER;
    }
    touch(f);
    if (Math.floor(f.floodCols) % 4 === 0) note(f, 'THE WATER TAKES ANOTHER STRIP', 'water3');
  }
  if (f.floodCols >= COLS - ARK_COLS - 0.5) { endField(f, 'flood'); return; }

  // --- the storm drops something
  f.strikeIn -= dt;
  if (f.strikeIn <= 0) {
    f.strikeIn = Math.max(5, 14 - (f.island.danger || 1) * 1.4) * f.rng.range(0.8, 1.3);
    const drown0 = COLS - Math.floor(f.floodCols);
    let c = ARK_COLS + 3 + f.rng.int(Math.max(1, drown0 - ARK_COLS - 4));
    const r = f.rng.int(ROWS);
    c = clamp(c, ARK_COLS + 2, COLS - 1);
    f.strikes.push({ c, r, t: 0, spawned: false });
  }

  if (f.flowDirty) computeFlow(f);

  // --- the dolls
  for (let i = f.dolls.length - 1; i >= 0; i--) {
    const d = f.dolls[i];
    if (d.life && f.t - d.born > d.life) {
      if (d.d.effect === 'block') { f.blocked[idx(d.c | 0, d.r | 0)] = 0; touch(f); }
      f.dolls.splice(i, 1);
      note(f, d.d.name.toUpperCase() + ' CRUMBLED', 'grey2');
      continue;
    }
    d.lit = false;
  }

  // --- creatures
  for (const cr of f.animals) {
    if (cr.state === 'safe' || cr.state === 'lost') continue;
    stepCreature(f, cr, dt);
  }
  // --- monsters
  for (const m of f.monsters) stepMonster(f, m, dt);

  if (remaining(f) === 0) endField(f, 'clear');
}

function spawnMonster(f, c, r) {
  const def = rollMonster(f.rng, f.island);
  f.monsters.push({
    def, c: c + 0.5, r: r + 0.5,
    heading: f.rng.range(0, Math.PI * 2),
    turnIn: f.rng.range(0.5, 1.6),
    calm: false, face: -1, born: f.t,
  });
  note(f, def.name.toUpperCase() + ' CAME DOWN', 'red2');
}

/** Is this tile currently under water? */
function drowned(f, c) { return c >= COLS - Math.floor(f.floodCols); }

function passableFor(f, c, r) {
  if (!inGrid(c, r)) return false;
  if (f.blocked[idx(c, r)]) return false;
  if (drowned(f, c)) return false;
  return walkable(f.grid[idx(c, r)]);
}

/** Move a body, sliding along whatever it cannot walk through. */
function moveBody(f, e, dx, dy) {
  const nc = e.c + dx, nr = e.r + dy;
  if (passableFor(f, nc | 0, e.r | 0)) e.c = clamp(nc, 0.2, COLS - 0.2);
  if (passableFor(f, e.c | 0, nr | 0)) e.r = clamp(nr, 0.2, ROWS - 0.2);
}

function stepCreature(f, cr, dt) {
  cr.blink += dt;
  cr.led = Math.max(0, cr.led - dt);
  cr.calmed = Math.max(0, cr.calmed - dt);
  cr.panic = Math.max(0, cr.panic - dt);

  // --- what the dolls are doing to it
  let warded = false;
  for (const d of f.dolls) {
    const dist = Math.hypot(cr.c - d.c, cr.r - d.r);
    if (dist > radiusOf(f, d.d) + 0.5) continue;
    if (d.d.effect === 'lead') {
      // ONCE SHOWN THE WAY, THEY KEEP GOING. The first version only led an animal while it
      // stood inside the circle, so a herder nudged its cluster a few tiles and then every
      // one of them went back to wandering -- across eleven islands the greedy shepherd
      // saved twelve animals out of a hundred and two. A shepherd points them home and they
      // go home; what UNDOES it is being frightened, which is exactly what the monsters are
      // for.
      cr.homing = true;
      d.lit = true;
    }
    else if (d.d.effect === 'calm') { cr.calmed = Math.max(cr.calmed, 0.4); d.lit = true; }
    else if (d.d.effect === 'ward') { warded = true; d.lit = true; }
  }

  // --- fear
  let flee = null, fd = 1e9;
  if (!cr.calmed) {
    for (const m of f.monsters) {
      if (m.calm) continue;
      const dist = Math.hypot(cr.c - m.c, cr.r - m.r);
      if (dist < m.def.scare && dist < fd) { fd = dist; flee = m; }
    }
  }
  // the water itself is frightening once it is close
  const edge = COLS - Math.floor(f.floodCols);
  if (!flee && cr.c > edge - 1.6) { cr.panic = Math.max(cr.panic, 0.5); }

  const wetTile = f.grid[idx(clamp(cr.c | 0, 0, COLS - 1), clamp(cr.r | 0, 0, ROWS - 1))];
  cr.wet = wetTile === T.PLANK || wetTile === T.MUD ? Math.min(1, cr.wet + dt) : Math.max(0, cr.wet - dt * 0.4);
  const slow = wetTile === T.MUD ? 0.55 : 1;
  const hurry = warded ? 1.25 : 1;

  let sp = cr.speed * slow * hurry;
  let dirX = 0, dirY = 0;

  if (flee) {
    cr.state = 'flee';
    cr.fear = 1;
    const a = Math.atan2(cr.r - flee.r, cr.c - flee.c);
    dirX = Math.cos(a); dirY = Math.sin(a);
    sp *= 1.7;
  } else if (cr.homing || cr.led > 0) {
    cr.state = 'lead';
    cr.fear = 0;
    const step = downhill(f, cr.c | 0, cr.r | 0);
    if (step) {
      dirX = (step.c + 0.5) - cr.c;
      dirY = (step.r + 0.5) - cr.r;
      const len = Math.hypot(dirX, dirY) || 1;
      dirX /= len; dirY /= len;
    }
    sp *= 1.15;
  } else if (cr.panic > 0) {
    cr.state = 'flee';
    dirX = -1; dirY = 0;                       // away from the water, which is to the left
    sp *= 1.4;
  } else {
    cr.state = 'wander';
    cr.fear = 0;
    cr.turnIn -= dt;
    if (cr.turnIn <= 0) {
      cr.turnIn = f.rng.range(0.5, 2.2);
      cr.heading = f.rng.range(0, Math.PI * 2);
    }
    dirX = Math.cos(cr.heading); dirY = Math.sin(cr.heading);
    sp *= 0.4;
  }

  if (dirX || dirY) {
    moveBody(f, cr, dirX * sp * dt, dirY * sp * dt * 0.8);
    cr.walk = (cr.walk + sp * dt * 1.7) % 1;
    if (Math.abs(dirX) > 0.2) cr.face = dirX < 0 ? -1 : 1;
  }

  // --- home, or gone
  if (cr.c <= ARK_COLS + 0.4) {
    arrive(f, cr, false);
    return;
  }
  if (drowned(f, cr.c | 0)) drown(f, cr, 'WAS TAKEN BY THE WATER');
}

/** The neighbour with the smallest distance-to-home. */
function downhill(f, c, r) {
  let best = null, bv = f.flow[idx(clamp(c, 0, COLS - 1), clamp(r, 0, ROWS - 1))];
  if (bv < 0) bv = 1e9;
  for (let k = 0; k < 4; k++) {
    const nc = c + (k === 0 ? -1 : k === 1 ? 1 : 0);
    const nr = r + (k === 2 ? -1 : k === 3 ? 1 : 0);
    if (!inGrid(nc, nr)) continue;
    const v = f.flow[idx(nc, nr)];
    if (v < 0) continue;
    if (v < bv) { bv = v; best = { c: nc, r: nr }; }
  }
  return best;
}

function stepMonster(f, m, dt) {
  // dolls that hold it off
  m.calm = false;
  for (const d of f.dolls) {
    const dist = Math.hypot(m.c - d.c, m.r - d.r);
    if (dist > radiusOf(f, d.d) + 0.5) continue;
    if (d.d.effect === 'calm') { m.calm = true; d.lit = true; }
    else if (d.d.effect === 'ward') {
      // pushed back out of the light rather than frozen: a monster that stops dead at an
      // invisible line looks broken, one that backs off looks afraid
      const a = Math.atan2(m.r - d.r, m.c - d.c);
      m.c += Math.cos(a) * dt * 2.2;
      m.r += Math.sin(a) * dt * 1.6;
      d.lit = true;
    }
  }
  if (m.calm) return;

  const sp = m.def.speed;
  let dirX = 0, dirY = 0;
  if (m.def.hunts === 'animal') {
    let best = null, bd = 1e9;
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      const dd = (cr.c - m.c) ** 2 + (cr.r - m.r) ** 2;
      if (dd < bd) { bd = dd; best = cr; }
    }
    if (best) {
      const a = Math.atan2(best.r - m.r, best.c - m.c);
      dirX = Math.cos(a); dirY = Math.sin(a);
      if (bd < 0.36) {
        if (m.def.kill) drown(f, best, `WAS TAKEN BY THE ${m.def.name.toUpperCase()}`);
        else {
          // scattered: thrown away from the ark, which costs real ground
          best.c = clamp(best.c + 2.2, 0, COLS - 0.5);
          best.led = 0;
          best.homing = false;      // frightened out of it, and has to be shown again
          best.panic = 1.2;
          note(f, `${best.a.name.toUpperCase()} SCATTERED`, 'orange');
        }
      }
    }
  } else if (m.def.hunts === 'water') {
    // patrols the flood edge, up and down
    const edge = COLS - Math.floor(f.floodCols) - 0.5;
    dirX = clamp(edge - m.c, -1, 1);
    m.turnIn -= dt;
    if (m.turnIn <= 0) { m.turnIn = f.rng.range(1.2, 3); m.heading = f.rng.chance(0.5) ? 1 : -1; }
    dirY = m.heading;
  } else {
    m.turnIn -= dt;
    if (m.turnIn <= 0) { m.turnIn = f.rng.range(0.6, 2); m.heading = f.rng.range(0, Math.PI * 2); }
    dirX = Math.cos(m.heading); dirY = Math.sin(m.heading);
  }

  // monsters ignore terrain -- they came out of the sky -- but not the edges
  m.c = clamp(m.c + dirX * sp * dt, ARK_COLS + 1.2, COLS - 0.3);
  m.r = clamp(m.r + dirY * sp * dt * 0.8, 0.3, ROWS - 0.3);
  if (Math.abs(dirX) > 0.15) m.face = dirX < 0 ? -1 : 1;
}

/* ------------------------------------------------------------------ debug hooks */

export const _internals = { idx, inGrid, downhill, floorFor, drowned };
