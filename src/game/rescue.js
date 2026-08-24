// THE RESCUE — what an island actually is.
//
// You are moored on the left. The flood is coming in from the right. Between the two,
// scattered across the last of the island, are animals that cannot swim home, and
// between YOU and THEM is whatever that biome puts in the way.
//
// Two verbs, and the whole level is the tension between them:
//
//   FLICK    aim the shepherd wand at a stranded animal and roll it toward the boat.
//            It is a ball: it bounces off boulders, bogs down in mud, slides on ice,
//            gets carried by a current, and drowns if it stops in deep water.
//
//   PUT DOWN take an animal you already carry and place it on an obstacle. If its
//            ability answers that obstacle, the obstacle OPENS -- the briar is eaten,
//            the landslide is dug through, a swimmer holds station in the channel so
//            the next one can ride across. The animal you put down stays there, which
//            means clearing a path is a real risk and not a free move.
//
// Both cost TIDE. That is the clock: every flick and every placement lets the water in
// another step, and anything the water reaches is gone. So the question a rescue asks
// is never "can I get them all" -- it is "in what order, and what am I willing to
// spend to reach the last one".
//
// Loyal animals (see the Loyal Apple) are the exception the player buys: the flood does
// not take them, on the island or off it.

import { makeRng } from '../core/rng.js';
import {
  createWorld, addBall, setGates, setPosts, setZones, step, strike, isSettled, TUNING,
} from './physics.js';
import { ANIMAL_BY_ID, ANIMALS } from '../data/animals.js';
import { abilityOf } from '../data/abilities.js';
import { OBSTACLE_BY_ID } from '../data/obstacles.js';
import { ITEM_BY_ID } from '../data/items.js';
import {
  takeAboard, berthsFree, isLoyal, makeLoyal, useItem, lose, say, repairHull,
  relicBonus, relicFlag,
} from './voyage.js';

/* ------------------------------------------------------------------ geometry

The field is in PIXELS. The old table carried its own unit system because it was drawn
in perspective; a rescue is drawn flat, so one world unit is one screen pixel and there
is no projection to get wrong.
*/
export const FIELD_W = 880;
export const FIELD_H = 306;
export const BALL_R = 13;                 // matches the ball sprite exactly
export const GANGWAY_X = 46;              // the boat's side, where an animal is safe
const TIDE_LIMIT = GANGWAY_X + 54;        // the water never quite reaches the gangway
const TIDE_START = FIELD_W + 48;          // ...and it starts just off the far shore, so
                                          // the first move is never already fatal

/**
 * Friction is raised, not lowered, because the field is four times the old table and the
 * ball has to CROSS it rather than wander it: a heavier decel with a harder launch reads
 * as a firm shove that arrives, where a light decel reads as a marble on glass. Tuned so
 * a full-power flick crosses about 800 pixels in three and a half seconds.
 */
const WORLD_FRICTION = 1.5;

/**
 * Obstacle radii come from data/obstacles.js in the old table's units, and the rescue
 * field is nearly four times that. One factor here beats fourteen retuned data rows,
 * and an obstacle you have to squint at is not an obstacle.
 */
const OB_SCALE = 1.7;

/** Screen power 0..1 -> solver power. Never zero: a flick with no push is a misclick. */
export function shotPower(p) {
  return 0.28 + Math.max(0, Math.min(1, p)) * 1.32;
}

/** How far in the water has come, in field x. */
export function tideX(r) {
  return TIDE_START - r.tide * (TIDE_START - TIDE_LIMIT);
}

/** One flick or one placement lets this much water in. Nastier islands drain faster. */
export function tidePerAction(island) {
  return 0.075 + (island.danger || 1) * 0.012;
}

/* ------------------------------------------------------------------- the level */

/**
 * Lay out one island.
 *
 * Everything is placed from a fork of the voyage seed, so the same island on the same
 * leg of the same run is always the same level -- which is what makes a lost run worth
 * arguing with rather than shrugging at.
 */
export function newRescue(v, island, tag) {
  const rng = makeRng(`${v.seed}/rescue/${island.id}/${tag || v.stats.legs}`);
  const world = createWorld({
    w: FIELD_W, h: FIELD_H,
    // the crook's reach is a friction discount, which is the honest place for it: a
    // longer reach IS a ball that keeps rolling
    friction: WORLD_FRICTION / (1 + relicBonus(v, 'reach')),
    lookup: (id) => {
      const a = ANIMAL_BY_ID[id];
      return a ? { mass: a.mass, size: 1 } : null;
    },
  });

  const r = {
    voyage: v, island, rng, world,
    tide: 0,
    step: Math.max(0.03, tidePerAction(island) - relicBonus(v, 'patience')),
    dry: relicFlag(v, 'dry'),
    // the dove's favour, and the whale that shadows you if you put the harpoon down
    spare: (relicFlag(v, 'sure') ? 1 : 0) + (v.flags && v.flags.whale ? 1 : 0),
    strand: [],            // the animals to save: {ball, animalId, state}
    helpers: [],           // brought animals put down: {animalId, x, y, ability, obId}
    obstacles: [],
    rescued: [], drowned: [], spent: [],
    cleared: 0, shots: 0,
    over: false, left: false,
    note: null, noteT: 0,
    freeFlick: false,
  };

  buildObstacles(r);
  buildStrand(r);
  syncGates(r);
  return r;
}

/* --------------------------------------------------------------- obstacles */

/**
 * Obstacles are laid out in COLUMNS between the boat and the far shore, one band per
 * kind, so a level always reads as a series of things to get past rather than a
 * scattering of hazards. Which kinds appear is the biome's; where they sit is the seed's.
 */
function buildObstacles(r) {
  const kinds = r.island.obstacles || [];
  if (!kinds.length) return;
  const bands = kinds.length;
  kinds.forEach((kind, i) => {
    const ob = OBSTACLE_BY_ID[kind];
    if (!ob) return;
    const n = 2 + r.rng.int(2);                       // two or three of each
    const bandX = GANGWAY_X + 120 + (i + 0.5) * ((FIELD_W - GANGWAY_X - 190) / bands);
    for (let k = 0; k < n; k++) {
      const x = Math.round(bandX + r.rng.range(-46, 46));
      const y = Math.round(28 + ((k + 0.5) / n) * (FIELD_H - 56) + r.rng.range(-22, 22));
      r.obstacles.push({
        id: `${kind}${i}${k}`,
        kind, ob,
        x, y,
        // data/obstacles.js carries radii in the old table's units; the rescue field is
        // nearly four times that, and an obstacle you have to squint at is not an
        // obstacle. One factor here rather than 14 retuned rows there.
        r: Math.round(ob.r * OB_SCALE) + (ob.long ? 10 : 0),
        long: !!ob.long,
        cleared: false,
        angle: ob.physics === 'push' ? (r.rng.chance(0.5) ? Math.PI * 0.5 : -Math.PI * 0.5) : 0,
        seed: r.rng.int(9999),
      });
    }
  });
  applyObstacles(r);
}

/** Push the obstacle list into the solver as posts (solid) and zones (everything else). */
function applyObstacles(r) {
  const posts = [], zones = [];
  for (const o of r.obstacles) {
    if (o.cleared) continue;
    if (o.ob.physics === 'solid') {
      posts.push({ id: o.id, x: o.x, y: o.y, r: o.r, e: o.kind === 'log' ? 0.42 : 0.66, kind: o.kind });
    } else {
      zones.push({
        id: o.id, x: o.x, y: o.y, r: o.r + 3,
        physics: o.ob.physics, strength: 1, angle: o.angle, kind: o.kind,
      });
    }
  }
  setPosts(r.world, posts);
  setZones(r.world, zones);
}

/* ------------------------------------------------------------------ the stranded */

/**
 * Who is out there. Drawn from the animals that WANT this biome (data/habitats likes),
 * so a jungle is full of jungle animals -- and placed to the right of the obstacles,
 * because an animal you can reach without solving anything is not a rescue.
 */
function buildStrand(r) {
  const n = r.island.animals || 0;
  if (!n) return;
  const wants = r.island.likes || [];
  const pool = ANIMALS.filter((a) => {
    if (!a.likes) return false;
    for (const l of a.likes) if (wants.indexOf(l) >= 0) return true;
    return false;
  });
  const src = pool.length >= n ? pool : ANIMALS;
  const picked = [];
  for (let i = 0; i < n; i++) {
    const a = r.rng.pick(src);
    picked.push(a);
  }
  // Placed in a BAND, not against the far shore. Spawning them at the right edge meant
  // the first two moves of every level drowned somebody before the player had touched
  // anything, which reads as the game cheating rather than as the water winning.
  const near = GANGWAY_X + 330, far = FIELD_W - 120;
  picked.forEach((a, i) => {
    const lane = (i + 0.5) / n;
    const x = Math.round(near + ((i * 5) % n / n) * (far - near) + r.rng.range(-40, 40));
    const y = Math.round(26 + lane * (FIELD_H - 52) + r.rng.range(-14, 14));
    const ball = addBall(r.world, { animalId: a.id, x, y, r: BALL_R, mass: a.mass });
    if (!ball) return;
    r.strand.push({ ball, animalId: a.id, state: 'ashore' });
  });
}

/* ---------------------------------------------------------------- the gangway

The boat's side is three capture mouths rather than one, so an animal rolled anywhere
down the left edge gets home -- but they are all CLOSED when the pens are full, because
a boat with no room is the honest way to say "no room" and a capture that silently threw
the animal away would not be.
*/
function syncGates(r) {
  if (berthsFree(r.voyage) <= 0) { setGates(r.world, []); return; }
  const gates = [];
  for (let i = 0; i < 3; i++) {
    gates.push({
      id: `gang${i}`, habitatId: 'boat', slot: `g${i}`,
      x: GANGWAY_X, y: Math.round((i + 0.5) * (FIELD_H / 3)), r: 26,
    });
  }
  setGates(r.world, gates);
}

export function pensFull(r) { return berthsFree(r.voyage) <= 0; }

/* -------------------------------------------------------------------- notes */

export function note(r, text, color) {
  r.note = { text, color: color || 'cream' };
  r.noteT = 2.6;
  return r;
}

/**
 * Take one, or find a reason not to.
 *
 * Every loss in a rescue goes through here, because there are three separate mercies --
 * loyalty, the Dove's Favour, and the dowsing rod's shallow way -- and having each of
 * them checked in three different places is how one of them quietly stops working.
 */
function claim(r, entry, why, washBack) {
  if (isLoyal(r.voyage, entry.animalId)) return 'loyal';
  if (washBack && r.dry) {
    // the shallow way: put it back on the shore side of whatever nearly had it
    const z = entry.ball.zone;
    entry.ball.vx = 0; entry.ball.vy = 0;
    entry.ball.x = Math.max(GANGWAY_X + BALL_R + 2, (z ? z.x - z.r : entry.ball.x) - BALL_R - 4);
    entry.ball.zone = null;
    note(r, 'The rod found the shallow way. It washes back ashore.', 'water3');
    return 'dry';
  }
  if (r.spare > 0) {
    r.spare--;
    note(r, "The dove's favour. Not this one.", 'cream');
    return 'spared';
  }
  entry.state = 'drowned';
  entry.ball.sunk = true;
  r.drowned.push(entry.animalId);
  r.voyage.stats.drowned++;
  void why;
  return null;
}

/* --------------------------------------------------------------------- tide */

/**
 * Let the water in. Everything to the right of the new line is taken -- stranded animals
 * drown, and helpers you put down go with them, which is the cost of having used one to
 * open a path you no longer need.
 */
export function advanceTide(r, n = 1) {
  if (r.over) return r;
  r.tide = Math.min(1, r.tide + r.step * n);
  const line = tideX(r);
  for (const s of r.strand) {
    if (s.state !== 'ashore') continue;
    if (s.ball.sunk) continue;
    if (s.ball.x + BALL_R < line) continue;
    claim(r, s, 'the water');                            // loyalty and the dove read here
  }
  for (let i = r.helpers.length - 1; i >= 0; i--) {
    const hp = r.helpers[i];
    if (hp.x < line) continue;
    if (isLoyal(r.voyage, hp.animalId)) continue;
    r.helpers.splice(i, 1);
    r.spent.push(hp.animalId);
    lose(r.voyage, hp.animalId, 'left on an island the water reached');
  }
  if (r.tide >= 1) endRescue(r, 'the water closed over the last of it');
  return r;
}

/* --------------------------------------------------------------------- verbs */

/** Flick a stranded animal toward the boat. Costs one step of tide. */
export function flick(r, entry, angle, power) {
  if (r.over || !entry || entry.state !== 'ashore') return false;
  if (!isSettled(r.world)) return false;
  strike(r.world, entry.ball, angle, Math.min(TUNING.maxPower, power));
  r.shots++;
  if (r.freeFlick) { r.freeFlick = false; note(r, 'That one was free.', 'magic1'); }
  else advanceTide(r, 1);
  return true;
}

/**
 * Put a carried animal down on an obstacle.
 *
 * Answering the obstacle clears it for good and the animal stays there holding it open.
 * Getting it wrong costs nothing but the answer -- no tide, no animal -- because a
 * mechanic that punishes you for LEARNING what an animal does is a mechanic nobody
 * learns.
 */
export function placeHelper(r, animalId, obstacle) {
  if (r.over) return false;
  const a = ANIMAL_BY_ID[animalId];
  if (!a || !obstacle || obstacle.cleared) return false;
  if (r.voyage.aboard.indexOf(animalId) < 0) return false;
  const ab = abilityOf(a);
  const need = obstacle.ob.clearedBy;
  if (!need) {
    note(r, `Nothing clears a ${obstacle.ob.name.toLowerCase()}. Go around it.`, 'amber');
    return false;
  }
  if (ab.id !== need) {
    note(r, `${a.name} cannot answer that. It needs ${need.toUpperCase()}.`, 'red2');
    return false;
  }
  obstacle.cleared = true;
  applyObstacles(r);
  r.cleared++;
  r.voyage.stats.obstaclesCleared++;
  const ix = r.voyage.aboard.indexOf(animalId);
  r.voyage.aboard.splice(ix, 1);
  r.helpers.push({
    animalId, ability: ab.id, obId: obstacle.id,
    x: obstacle.x - obstacle.r - 8, y: obstacle.y,
  });
  note(r, obstacle.ob.cleared || 'Cleared.', 'leaf4');
  advanceTide(r, 1);
  syncGates(r);
  return true;
}

/**
 * Spend something out of the basket.
 *
 * `entry` is the animal it is aimed at, and is only needed by the items that need one.
 * Every effect is a couple of lines, and the item is only consumed once its effect has
 * actually happened -- an apple thrown at nothing is still in the basket.
 */
export function useApple(r, itemId, entry) {
  if (r.over) return false;
  const item = ITEM_BY_ID[itemId];
  if (!item) return false;
  if (r.voyage.hold.indexOf(itemId) < 0) return false;

  switch (item.effect) {
    case 'loyal': {
      if (!entry) { note(r, 'Throw it at an animal.', 'parch1'); return false; }
      if (isLoyal(r.voyage, entry.animalId)) {
        note(r, 'That one already follows you.', 'parch1');
        return false;
      }
      useItem(r.voyage, itemId);
      makeLoyal(r.voyage, entry.animalId);
      r.voyage.stats.applesUsed++;
      const a = ANIMAL_BY_ID[entry.animalId];
      note(r, `${a ? a.name : 'It'} will follow you anywhere now.`, 'gold');
      return true;
    }
    case 'tide': {
      useItem(r.voyage, itemId);
      r.tide = Math.max(0, r.tide - r.step * (item.power || 2));
      r.voyage.stats.applesUsed++;
      note(r, 'The water hangs back.', 'water3');
      return true;
    }
    case 'call': {
      if (!entry || entry.state !== 'ashore') { note(r, 'Roll it at an animal.', 'parch1'); return false; }
      if (!isSettled(r.world)) return false;
      useItem(r.voyage, itemId);
      // straight at the nearest pen, at a power that gets there without a wall of noise
      const gy = Math.round(entry.ball.y / (FIELD_H / 3)) * (FIELD_H / 3) + FIELD_H / 6;
      const ang = Math.atan2(gy - entry.ball.y, GANGWAY_X - entry.ball.x);
      strike(r.world, entry.ball, ang, 1.15);
      r.voyage.stats.applesUsed++;
      note(r, 'It comes when called.', 'amber');
      return true;
    }
    case 'free': {
      useItem(r.voyage, itemId);
      r.freeFlick = true;
      r.voyage.stats.applesUsed++;
      note(r, 'The next one is between two waves.', 'magic1');
      return true;
    }
    case 'mend': {
      useItem(r.voyage, itemId);
      repairHull(r.voyage, item.power || 1);
      note(r, 'Planks and pitch. The hull holds.', 'wood4');
      return true;
    }
    default: return false;
  }
}

/** Kept as the old name: the scene and the tests both reach for it. */
export function throwApple(r, entry, itemId) {
  return useApple(r, itemId || 'loyal_apple', entry);
}

/* -------------------------------------------------------------------- ticking */

/** Advance the physics and turn its events into rescues and losses. */
export function update(r, dt) {
  if (r.noteT > 0) { r.noteT -= dt; if (r.noteT <= 0) r.note = null; }
  if (r.over) return [];
  const events = step(r.world, dt);
  const out = [];
  for (const e of events) {
    if (e.type === 'gate') {
      const s = entryOf(r, e.ball);
      if (!s) continue;
      s.state = 'aboard';
      if (takeAboard(r.voyage, s.animalId)) {
        r.rescued.push(s.animalId);
        out.push({ kind: 'rescued', animalId: s.animalId, x: e.x, y: e.y });
        syncGates(r);
      }
      continue;
    }
    if (e.type === 'zone') {
      const z = e.zone;
      const phys = z.physics;
      if (phys !== 'gap' && phys !== 'strike') continue;
      const s = entryOf(r, e.ball);
      if (!s || s.state !== 'ashore') continue;
      const spared = claim(r, s, z.kind, false);
      out.push({
        kind: spared ? 'saved' : 'lost', animalId: s.animalId, why: z.kind, x: e.x, y: e.y,
      });
      continue;
    }
    if (e.type === 'stop') {
      // resting in deep water or lava is the slow way to lose one
      const z = e.ball.zone;
      if (!z || z.physics !== 'kill') continue;
      const s = entryOf(r, e.ball);
      if (!s || s.state !== 'ashore') continue;
      const spared = claim(r, s, z.kind, true);   // resting in deep water: the rod applies
      out.push({
        kind: spared ? 'saved' : 'lost', animalId: s.animalId, why: z.kind,
        x: e.ball.x, y: e.ball.y,
      });
      continue;
    }
    out.push(e);
  }
  return out;
}

function entryOf(r, ball) {
  for (const s of r.strand) if (s.ball === ball) return s;
  return null;
}

/** Whoever is still standing out there and can still be reached. */
export function remaining(r) {
  return r.strand.filter((s) => s.state === 'ashore' && !s.ball.sunk);
}

/* ------------------------------------------------------------------- leaving */

/**
 * Cast off.
 *
 * Everything still ashore goes under, which is the point: you leave when the next animal
 * costs more than it is worth, and the game makes you look at what that decision was.
 * Helpers walk back aboard if there is a berth for them, and are lost if there is not --
 * so opening a path with your last spare berth is a bet.
 */
export function endRescue(r, why) {
  if (r.over) return r;
  r.over = true;
  r.why = why || 'cast off';
  for (const s of r.strand) {
    if (s.state !== 'ashore') continue;
    claim(r, s, 'left behind');
  }
  for (const hp of r.helpers.slice()) {
    if (takeAboard(r.voyage, hp.animalId)) continue;
    r.spent.push(hp.animalId);
    lose(r.voyage, hp.animalId, 'no berth left to bring it home');
  }
  r.helpers.length = 0;
  if (r.rescued.length > r.voyage.stats.bestRescue) r.voyage.stats.bestRescue = r.rescued.length;
  say(r.voyage, `${r.island.name}: ${r.rescued.length} saved, ${r.drowned.length} lost.`,
    r.rescued.length >= r.drowned.length ? 'leaf4' : 'rust');
  return r;
}

/** A short read for the summary panel. */
export function result(r) {
  return {
    island: r.island.id,
    rescued: r.rescued.slice(),
    drowned: r.drowned.slice(),
    spent: r.spent.slice(),
    cleared: r.cleared,
    shots: r.shots,
    tide: r.tide,
    why: r.why || null,
  };
}

export { isSettled };
